import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../lib/config.js';
import { writeFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import os from 'os';

describe('loadConfig()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function dir(files = {}) {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-cfg-'));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(tmpDir, name), content, 'utf-8');
    }
    return tmpDir;
  }

  it('returns {} when no config file exists', async () => {
    const d = await dir();
    const cfg = await loadConfig(d);
    expect(cfg).toEqual({});
  });

  it('loads .contextsnaprc.json', async () => {
    const d = await dir({
      '.contextsnaprc.json': JSON.stringify({ dirs: ['src/utils'], format: 'json' }),
    });
    const cfg = await loadConfig(d);
    expect(cfg.dirs).toEqual(['src/utils']);
    expect(cfg.format).toBe('json');
  });

  it('loads .contextsnaprc (no extension) as JSON', async () => {
    const d = await dir({
      '.contextsnaprc': JSON.stringify({ ignore: ['__tests__'] }),
    });
    const cfg = await loadConfig(d);
    expect(cfg.ignore).toEqual(['__tests__']);
  });

  it('prefers .contextsnaprc.json over .contextsnaprc when both exist', async () => {
    const d = await dir({
      '.contextsnaprc.json': JSON.stringify({ format: 'json' }),
      '.contextsnaprc':      JSON.stringify({ format: 'markdown' }),
    });
    const cfg = await loadConfig(d);
    expect(cfg.format).toBe('json');
  });

  it('returns {} on invalid JSON', async () => {
    const d = await dir({ '.contextsnaprc.json': 'not json {{{' });
    const cfg = await loadConfig(d);
    expect(cfg).toEqual({});
  });
});
