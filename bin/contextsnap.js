#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { scanDirectory, loadIgnoreFile } from '../lib/scanner.js';
import { parseFile } from '../lib/parser.js';
import { compileMarkdown, generateASCIITree } from '../lib/compiler.js';
import { copyToClipboard } from '../lib/clipboard.js';

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
    --ignore=<pattern>   Skip files/folders matching <pattern>. Plain patterns
                         match whole folder/file names; * wildcards supported
                         (repeatable: --ignore=__tests__ --ignore=*.mock.*)
    -h, --help           Show this help

  A ${'.contextsnapignore'} file in the current directory adds patterns
  (one per line, # for comments).

  Examples:
    contextsnap                          # auto-detect your utils folder
    contextsnap src/utils src/hooks      # scan multiple folders
    contextsnap src --ignore=__tests__   # skip test files
    contextsnap src --clipboard-only     # no file written
    contextsnap src --stdout > ctx.md    # redirect anywhere

  Then paste (Cmd+V / Ctrl+V) into Claude, ChatGPT or Gemini and prompt away.
`;

async function isDirectory(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Reads dependency names from ./package.json for stack context, if present. */
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

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const clipboardOnly = args.includes('--clipboard-only');
  const stdoutMode = args.includes('--stdout');
  const cliIgnores = args
    .filter(a => a.startsWith('--ignore='))
    .map(a => a.slice('--ignore='.length))
    .filter(Boolean);

  // In --stdout mode all decoration goes to stderr so stdout stays pipeable
  const info = stdoutMode ? console.error : console.log;

  const fileIgnores = await loadIgnoreFile(process.cwd());
  const ignorePatterns = [...cliIgnores, ...fileIgnores];

  let targetDirs = args.filter(a => !a.startsWith('-'));

  // No directory given — try common utility folders
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

  // Validate all target directories
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

  // Single dir: paths shown relative to it. Multiple: relative to cwd.
  const baseDir = absTargets.length === 1 ? absTargets[0] : process.cwd();

  // Spinning loader (suppressed in --stdout mode to keep stdout clean)
  let spinner;
  if (!stdoutMode) {
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
      files.push(...await scanDirectory(abs, ignorePatterns));
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

  // Parse all files
  const scannedFiles = await Promise.all(files.map(f => parseFile(f)));

  stopSpinner();

  // Display ASCII tree
  info(generateASCIITree(scannedFiles, baseDir));

  const hasExports = scannedFiles.some(f => f.exports.length > 0);
  if (!hasExports) {
    info(`\x1b[33m⚠ Scanned ${scannedFiles.length} file(s) but found no exports.\x1b[0m`);
    info(`  contextsnap looks for: export function/const/class/interface/type,`);
    info(`  export default, export { ... }, and CommonJS module.exports.`);
    process.exit(0);
  }

  // Compile markdown
  const stack = await detectStack();
  const markdown = compileMarkdown(scannedFiles, baseDir, { stack });
  const tokenEstimate = Math.round(markdown.length / 4);

  // --stdout: print and exit — no clipboard, no file
  if (stdoutMode) {
    process.stdout.write(markdown);
    info(`\n  \x1b[1;32m✔ Context written to stdout. (~${tokenEstimate.toLocaleString()} tokens)\x1b[0m`);
    return;
  }

  // Write .ai-context.md
  if (!clipboardOnly) {
    const outPath = path.join(process.cwd(), CONTEXT_FILE);
    await fs.writeFile(outPath, markdown, 'utf-8');
  }

  // Copy to clipboard
  const copied = await copyToClipboard(markdown);

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

main();
