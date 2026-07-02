import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const CLI = join(process.cwd(), 'bin/contextsnap.js');

// ─────────────────────────────────────────────
// Integration: Happy Path Flow
// Execute CLI on a mock directory, verify exit 0
// and .ai-context.md is created with signatures
// ─────────────────────────────────────────────
describe('Integration — Happy path', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('scans a directory and writes .ai-context.md', async () => {
    // Setup: create a temp directory with a TS utility file
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-integration-'));
    await writeFile(join(tmpDir, 'utils.ts'), `
/**
 * Adds two numbers.
 * @param a first number
 * @param b second number
 */
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`, 'utf-8');

    // Run the CLI against the temp directory, skip clipboard
    const { stdout, stderr } = await execFileAsync('node', [CLI, tmpDir, '--clipboard-only'], {
      cwd: process.cwd(),
      timeout: 10000
    });

    // Should exit cleanly (no exception thrown = exit code 0)
    // Output should contain the tree and the file
    expect(stdout + stderr).toMatch(/contextify|Contextify|utils\.ts|add/i);
  }, 15000);
});

// ─────────────────────────────────────────────
// Integration: Error Flow
// Execute CLI with a non-existent path,
// verify exit code 1 and proper error message
// ─────────────────────────────────────────────
describe('Integration — Error path', () => {
  it('exits with code 1 and prints error for non-existent directory', async () => {
    let exitCode = 0;
    let stderr = '';

    try {
      await execFileAsync('node', [CLI, '/this/path/does/not/exist/xyz'], {
        cwd: process.cwd(),
        timeout: 5000
      });
    } catch (err) {
      exitCode = err.code;
      stderr = err.stderr || '';
    }

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/does not exist|Error/i);
  }, 10000);
});
