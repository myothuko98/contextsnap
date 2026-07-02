import { describe, it, expect, afterEach } from 'vitest';
import { runPipeline } from '../lib/mcp.js';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

describe('runPipeline()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('returns markdown with export signatures for a scanned directory', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-mcp-'));
    await writeFile(join(tmpDir, 'math.ts'), `
/**
 * Adds two numbers.
 */
export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`, 'utf-8');

    const result = await runPipeline({ dirs: [tmpDir], cwd: tmpDir });

    expect(result).toContain('# CONTEXTSNAP CODEBASE CONTEXT');
    expect(result).toContain('export function add');
    expect(result).toContain('PI');
    expect(result).not.toContain('return a + b'); // body stripped
  });

  it('returns a no-files message when the directory is empty', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-mcp-'));
    const result = await runPipeline({ dirs: [tmpDir], cwd: tmpDir });
    expect(result).toMatch(/no source files/i);
  });

  it('respects ignore patterns', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-mcp-'));
    await writeFile(join(tmpDir, 'utils.ts'), 'export function keep() {}', 'utf-8');
    await writeFile(join(tmpDir, 'utils.mock.ts'), 'export function skip() {}', 'utf-8');

    const result = await runPipeline({
      dirs: [tmpDir],
      ignore: ['*.mock.*'],
      cwd: tmpDir,
    });

    expect(result).toContain('keep');
    expect(result).not.toContain('skip');
  });
});
