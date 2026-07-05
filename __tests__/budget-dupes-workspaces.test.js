import { describe, it, expect, afterEach } from 'vitest';
import { applyBudget } from '../lib/budget.js';
import { findDuplicates } from '../lib/dupes.js';
import { detectWorkspaces } from '../lib/workspaces.js';
import { countImportUsage } from '../lib/usage.js';
import { importHint } from '../lib/compiler.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

// ─────────────────────────────────────────────
// Unit: applyBudget
// ─────────────────────────────────────────────
describe('applyBudget()', () => {
  const exp = (name, sigLen = 60) => ({
    name,
    type: 'function',
    signature: 'x'.repeat(sigLen),
  });
  const files = [
    { filepath: '/p/a.ts', exports: [exp('popular'), exp('unused')], warnings: [] },
    { filepath: '/p/b.ts', exports: [exp('alsoUnused')], warnings: [] },
  ];

  it('keeps everything when the budget is large enough', () => {
    const res = applyBudget(files, 100000, new Map([['popular', 5]]));
    expect(res.dropped).toHaveLength(0);
    expect(res.files).toHaveLength(2);
  });

  it('drops the least-imported exports first', () => {
    const usage = new Map([['popular', 5], ['unused', 0], ['alsoUnused', 0]]);
    const res = applyBudget(files, 180, usage);

    expect(res.dropped.map(d => d.name)).not.toContain('popular');
    expect(res.dropped.length).toBeGreaterThan(0);
    const kept = res.files.flatMap(f => f.exports.map(e => e.name));
    expect(kept).toContain('popular');
  });

  it('removes files whose exports were all trimmed', () => {
    const usage = new Map([['popular', 5]]);
    const res = applyBudget(files, 175, usage);
    const keptFiles = res.files.map(f => f.filepath);
    expect(keptFiles).toContain('/p/a.ts');
    expect(keptFiles).not.toContain('/p/b.ts');
  });

  it('does not mutate the input', () => {
    const before = files[0].exports.length;
    applyBudget(files, 10, new Map());
    expect(files[0].exports.length).toBe(before);
  });
});

// ─────────────────────────────────────────────
// Unit: findDuplicates
// ─────────────────────────────────────────────
describe('findDuplicates()', () => {
  it('flags same word set in a different order across files', () => {
    const files = [
      { filepath: '/p/date.ts', exports: [{ name: 'formatDate', line: 3, signature: 's' }] },
      { filepath: '/p/fmt.ts', exports: [{ name: 'dateFormat', line: 8, signature: 's' }] },
    ];
    const dupes = findDuplicates(files);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reason).toBe('same words, different order');
  });

  it('flags identical names in different files, ignoring case style', () => {
    const files = [
      { filepath: '/p/a.ts', exports: [{ name: 'parseISO', line: 1, signature: 's' }] },
      { filepath: '/p/b.ts', exports: [{ name: 'parse_iso', line: 2, signature: 's' }] },
    ];
    const dupes = findDuplicates(files);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reason).toBe('same name');
  });

  it('does not flag overloads (same name, same file) or unrelated names', () => {
    const files = [
      {
        filepath: '/p/a.ts',
        exports: [
          { name: 'load', line: 1, signature: 's' },
          { name: 'load', line: 2, signature: 's' }, // TS overload
          { name: 'save', line: 3, signature: 's' },
        ],
      },
    ];
    expect(findDuplicates(files)).toHaveLength(0);
  });

  it('ignores default exports and export lists', () => {
    const files = [
      { filepath: '/p/a.ts', exports: [{ name: 'default', line: 1, signature: 's' }] },
      { filepath: '/p/b.ts', exports: [{ name: 'default', line: 1, signature: 's' }, { name: 'a, b', line: 2, signature: 's' }] },
    ];
    expect(findDuplicates(files)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// Integration-ish: workspaces + usage against temp dirs
// ─────────────────────────────────────────────
describe('detectWorkspaces() & importHint()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('detects npm workspaces and rewrites cross-package hints', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-ws-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'root', workspaces: ['packages/*'],
    }), 'utf-8');
    await mkdir(join(tmpDir, 'packages/ui'), { recursive: true });
    await writeFile(join(tmpDir, 'packages/ui/package.json'), JSON.stringify({
      name: '@acme/ui',
    }), 'utf-8');

    const workspaces = await detectWorkspaces(tmpDir);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('@acme/ui');

    const file = join(tmpDir, 'packages/ui/src/button.ts');
    // Viewpoint outside the package → package name
    expect(importHint(file, tmpDir, workspaces)).toBe('@acme/ui');
    // Viewpoint inside the package → relative path as usual
    expect(importHint(file, join(tmpDir, 'packages/ui'), workspaces)).toBe('./src/button');
  });

  it('parses the simple pnpm-workspace.yaml list form', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-ws-'));
    await writeFile(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n', 'utf-8');
    await mkdir(join(tmpDir, 'apps/web'), { recursive: true });
    await writeFile(join(tmpDir, 'apps/web/package.json'), JSON.stringify({ name: 'web' }), 'utf-8');

    const workspaces = await detectWorkspaces(tmpDir);
    expect(workspaces.map(w => w.name)).toContain('web');
  });

  it('returns [] for a plain single-package project', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-ws-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'solo' }), 'utf-8');
    expect(await detectWorkspaces(tmpDir)).toHaveLength(0);
  });
});

describe('countImportUsage()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('counts importing files per named export, once per file', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-usage-'));
    await writeFile(join(tmpDir, 'utils.ts'), 'export function formatDate() {}', 'utf-8');
    await writeFile(join(tmpDir, 'a.ts'), `
import { formatDate, slugify } from './utils';
import { formatDate as fd } from './utils'; // same file — still one
`, 'utf-8');
    await writeFile(join(tmpDir, 'b.ts'), `
const { formatDate } = require('./utils');
`, 'utf-8');

    const usage = await countImportUsage({ cwd: tmpDir, targetFiles: [join(tmpDir, 'utils.ts')] });
    expect(usage.get('formatDate')).toBe(2);
    expect(usage.get('slugify')).toBe(1);
    expect(usage.get('missing')).toBeUndefined();
  });

  it('ignores bare npm package imports so they cannot inflate a local rank', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-usage-'));
    await writeFile(join(tmpDir, 'format.ts'), 'export function format() {}', 'utf-8');
    await writeFile(join(tmpDir, 'a.ts'), `import { format } from 'date-fns';`, 'utf-8');
    await writeFile(join(tmpDir, 'b.ts'), `import { format } from './format';`, 'utf-8');

    const usage = await countImportUsage({ cwd: tmpDir, targetFiles: [join(tmpDir, 'format.ts')] });
    expect(usage.get('format')).toBe(1); // only b.ts counts
  });

  it('counts workspace package imports and /index resolution', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-usage-'));
    await mkdir(join(tmpDir, 'utils'), { recursive: true });
    await writeFile(join(tmpDir, 'utils/index.ts'), 'export function helper() {}', 'utf-8');
    await writeFile(join(tmpDir, 'a.ts'), `import { helper } from './utils';`, 'utf-8');
    await writeFile(join(tmpDir, 'b.ts'), `import { shared } from '@acme/core';`, 'utf-8');

    const usage = await countImportUsage({
      cwd: tmpDir,
      targetFiles: [join(tmpDir, 'utils/index.ts')],
      workspaceNames: ['@acme/core'],
    });
    expect(usage.get('helper')).toBe(1);
    expect(usage.get('shared')).toBe(1);
  });
});
