#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { scanDirectory, loadIgnoreFile } from '../lib/scanner.js';
import { parseFile } from '../lib/parser.js';
import { compileMarkdown, compileJSON, generateASCIITree } from '../lib/compiler.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { loadConfig } from '../lib/config.js';

const CONTEXT_FILE = '.ai-context.md';
const MAX_FILES = 300;
const MAX_STACK_DEPS = 20;
const AUTO_DETECT_DIRS = ['src/utils', 'src/lib', 'src/helpers', 'utils', 'lib', 'src'];

const HELP = `
  contextsnap — snapshot your code's exports for pasting into an AI chat

  Usage:
    contextsnap [directory ...] [options]

  If no directory is given, contextsnap auto-detects the first of:
    ${AUTO_DETECT_DIRS.join(', ')}

  Options:
    --clipboard-only     Don't write ${CONTEXT_FILE}; copy to clipboard only
    --stdout             Print the markdown to stdout (no clipboard, no file);
                         great for piping: contextsnap src --stdout | pbcopy
    --watch              Re-run on every source file change (Ctrl+C to stop)
    --format=<fmt>       Output format: markdown (default) or json
    --ignore=<pattern>   Skip files/folders matching <pattern>. Plain patterns
                         match whole folder/file names; * wildcards supported
                         (repeatable: --ignore=__tests__ --ignore=*.mock.*)
    --mcp                Start an MCP stdio server for Claude Desktop / Cursor
    -h, --help           Show this help

  A ${'.contextsnaprc.json'} file in the current directory sets persistent defaults.
  A ${'.contextsnapignore'} file adds ignore patterns (one per line, # for comments).

  Examples:
    contextsnap                          # auto-detect your utils folder
    contextsnap src/utils src/hooks      # scan multiple folders
    contextsnap src --ignore=__tests__   # skip test files
    contextsnap src --clipboard-only     # no file written
    contextsnap src --stdout > ctx.md    # redirect anywhere
    contextsnap src --watch              # live refresh on save
    contextsnap src --format=json        # machine-readable output
    contextsnap --mcp                    # start MCP server

  Then paste (Cmd+V / Ctrl+V) into Claude, ChatGPT or Gemini and prompt away.
`;

async function isDirectory(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function detectStack() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.keys(deps).slice(0, MAX_STACK_DEPS);
  } catch {
    return [];
  }
}

/** Runs scan → parse → output once. Returns when done. */
async function runOnce({ absTargets, baseDir, allIgnores, clipboardOnly, stdoutMode, format, info, silent }) {
  // Spinning loader (suppressed in --stdout mode and in silent watch refreshes)
  let spinner;
  if (!stdoutMode && !silent) {
    const frames = ['[ / ]', '[ - ]', '[ \\ ]', '[ | ]'];
    let frame = 0;
    spinner = setInterval(() => {
      process.stdout.write(`\r\x1b[32m${frames[frame++ % frames.length]}\x1b[0m scanning codebase structures...`);
    }, 100);
  }
  const stopSpinner = () => {
    if (spinner) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
  };

  let files = [];
  try {
    for (const abs of absTargets) {
      files.push(...await scanDirectory(abs, allIgnores));
    }
    files = [...new Set(files)].sort();
  } catch (err) {
    stopSpinner();
    console.error(`\n\x1b[31m✘ Error scanning directory: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  if (files.length > MAX_FILES) {
    stopSpinner();
    console.error(`\x1b[33m⚠ Too many files (${files.length}). Limit is ${MAX_FILES}.\x1b[0m`);
    console.error(`  Point at a smaller folder (e.g. src/utils) or exclude folders with --ignore=<pattern>.`);
    process.exit(1);
  }

  const scannedFiles = await Promise.all(files.map(f => parseFile(f)));
  stopSpinner();

  for (const f of scannedFiles) {
    for (const w of f.warnings ?? []) {
      info(`\x1b[33m⚠ ${path.relative(baseDir, f.filepath)}: ${w}\x1b[0m`);
    }
  }

  info(generateASCIITree(scannedFiles, baseDir));

  const hasExports = scannedFiles.some(f => f.exports.length > 0);
  if (!hasExports) {
    info(`\x1b[33m⚠ Scanned ${scannedFiles.length} file(s) but found no exports.\x1b[0m`);
    info(`  contextsnap looks for: export function/const/let/var/class/interface/type/enum,`);
    info(`  export default, export { ... }, export * from, and CommonJS module.exports.`);
    return;
  }

  const stack = await detectStack();
  const output = format === 'json'
    ? compileJSON(scannedFiles, baseDir, { stack })
    : compileMarkdown(scannedFiles, baseDir, { stack });
  const tokenEstimate = Math.round(output.length / 4);

  if (stdoutMode) {
    process.stdout.write(output);
    info(`\n  \x1b[1;32m✔ Context written to stdout. (~${tokenEstimate.toLocaleString()} tokens)\x1b[0m`);
    return;
  }

  if (!clipboardOnly) {
    await fs.writeFile(path.join(process.cwd(), CONTEXT_FILE), output, 'utf-8');
  }

  const copied = await copyToClipboard(output);

  if (copied) {
    console.log(`\n  \x1b[1;32m✔ Copied to clipboard! (~${tokenEstimate.toLocaleString()} tokens)\x1b[0m`);
    console.log(`  \x1b[37mPaste directly into your LLM window.\x1b[0m`);
  } else if (clipboardOnly) {
    console.log(`\n  \x1b[31m✘ Clipboard copy failed and --clipboard-only was set — no output produced.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\n  \x1b[33m⚠ Clipboard copy failed. Copy from ${CONTEXT_FILE} manually.\x1b[0m`);
  }

  process.stdout.write('\x07'); // terminal bell
}

async function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  // Load persistent config first (CLI flags override below)
  const config = await loadConfig(cwd);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  // MCP server mode: start and block (early exit — no other flags apply)
  if (args.includes('--mcp')) {
    const { startMcpServer } = await import('../lib/mcp.js');
    await startMcpServer();
    return;
  }

  // Merge CLI flags with config (CLI always wins)
  const clipboardOnly = args.includes('--clipboard-only') || (config.clipboardOnly ?? false);
  const stdoutMode    = args.includes('--stdout')         || (config.stdout       ?? false);
  const watchMode     = args.includes('--watch');
  const format        = args.find(a => a.startsWith('--format='))?.slice('--format='.length)
                        ?? config.format ?? 'markdown';

  const cliIgnores = args
    .filter(a => a.startsWith('--ignore='))
    .map(a => a.slice('--ignore='.length))
    .filter(Boolean);

  // In --stdout mode all decoration goes to stderr so stdout stays pipeable
  const info = stdoutMode ? console.error : console.log;

  const fileIgnores = await loadIgnoreFile(cwd);
  const allIgnores  = [...cliIgnores, ...(config.ignore ?? []), ...fileIgnores];

  // Target dirs: CLI args > config.dirs > auto-detect
  let targetDirs = args.filter(a => !a.startsWith('-'));
  if (targetDirs.length === 0 && config.dirs?.length > 0) {
    targetDirs = config.dirs;
    info(`\x1b[36mℹ Using directories from .contextsnaprc: ${targetDirs.join(', ')}\x1b[0m`);
  }

  if (targetDirs.length === 0) {
    for (const candidate of AUTO_DETECT_DIRS) {
      if (await isDirectory(path.resolve(candidate))) {
        targetDirs = [candidate];
        break;
      }
    }
    if (targetDirs.length > 0) {
      info(`\x1b[36mℹ No directory given — auto-detected '${targetDirs[0]}'.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✘ No directory given and none of the usual folders (${AUTO_DETECT_DIRS.join(', ')}) exist.\x1b[0m`);
      console.error(`  Usage: contextsnap <directory ...> [--clipboard-only] [--stdout] [--ignore=<pattern>]  (see --help)`);
      process.exit(1);
    }
  }

  // Validate all target directories exist
  const absTargets = [];
  for (const dir of targetDirs) {
    const abs = path.resolve(dir);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) {
        console.error(`\x1b[31m✘ Error: '${dir}' is not a directory.\x1b[0m`);
        process.exit(1);
      }
    } catch {
      console.error(`\x1b[31m✘ Error: Directory '${dir}' does not exist.\x1b[0m`);
      process.exit(1);
    }
    absTargets.push(abs);
  }

  const baseDir = absTargets.length === 1 ? absTargets[0] : cwd;
  const runOpts = { absTargets, baseDir, allIgnores, clipboardOnly, stdoutMode, format, info };

  await runOnce({ ...runOpts, silent: false });

  if (watchMode) {
    const { watchDirs } = await import('../lib/watcher.js');
    info(`\x1b[36mℹ Watch mode active — re-running on file changes. Press Ctrl+C to stop.\x1b[0m`);
    const stop = watchDirs(absTargets, async () => {
      await runOnce({ ...runOpts, silent: true });
      info(`\x1b[36m[Contextsnap] Refreshed at ${new Date().toLocaleTimeString()}\x1b[0m`);
    });
    process.on('SIGINT', () => { stop(); process.exit(0); });
    // Watchers keep the event loop alive; no explicit wait needed
  }
}

main();
