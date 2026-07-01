#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { scanDirectory } from '../lib/scanner.js';
import { parseFile } from '../lib/parser.js';
import { compileMarkdown, generateASCIITree } from '../lib/compiler.js';
import { copyToClipboard } from '../lib/clipboard.js';

const CONTEXT_FILE = '.ai-context.md';
const MAX_FILES = 300;

async function main() {
  const args = process.argv.slice(2);
  const writeFile = !args.includes('--no-file');
  const targetDir = args.find(a => !a.startsWith('--'));

  if (!targetDir) {
    console.error('\x1b[31m✘ Usage: contextify <directory> [--no-file]\x1b[0m');
    process.exit(1);
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
    files = await scanDirectory(absTarget);
  } catch (err) {
    clearInterval(spinner);
    console.error(`\n\x1b[31m✘ Error scanning directory: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  if (files.length > MAX_FILES) {
    clearInterval(spinner);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    console.error(`\x1b[33m⚠ Too many files (${files.length}). Limit is ${MAX_FILES}. Narrow your target directory.\x1b[0m`);
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
    console.log(`\x1b[33m⚠ No exportable functions found. Fallback file not created.\x1b[0m`);
    process.exit(0);
  }

  // Compile markdown
  const markdown = compileMarkdown(scannedFiles);

  // Write .ai-context.md
  if (writeFile) {
    const outPath = path.join(process.cwd(), CONTEXT_FILE);
    await fs.writeFile(outPath, markdown, 'utf-8');
  }

  // Copy to clipboard
  const copied = await copyToClipboard(markdown);
  const tokenEstimate = Math.round(markdown.length / 4);

  if (copied) {
    console.log(`\n  \x1b[1;32m✔ Copied to clipboard! (Saved ~${tokenEstimate} token cycles)\x1b[0m`);
    console.log(`  \x1b[37mPaste directly into your LLM window.\x1b[0m`);
  } else {
    console.log(`\n  \x1b[33m⚠ Clipboard copy failed. Copy from .ai-context.md manually.\x1b[0m`);
  }

  process.stdout.write('\x07'); // terminal bell
}

main();
