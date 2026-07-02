import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadIgnoreFile, scanDirectory } from './scanner.js';
import { parseFile } from './parser.js';
import { compileMarkdown } from './compiler.js';

const AUTO_DETECT = ['src/utils', 'src/lib', 'src/helpers', 'utils', 'lib', 'src'];

/**
 * Runs the full scan → parse → compile pipeline and returns a markdown string.
 * Exported for unit testing without spinning up the MCP stdio transport.
 */
export async function runPipeline({ dirs, ignore = [], cwd = process.cwd() }) {
  const fileIgnores = await loadIgnoreFile(cwd);
  const ignorePatterns = [...ignore, ...fileIgnores];

  let files = [];
  for (const dir of dirs) {
    const abs = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
    files.push(...await scanDirectory(abs, ignorePatterns));
  }
  files = [...new Set(files)].sort();

  if (files.length === 0) {
    return '(No source files found in the given directories.)';
  }

  const scannedFiles = await Promise.all(files.map(f => parseFile(f)));
  const baseDirAbs = dirs.length === 1
    ? (path.isAbsolute(dirs[0]) ? dirs[0] : path.resolve(cwd, dirs[0]))
    : cwd;

  return compileMarkdown(scannedFiles, baseDirAbs);
}

/** Starts the MCP stdio server. Blocks until the client disconnects. */
export async function startMcpServer() {
  const server = new McpServer({ name: 'contextsnap', version: '2.0.0' });

  server.tool(
    'get_context',
    'Scans the given directories and returns a token-optimized markdown snapshot of all exported functions, classes, and constants. Paste the result into your prompt to give the AI full knowledge of existing utilities.',
    {
      dirs: z.array(z.string()).optional().describe(
        'Directories to scan relative to cwd. Defaults to common util folders (src/utils, lib, src, …).'
      ),
      ignore: z.array(z.string()).optional().describe(
        'Patterns to skip — whole-name match, * wildcards supported (e.g. __tests__, *.mock.*).'
      ),
    },
    async ({ dirs, ignore }) => {
      const targetDirs = dirs?.length > 0 ? dirs : AUTO_DETECT;
      const markdown = await runPipeline({
        dirs: targetDirs,
        ignore: ignore ?? [],
        cwd: process.cwd(),
      });
      return {
        content: [{ type: 'text', text: markdown }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
