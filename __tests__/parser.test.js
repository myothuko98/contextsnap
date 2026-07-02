import { describe, it, expect, afterEach } from 'vitest';
import { parseFile, stripClassMethodBodies } from '../lib/parser.js';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';

// ─────────────────────────────────────────────
// Unit: stripClassMethodBodies
// ─────────────────────────────────────────────
describe('stripClassMethodBodies()', () => {
  it('replaces method bodies with semicolons', () => {
    const code = `class Calc { add(a, b) { return a + b; } }`;
    const result = stripClassMethodBodies(code);
    expect(result).toContain('add(a, b);');
    expect(result).not.toContain('return a + b');
  });

  it('ignores braces inside string literals', () => {
    const code = `class T { brace() { return "{"; } tail() { return 1; } }`;
    const result = stripClassMethodBodies(code);
    expect(result).toContain('brace();');
    expect(result).toContain('tail();');
    expect(result).not.toContain('return 1');
  });
});

// ─────────────────────────────────────────────
// parseFile — extraction against real temp files
// ─────────────────────────────────────────────
describe('parseFile()', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  async function fixture(name, content) {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'ctx-'));
    const file = join(tmpDir, name);
    await writeFile(file, content, 'utf-8');
    return file;
  }

  it('extracts a named function export with JSDoc', async () => {
    const tmpFile = await fixture('utils.ts', `
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
`);

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
  });

  it('returns empty exports for a file with no exports', async () => {
    const tmpFile = await fixture('empty.ts', `const x = 1;\nconst y = 2;`);
    const result = await parseFile(tmpFile);
    expect(result.exports).toHaveLength(0);
  });

  it('handles braces inside string constants', async () => {
    const tmpFile = await fixture('braces.ts', `
export const OPEN_BRACE = "{";

export function after(x: number): number {
  return x * 2;
}
`);
    const result = await parseFile(tmpFile);

    const cnst = result.exports.find(e => e.name === 'OPEN_BRACE');
    expect(cnst).toBeDefined();
    expect(cnst.signature).toBe('export const OPEN_BRACE = "{";');

    const fn = result.exports.find(e => e.name === 'after');
    expect(fn).toBeDefined();
    expect(fn.signature).toContain('after(x: number)');
    expect(fn.signature).not.toContain('return x * 2');
  });

  it('handles braces inside template literals in class methods', async () => {
    const tmpFile = await fixture('tpl.ts', `
export class Formatter {
  wrap(name: string): string {
    return \`{ \${name} }\`;
  }
  plain(): number {
    return 42;
  }
}
`);
    const result = await parseFile(tmpFile);
    const cls = result.exports.find(e => e.name === 'Formatter');
    expect(cls).toBeDefined();
    expect(cls.signature).toContain('wrap(name: string): string;');
    expect(cls.signature).toContain('plain(): number;');
    expect(cls.signature).not.toContain('return 42');
  });

  it('extracts export default function', async () => {
    const tmpFile = await fixture('def.ts', `
/**
 * The main entry helper.
 */
export default function mainHelper(input: string): string {
  return input.trim();
}
`);
    const result = await parseFile(tmpFile);
    const def = result.exports.find(e => e.name === 'mainHelper');
    expect(def).toBeDefined();
    expect(def.jsdoc).toContain('main entry helper');
    expect(def.signature).toContain('export default function mainHelper');
    expect(def.signature).not.toContain('input.trim');
  });

  it('extracts anonymous export default function as "default"', async () => {
    const tmpFile = await fixture('anon.ts', `
export default function (a: number): number {
  return a + 1;
}
`);
    const result = await parseFile(tmpFile);
    const def = result.exports.find(e => e.name === 'default');
    expect(def).toBeDefined();
    expect(def.signature).not.toContain('return a + 1');
  });

  it('does not attach a preceding private function JSDoc to a later export', async () => {
    const tmpFile = await fixture('private.ts', `
/**
 * Private helper doc — must NOT leak into the export below.
 */
function helper(x: number): number {
  return x * 2;
}

/**
 * Public util doc.
 */
export function publicUtil(y: number): number {
  return helper(y);
}
`);
    const result = await parseFile(tmpFile);
    const fn = result.exports.find(e => e.name === 'publicUtil');
    expect(fn).toBeDefined();
    expect(fn.jsdoc).toContain('Public util doc');
    expect(fn.jsdoc).not.toContain('Private helper doc');
    expect(fn.jsdoc).not.toContain('x * 2');
  });

  it('extracts named export lists with aliases', async () => {
    const tmpFile = await fixture('named.ts', `
function alpha() { return 1; }
function beta() { return 2; }

export { alpha, beta as renamedBeta };
`);
    const result = await parseFile(tmpFile);
    const named = result.exports.find(e => e.type === 'export');
    expect(named).toBeDefined();
    expect(named.name).toContain('alpha');
    expect(named.name).toContain('renamedBeta');
    expect(named.signature).toContain('export { alpha, beta as renamedBeta };');
  });

  it('ignores export syntax mentioned inside comments', async () => {
    const tmpFile = await fixture('comments.ts', `
// This file used to say: export function ghost() {}
/* Also mentioned: export const phantom = 1; and export { spooky } */

export function real(x: number): number {
  return x;
}
`);
    const result = await parseFile(tmpFile);
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('real');
  });

  it('extracts CommonJS exports.foo and module.exports.bar', async () => {
    const tmpFile = await fixture('cjs.js', `
/**
 * Adds two numbers.
 */
exports.add = function (a, b) {
  return a + b;
};

module.exports.subtract = (a, b) => {
  return a - b;
};

exports.MAX_RETRIES = 5;
`);
    const result = await parseFile(tmpFile);

    const add = result.exports.find(e => e.name === 'add');
    expect(add).toBeDefined();
    expect(add.type).toBe('function');
    expect(add.jsdoc).toContain('Adds two numbers');
    expect(add.signature).not.toContain('return a + b');

    const sub = result.exports.find(e => e.name === 'subtract');
    expect(sub).toBeDefined();
    expect(sub.type).toBe('function');

    const max = result.exports.find(e => e.name === 'MAX_RETRIES');
    expect(max).toBeDefined();
    expect(max.type).toBe('const');
  });

  it('keeps default object params in the signature', async () => {
    const tmpFile = await fixture('defparam.ts', `
export function withOptions(data: string, options = {}) {
  return data + JSON.stringify(options);
}
`);
    const result = await parseFile(tmpFile);
    const fn = result.exports.find(e => e.name === 'withOptions');
    expect(fn).toBeDefined();
    expect(fn.signature).toBe('export function withOptions(data: string, options = {});');
    expect(fn.signature).not.toContain('JSON.stringify');
  });

  it('does not mistake property access or comparison for CommonJS exports', async () => {
    const tmpFile = await fixture('not-cjs.js', `
export function check(file) {
  if (file.exports.length === 0) return false;
  return file.exports.count !== 1;
}
`);
    const result = await parseFile(tmpFile);
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('check');
  });

  it('extracts CommonJS module.exports object literal', async () => {
    const tmpFile = await fixture('cjs-obj.js', `
function one() { return 1; }
function two() { return 2; }

module.exports = { one, two };
`);
    const result = await parseFile(tmpFile);
    const obj = result.exports.find(e => e.type === 'export');
    expect(obj).toBeDefined();
    expect(obj.name).toContain('one');
    expect(obj.name).toContain('two');
  });
});
