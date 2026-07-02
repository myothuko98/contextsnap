import { describe, it, expect, afterEach } from 'vitest';
import { scanDirectory, loadIgnoreFile } from '../lib/scanner.js';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join, basename } from 'path';
import os from 'os';

describe('scanDirectory()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function tree() {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-scan-'));
    await mkdir(join(tmpDir, 'dist'));
    await mkdir(join(tmpDir, '__tests__'));
    await writeFile(join(tmpDir, 'index.ts'), 'export const a = 1;');
    await writeFile(join(tmpDir, 'distribution.ts'), 'export const b = 2;');
    await writeFile(join(tmpDir, 'api.mock.ts'), 'export const c = 3;');
    await writeFile(join(tmpDir, 'dist', 'bundle.js'), 'export const d = 4;');
    await writeFile(join(tmpDir, '__tests__', 'index.test.ts'), 'export const e = 5;');
    return tmpDir;
  }

  it('finds all source files with no ignore patterns', async () => {
    const dir = await tree();
    const files = await scanDirectory(dir);
    expect(files).toHaveLength(5);
  });

  it('plain pattern matches whole segment, not substring', async () => {
    const dir = await tree();
    const files = await scanDirectory(dir, ['dist']);
    const names = files.map(f => basename(f));
    expect(names).not.toContain('bundle.js');       // dist/ skipped
    expect(names).toContain('distribution.ts');     // substring NOT skipped
  });

  it('supports * wildcards', async () => {
    const dir = await tree();
    const files = await scanDirectory(dir, ['*.mock.*']);
    const names = files.map(f => basename(f));
    expect(names).not.toContain('api.mock.ts');
    expect(names).toContain('index.ts');
  });

  it('skips folders matched by pattern', async () => {
    const dir = await tree();
    const files = await scanDirectory(dir, ['__tests__']);
    const names = files.map(f => basename(f));
    expect(names).not.toContain('index.test.ts');
  });
});

describe('loadIgnoreFile()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('reads patterns, skipping blanks and comments', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-ign-'));
    await writeFile(join(tmpDir, '.contextsnapignore'), `
# build output
dist

*.mock.*
`);
    const patterns = await loadIgnoreFile(tmpDir);
    expect(patterns).toEqual(['dist', '*.mock.*']);
  });

  it('returns empty array when file is missing', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-ign-'));
    const patterns = await loadIgnoreFile(tmpDir);
    expect(patterns).toEqual([]);
  });
});
