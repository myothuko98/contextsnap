#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { scanDirectory } from '../lib/scanner.js';
import { parseFile } from '../lib/parser.js';
import { compileMarkdown, generateASCIITree } from '../lib/compiler.js';
import { copyToClipboard } from '../lib/clipboard.js';

const CONTEXT_FILE = '.ai-context.md';
const MAX_FILES = 300;
const AUTO_DETECT_DIRS = ['src/utils', 'src/lib', 'src/helpers', 'utils', 'lib', 'src'];

const HELP = `
  contextsnap — snapshot your code's exports for pasting into an AI chat

  Usage:
    contextsnap [directory] [options]

  If no directory is given, contextsnap auto-detects the first of:
    ${AUTO_DETECT_DIRS.join(', ')}

  Options:
    --clipboard-only     Don't write ${CONTEXT_FILE}; copy to clipboard only
    --ignore=<pattern>   Skip files/folders whose path contains <pattern>
                         (repeatable: --ignore=__tests__ --ignore=.mock)
    -h, --help           Show this help

  Examples:
    contextsnap                          # auto-detect your utils folder
    contextsnap src/utils                # scan a specific folder
    contextsnap src --ignore=__tests__   # skip test files
    contextsnap src --clipboard-only     # no file written

  Then paste (Cmd+V / Ctrl+V) into Claude, ChatGPT or Gemini and prompt away.
`;

async function isDirectory(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const clipboardOnly = args.includes('--clipboard-only');
  const ignorePatterns = args
    .filter(a => a.startsWith('--ignore='))
    .map(a => a.slice('--ignore='.length))
    .filter(Boolean);

  let targetDir = args.find(a => !a.startsWith('-'));

  // No directory given — try common utility folders
  if (!targetDir) {
    for (const candidate of AUTO_DETECT_DIRS) {
      if (await isDirectory(path.resolve(candidate))) {
        targetDir = candidate;
        break;
      }
    }
    if (targetDir) {
      console.log(`\x1b[36mℹ No directory given — auto-detected '${targetDir}'.\x1b[0m`);
    } else {
      console.error(`\x1b[31m✘ No directory given and none of the usual folders (${AUTO_DETECT_DIRS.join(', ')}) exist.\x1b[0m`);
      console.error(`  Usage: contextsnap <directory> [--clipboard-only] [--ignore=<pattern>]  (see --help)`);
      process.exit(1);
    }
  }

  const absTarget = path.resolve(targetDir);

  // Validate directory exists
  try {
    const stat = await fs.stat(absTarget);
    if (!stat.isDirectory()) {
      console.error(`\x1b[31m✘ Error: '${targetDir}' is not a directory.\x1b[0m`);
      process.exit(1);
    }
  } catch {
    console.error(`\x1b[31m✘ Error: Directory '${targetDir}' does not exist.\x1b[0m`);
    process.exit(1);
  }

  // Spinning loader
  const frames = ['[ / ]', '[ - ]', '[ \\ ]', '[ | ]'];
  let frame = 0;
  const spinner = setInterval(() => {
    process.stdout.write(`\r\x1b[32m${frames[frame++ % frames.length]}\x1b[0m scanning codebase structures...`);
  }, 100);

  let files;
  try {
    files = await scanDirectory(absTarget, ignorePatterns);
  } catch (err) {
    clearInterval(spinner);
    console.error(`\n\x1b[31m✘ Error scanning directory: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  if (files.length > MAX_FILES) {
    clearInterval(spinner);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    console.error(`\x1b[33m⚠ Too many files (${files.length}). Limit is ${MAX_FILES}.\x1b[0m`);
    console.error(`  Point at a smaller folder (e.g. src/utils) or exclude folders with --ignore=<pattern>.`);
    process.exit(1);
  }

  // Parse all files
  const scannedFiles = await Promise.all(files.map(f => parseFile(f)));

  clearInterval(spinner);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  // Display ASCII tree
  console.log(generateASCIITree(scannedFiles, absTarget));

  const hasExports = scannedFiles.some(f => f.exports.length > 0);
  if (!hasExports) {
    console.log(`\x1b[33m⚠ Scanned ${scannedFiles.length} file(s) but found no exports.\x1b[0m`);
    console.log(`  contextsnap looks for: export function/const/class/interface/type,`);
    console.log(`  export default, and export { ... } statements.`);
    console.log(`  Files using module.exports (CommonJS) are not supported yet.`);
    process.exit(0);
  }

  // Compile markdown
  const markdown = compileMarkdown(scannedFiles, absTarget);

  // Write .ai-context.md
  if (!clipboardOnly) {
    const outPath = path.join(process.cwd(), CONTEXT_FILE);
    await fs.writeFile(outPath, markdown, 'utf-8');
  }

  // Copy to clipboard
  const copied = await copyToClipboard(markdown);
  const tokenEstimate = Math.round(markdown.length / 4);

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
