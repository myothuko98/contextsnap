#!/usr/bin/env node
/**
 * contextsnap GitHub Action entrypoint.
 * GitHub passes `with:` inputs as INPUT_<NAME> environment variables.
 * Uses console.log for ::set-output (supported by all GitHub runners).
 */
import path from 'path';
import { writeFile, appendFile } from 'fs/promises';
import { scanDirectory, loadIgnoreFile } from '../lib/scanner.js';
import { parseFile } from '../lib/parser.js';
import { compileMarkdown } from '../lib/compiler.js';

const cwd = process.cwd();
const CONTEXT_FILE = '.ai-context.md';
const AUTO_DETECT = ['src/utils', 'src/lib', 'src/helpers', 'utils', 'lib', 'src'];

function getInput(name) {
  return (process.env[`INPUT_${name.toUpperCase()}`] || '').trim();
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

async function run() {
  try {
    const dirsInput = getInput('dirs');
    const ignoreInput = getInput('ignore');

    const dirs = dirsInput ? dirsInput.split(/\s+/).filter(Boolean) : [];
    const cliIgnores = ignoreInput ? ignoreInput.split(/\s+/).filter(Boolean) : [];
    const targetDirs = dirs.length > 0 ? dirs : AUTO_DETECT;

    const fileIgnores = await loadIgnoreFile(cwd);
    const ignorePatterns = [...cliIgnores, ...fileIgnores];

    let files = [];
    const resolvedDirs = [];
    for (const dir of targetDirs) {
      const abs = path.resolve(cwd, dir);
      try {
        const found = await scanDirectory(abs, ignorePatterns);
        files.push(...found);
        resolvedDirs.push(abs);
      } catch {
        // Directory doesn't exist — skip silently
      }
    }

    if (files.length === 0) {
      console.log('[contextsnap] No source files found. Skipping.');
      return;
    }

    files = [...new Set(files)].sort();
    const scannedFiles = await Promise.all(files.map(f => parseFile(f)));
    const baseDir = resolvedDirs.length === 1 ? resolvedDirs[0] : cwd;
    const markdown = compileMarkdown(scannedFiles, baseDir);

    await writeFile(path.join(cwd, CONTEXT_FILE), markdown, 'utf-8');

    const tokenEstimate = Math.round(markdown.length / 4);
    console.log(`[contextsnap] Written ${CONTEXT_FILE} (~${tokenEstimate.toLocaleString()} tokens)`);

    await setOutput('context-file', CONTEXT_FILE);
    await setOutput('token-estimate', String(tokenEstimate));
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}

run();
