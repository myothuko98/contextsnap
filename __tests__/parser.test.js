import { describe, it, expect } from 'vitest';
import { stripFunctionBody, extractExports } from '../lib/parser.js';

// ─────────────────────────────────────────────
// Unit: stripFunctionBody
// ─────────────────────────────────────────────
describe('stripFunctionBody()', () => {
  it('replaces a simple function body with a semicolon', () => {
    const code = `function add(a, b) { return a + b; }`;
    const result = stripFunctionBody(code);
    expect(result).toBe('function add(a, b);');
  });

  it('handles nested braces inside the body', () => {
    const code = `function complex(x) { if (x > 0) { return x; } return -x; }`;
    const result = stripFunctionBody(code);
    expect(result).toBe('function complex(x);');
  });

  it('returns the code unchanged when there is no body', () => {
    const code = `function foo(a: string): string;`;
    const result = stripFunctionBody(code);
    expect(result).toBe('function foo(a: string): string;');
  });
});

// ─────────────────────────────────────────────
// Unit: extractExports (via parseFile internals)
// We test the regex extraction logic by using parseFile
// on a temporary in-memory fixture via a helper
// ─────────────────────────────────────────────
import { parseFile } from '../lib/parser.js';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import os from 'os';

describe('parseFile() — extractExports()', () => {
  let tmpDir;
  let tmpFile;

  it('extracts a named function export with JSDoc', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-'));
    tmpFile = join(tmpDir, 'utils.ts');

    await writeFile(tmpFile, `
/**
 * Formats an ISO string to local date.
 * @param isoString - The ISO date string
 */
export function formatLocal(isoString: string): string {
  return new Date(isoString).toLocaleDateString();
}

export const VERSION = '1.0.0';

export interface UserConfig {
  name: string;
  debug: boolean;
}
`, 'utf-8');

    const result = await parseFile(tmpFile);

    expect(result.filepath).toBe(tmpFile);
    expect(result.exports.length).toBeGreaterThanOrEqual(3);

    const fn = result.exports.find(e => e.name === 'formatLocal');
    expect(fn).toBeDefined();
    expect(fn.type).toBe('function');
    expect(fn.jsdoc).toContain('Formats an ISO string');
    expect(fn.signature).toContain('formatLocal');
    expect(fn.signature).not.toContain('toLocaleDateString'); // body stripped

    const cnst = result.exports.find(e => e.name === 'VERSION');
    expect(cnst).toBeDefined();
    expect(cnst.type).toBe('const');

    const iface = result.exports.find(e => e.name === 'UserConfig');
    expect(iface).toBeDefined();
    expect(iface.type).toBe('interface');

    await unlink(tmpFile);
  });

  it('returns empty exports for a file with no exports', async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-'));
    tmpFile = join(tmpDir, 'empty.ts');
    await writeFile(tmpFile, `const x = 1;\nconst y = 2;`, 'utf-8');

    const result = await parseFile(tmpFile);
    expect(result.exports).toHaveLength(0);

    await unlink(tmpFile);
  });
});
