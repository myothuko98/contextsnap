import path from 'path';
import fs from 'fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadIgnoreFile, scanDirectory } from './scanner.js';
import { parseFile } from './parser.js';
import { compileMarkdown, importHint } from './compiler.js';

const AUTO_DETECT = ['src/utils', 'src/lib', 'src/helpers', 'utils', 'lib', 'src'];
const SEARCH_RESULT_CAP = 25;

async function packageVersion() {
  try {
    const raw = await fs.readFile(new URL('../package.json', import.meta.url), 'utf-8');
    return JSON.parse(raw).version;
  } catch {
    return '0.0.0';
  }
}

/** Shared scan → parse step for all pipeline entry points. */
async function scanAndParse({ dirs, ignore = [], cwd = process.cwd() }) {
  const fileIgnores = await loadIgnoreFile(cwd);
  const ignorePatterns = [...ignore, ...fileIgnores];

  let files = [];
  for (const dir of dirs) {
    const abs = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
    // Auto-detect candidates may not exist in this project — skip, don't throw
    try {
      if (!(await fs.stat(abs)).isDirectory()) continue;
    } catch {
      continue;
    }
    files.push(...await scanDirectory(abs, ignorePatterns));
  }
  files = [...new Set(files)].sort();

  const scannedFiles = await Promise.all(files.map(f => parseFile(f)));
  const baseDirAbs = dirs.length === 1
    ? (path.isAbsolute(dirs[0]) ? dirs[0] : path.resolve(cwd, dirs[0]))
    : cwd;

  return { scannedFiles, baseDirAbs };
}

/**
 * Runs the full scan → parse → compile pipeline and returns a markdown string.
 * Exported for unit testing without spinning up the MCP stdio transport.
 */
export async function runPipeline({ dirs, ignore = [], cwd = process.cwd() }) {
  const { scannedFiles, baseDirAbs } = await scanAndParse({ dirs, ignore, cwd });

  if (scannedFiles.length === 0) {
    return '(No source files found in the given directories.)';
  }

  return compileMarkdown(scannedFiles, baseDirAbs);
}

/**
 * Searches all exports for a case-insensitive substring match against the
 * export name, signature, or JSDoc. Returns a compact markdown result list
 * with file:line locations so the caller can jump straight to a definition.
 */
export async function searchExports({ query, dirs, ignore = [], cwd = process.cwd() }) {
  const { scannedFiles, baseDirAbs } = await scanAndParse({ dirs, ignore, cwd });
  const needle = query.toLowerCase();

  const matches = [];
  for (const file of scannedFiles) {
    const rel = path.relative(baseDirAbs, file.filepath).replace(/\\/g, '/');
    for (const exp of file.exports) {
      const haystack = `${exp.name}\n${exp.signature}\n${exp.jsdoc ?? ''}`.toLowerCase();
      if (haystack.includes(needle)) {
        matches.push({ rel, exp });
      }
    }
  }

  if (matches.length === 0) {
    return `No exports matching "${query}".`;
  }

  const shown = matches.slice(0, SEARCH_RESULT_CAP);
  let md = `${matches.length} export(s) matching "${query}":\n\n`;
  for (const { rel, exp } of shown) {
    md += `- \`${rel}:${exp.line ?? '?'}\` — \`${exp.signature}\`\n`;
    if (exp.jsdoc) {
      const firstLine = exp.jsdoc.split('\n').map(l => l.replace(/^\s*\/?\*+\/?\s*/, '').trim()).find(Boolean);
      if (firstLine) md += `  ${firstLine}\n`;
    }
  }
  if (matches.length > shown.length) {
    md += `\n…and ${matches.length - shown.length} more. Narrow the query.\n`;
  }
  return md;
}

/**
 * Returns the context block (signatures, lines, JSDoc) for a single file.
 * Much cheaper than get_context when the caller already knows the file.
 */
export async function fileContext({ file, cwd = process.cwd() }) {
  const abs = path.isAbsolute(file) ? file : path.resolve(cwd, file);

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return `File not found: ${file}`;
  }
  if (!stat.isFile()) return `Not a file: ${file}`;
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(abs)) return `Not a JS/TS source file: ${file}`;

  const parsed = await parseFile(abs);
  if (parsed.exports.length === 0) {
    return `No exports found in ${file}.`;
  }

  // Compact single-file block — no snapshot preamble, just the contract
  let md = `## File: ${path.relative(cwd, abs).replace(/\\/g, '/')}\n`;
  md += '```typescript\n';
  md += `// import from '${importHint(abs, cwd)}'\n\n`;
  for (const exp of parsed.exports) {
    if (exp.jsdoc) md += `${exp.jsdoc}\n`;
    md += `${exp.signature}${exp.line ? ` // :${exp.line}` : ''}\n\n`;
  }
  md = md.trimEnd() + '\n```\n';

  if (parsed.warnings.length > 0) {
    md += `\n> Parser warnings: ${parsed.warnings.join('; ')}\n`;
  }
  return md;
}

/** Starts the MCP stdio server. Blocks until the client disconnects. */
export async function startMcpServer() {
  const server = new McpServer({ name: 'contextsnap', version: await packageVersion() });

  const dirsParam = z.array(z.string()).optional().describe(
    'Directories to scan relative to cwd. Defaults to common util folders (src/utils, lib, src, …).'
  );
  const ignoreParam = z.array(z.string()).optional().describe(
    'Patterns to skip — whole-name match, * wildcards supported (e.g. __tests__, *.mock.*).'
  );

  server.tool(
    'get_context',
    'Scans the given directories and returns a token-optimized markdown snapshot of all exported functions, classes, and constants. Paste the result into your prompt to give the AI full knowledge of existing utilities.',
    { dirs: dirsParam, ignore: ignoreParam },
    async ({ dirs, ignore }) => {
      const markdown = await runPipeline({
        dirs: dirs?.length > 0 ? dirs : AUTO_DETECT,
        ignore: ignore ?? [],
        cwd: process.cwd(),
      });
      return { content: [{ type: 'text', text: markdown }] };
    }
  );

  server.tool(
    'search_exports',
    'Searches all exports for a name, signature, or JSDoc substring and returns matches as file:line locations with signatures. Use this before writing a new utility to check whether one already exists, or to find where a known export is defined.',
    {
      query: z.string().describe('Case-insensitive substring to match against export names, signatures, and JSDoc.'),
      dirs: dirsParam,
      ignore: ignoreParam,
    },
    async ({ query, dirs, ignore }) => {
      const markdown = await searchExports({
        query,
        dirs: dirs?.length > 0 ? dirs : AUTO_DETECT,
        ignore: ignore ?? [],
        cwd: process.cwd(),
      });
      return { content: [{ type: 'text', text: markdown }] };
    }
  );

  server.tool(
    'get_file_context',
    'Returns the export signatures, source line numbers, and JSDoc for a single file. Much cheaper than get_context when you already know which file you need.',
    {
      path: z.string().describe('File path relative to cwd (or absolute).'),
    },
    async ({ path: file }) => {
      const markdown = await fileContext({ file, cwd: process.cwd() });
      return { content: [{ type: 'text', text: markdown }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
