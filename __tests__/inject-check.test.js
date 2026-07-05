import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const CLI = join(process.cwd(), 'bin/contextsnap.js');

const SRC = `
/**
 * Adds two numbers.
 */
export function add(a: number, b: number): number {
  return a + b;
}
`;

async function run(args, cwd) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], { cwd, timeout: 10000 });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('Integration — --inject', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function project() {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-inject-'));
    await writeFile(join(tmpDir, 'utils.ts'), SRC, 'utf-8');
    return tmpDir;
  }

  it('creates CLAUDE.md with a marker block when none exists', async () => {
    const dir = await project();
    const res = await run(['.', '--inject'], dir);

    expect(res.code).toBe(0);
    const md = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(md).toContain('<!-- contextsnap:start -->');
    expect(md).toContain('<!-- contextsnap:end -->');
    expect(md).toContain('export function add(a: number, b: number): number;');
    expect(md).not.toContain('return a + b');
  }, 15000);

  it('preserves user content and is idempotent on re-run', async () => {
    const dir = await project();
    await writeFile(join(dir, 'CLAUDE.md'), '# My project rules\n\nAlways use tabs.\n', 'utf-8');

    await run(['.', '--inject'], dir);
    await run(['.', '--inject'], dir);

    const md = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(md).toContain('# My project rules');
    expect(md).toContain('Always use tabs.');
    expect(md.match(/<!-- contextsnap:start -->/g)).toHaveLength(1);
    expect(md.match(/<!-- contextsnap:end -->/g)).toHaveLength(1);
  }, 20000);

  it('refreshes the block content when exports change', async () => {
    const dir = await project();
    await run(['.', '--inject'], dir);

    await writeFile(join(dir, 'utils.ts'), SRC + '\nexport const NEW_CONST = 7;\n', 'utf-8');
    await run(['.', '--inject'], dir);

    const md = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(md).toContain('NEW_CONST');
    expect(md.match(/<!-- contextsnap:start -->/g)).toHaveLength(1);
  }, 20000);

  it('targets AGENTS.md when it exists and CLAUDE.md does not', async () => {
    const dir = await project();
    await writeFile(join(dir, 'AGENTS.md'), '# Agent rules\n', 'utf-8');

    await run(['.', '--inject'], dir);

    const md = await readFile(join(dir, 'AGENTS.md'), 'utf-8');
    expect(md).toContain('<!-- contextsnap:start -->');
  }, 15000);

  it('honors an explicit --inject=<file> target', async () => {
    const dir = await project();
    await run(['.', '--inject=NOTES.md'], dir);

    const md = await readFile(join(dir, 'NOTES.md'), 'utf-8');
    expect(md).toContain('<!-- contextsnap:start -->');
  }, 15000);

  it('rejects --inject with --format=json', async () => {
    const dir = await project();
    const res = await run(['.', '--inject', '--format=json'], dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('markdown');
  }, 15000);
});

describe('Integration — --check', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function project() {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-check-'));
    await writeFile(join(tmpDir, 'utils.ts'), SRC, 'utf-8');
    return tmpDir;
  }

  // Snapshot files are seeded from --stdout output (byte-identical to what a
  // normal run writes) so tests never touch the developer's clipboard.
  async function seedSnapshot(dir) {
    const { stdout } = await run(['.', '--stdout'], dir);
    await writeFile(join(dir, '.ai-context.md'), stdout, 'utf-8');
  }

  it('exits 0 when .ai-context.md is fresh', async () => {
    const dir = await project();
    await seedSnapshot(dir);

    const res = await run(['.', '--check'], dir);
    expect(res.code).toBe(0);
    expect(res.stdout + res.stderr).toContain('up to date');
  }, 20000);

  it('exits 1 when exports changed since the last snapshot', async () => {
    const dir = await project();
    await seedSnapshot(dir);

    await writeFile(join(dir, 'utils.ts'), SRC + '\nexport const DRIFT = 1;\n', 'utf-8');
    const res = await run(['.', '--check'], dir);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('stale');
  }, 20000);

  it('exits 1 with a version message when the snapshot came from another version', async () => {
    const dir = await project();
    await seedSnapshot(dir);
    const md = await readFile(join(dir, '.ai-context.md'), 'utf-8');
    await writeFile(join(dir, '.ai-context.md'), md.replace(/contextsnap@\d+\.\d+\.\d+/, 'contextsnap@1.0.0'), 'utf-8');

    const res = await run(['.', '--check'], dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('contextsnap@1.0.0');
    expect(res.stderr).toContain('pin the same version');
  }, 20000);

  it('--budget lifts the 300-file cap on large repos', async () => {
    const dir = await project();
    await Promise.all(Array.from({ length: 320 }, (_, i) =>
      writeFile(join(dir, `f${i}.ts`), `export const C${i} = ${i};`, 'utf-8')
    ));

    const capped = await run(['.', '--stdout'], dir);
    expect(capped.code).toBe(1);
    expect(capped.stderr).toContain('--budget');

    const budgeted = await run(['.', '--stdout', '--budget=800'], dir);
    expect(budgeted.code).toBe(0);
    expect(budgeted.stdout).toContain('# CONTEXTSNAP CODEBASE CONTEXT');
  }, 30000);

  it('exits 1 when no snapshot exists yet', async () => {
    const dir = await project();
    const res = await run(['.', '--check'], dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('does not exist');
  }, 15000);

  it('checks the injected block when combined with --inject', async () => {
    const dir = await project();
    await run(['.', '--inject'], dir);

    const fresh = await run(['.', '--check', '--inject'], dir);
    expect(fresh.code).toBe(0);

    await writeFile(join(dir, 'utils.ts'), SRC + '\nexport const DRIFT = 1;\n', 'utf-8');
    const stale = await run(['.', '--check', '--inject'], dir);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('stale');
  }, 25000);
});
