import { describe, it, expect, afterEach } from 'vitest';
import { runPipeline, searchExports, fileContext } from '../lib/mcp.js';
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

describe('searchExports()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function fixtureDir() {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-search-'));
    await writeFile(join(tmpDir, 'date.ts'), `
/**
 * Formats an ISO string to a local date.
 */
export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function diffDays(a: Date, b: Date): number {
  return 0;
}
`, 'utf-8');
    await writeFile(join(tmpDir, 'money.ts'), `
export function formatCurrency(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}
`, 'utf-8');
    return tmpDir;
  }

  it('finds exports by name substring with file:line locations', async () => {
    const dir = await fixtureDir();
    const result = await searchExports({ query: 'format', dirs: [dir], cwd: dir });

    expect(result).toContain('2 export(s) matching "format"');
    expect(result).toContain('formatLocal');
    expect(result).toContain('formatCurrency');
    expect(result).toMatch(/date\.ts:\d+/);
    expect(result).not.toContain('diffDays');
  });

  it('matches against JSDoc text too', async () => {
    const dir = await fixtureDir();
    const result = await searchExports({ query: 'ISO string', dirs: [dir], cwd: dir });
    expect(result).toContain('formatLocal');
    expect(result).not.toContain('formatCurrency');
  });

  it('returns a no-match message for unknown queries', async () => {
    const dir = await fixtureDir();
    const result = await searchExports({ query: 'zzz-nothing', dirs: [dir], cwd: dir });
    expect(result).toContain('No exports matching');
  });
});

describe('fileContext()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('returns the export block for a single file with line numbers', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-filectx-'));
    await writeFile(join(tmpDir, 'one.ts'), `
export function solo(x: number): number {
  return x;
}
`, 'utf-8');

    const result = await fileContext({ file: 'one.ts', cwd: tmpDir });
    expect(result).toContain('export function solo(x: number): number;');
    expect(result).toMatch(/\/\/ :\d+/);
    expect(result).not.toContain('return x');
  });

  it('reports missing and non-source files gracefully', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-filectx-'));
    await writeFile(join(tmpDir, 'notes.txt'), 'hello', 'utf-8');

    expect(await fileContext({ file: 'ghost.ts', cwd: tmpDir })).toContain('File not found');
    expect(await fileContext({ file: 'notes.txt', cwd: tmpDir })).toContain('Not a JS/TS source file');
  });
});
