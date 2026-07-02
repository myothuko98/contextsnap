import { describe, it, expect, afterEach } from 'vitest';
import { watchDirs } from '../lib/watcher.js';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

describe('watchDirs()', () => {
  let tmpDir;
  let stop;

  afterEach(async () => {
    if (stop) { try { stop(); } catch {} }
    stop = undefined;
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('returns a stop function without throwing', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-watch-'));
    stop = watchDirs([tmpDir], () => {});
    expect(typeof stop).toBe('function');
  });

  it('triggers callback when a source file is written', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-watch-'));
    const file = join(tmpDir, 'utils.ts');
    await writeFile(file, 'export const x = 1;', 'utf-8');

    let called = 0;
    stop = watchDirs([tmpDir], () => { called++; });

    // Give watcher time to initialize
    await new Promise(r => setTimeout(r, 150));

    // Trigger a change
    await writeFile(file, 'export const x = 2;', 'utf-8');

    // Wait for debounce + callback
    await new Promise(r => setTimeout(r, 800));

    expect(called).toBeGreaterThan(0);
  }, 5000);

  it('stop() prevents further callbacks after it is called', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-watch-'));
    const file = join(tmpDir, 'a.ts');
    await writeFile(file, 'export const a = 1;', 'utf-8');

    let called = 0;
    stop = watchDirs([tmpDir], () => { called++; });

    await new Promise(r => setTimeout(r, 150));
    stop();
    stop = undefined; // prevent afterEach double-call

    await writeFile(file, 'export const a = 2;', 'utf-8');
    await new Promise(r => setTimeout(r, 800));

    expect(called).toBe(0);
  }, 5000);
});
