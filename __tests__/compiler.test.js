import { describe, it, expect } from 'vitest';
import { compileMarkdown, compileJSON, generateASCIITree } from '../lib/compiler.js';
import path from 'path';

// ─────────────────────────────────────────────
// Unit: generateASCIITree
// ─────────────────────────────────────────────
describe('generateASCIITree()', () => {
  const baseDir = '/project/src/utils';

  const mockFiles = [
    {
      filepath: '/project/src/utils/date.ts',
      exports: [
        { name: 'parseISO', type: 'function', signature: 'export function parseISO(s: string): Date;' },
        { name: 'formatLocal', type: 'function', signature: 'export function formatLocal(s: string): string;' },
      ]
    },
    {
      filepath: '/project/src/utils/currency.ts',
      exports: [
        { name: 'formatUSD', type: 'function', signature: 'export function formatUSD(n: number): string;' },
      ]
    }
  ];

  it('includes file names in the tree output', () => {
    const tree = generateASCIITree(mockFiles, baseDir);
    expect(tree).toContain('date.ts');
    expect(tree).toContain('currency.ts');
  });

  it('includes export function names in the tree output', () => {
    const tree = generateASCIITree(mockFiles, baseDir);
    expect(tree).toContain('parseISO');
    expect(tree).toContain('formatUSD');
  });

  it('shows a warning when no files have exports', () => {
    const emptyFiles = [{ filepath: '/project/src/utils/empty.ts', exports: [] }];
    const tree = generateASCIITree(emptyFiles, baseDir);
    expect(tree).toContain('No exportable functions found');
  });

  it('truncates output when more than 30 files are provided', () => {
    const manyFiles = Array.from({ length: 35 }, (_, i) => ({
      filepath: `/project/src/utils/file${i}.ts`,
      exports: [{ name: `fn${i}`, type: 'function', signature: `export function fn${i}(): void;` }]
    }));
    const tree = generateASCIITree(manyFiles, baseDir);
    expect(tree).toContain('more files');
  });
});

// ─────────────────────────────────────────────
// Unit: compileMarkdown
// ─────────────────────────────────────────────
describe('compileMarkdown()', () => {
  const mockFiles = [
    {
      filepath: '/project/src/utils/validation.ts',
      exports: [
        {
          name: 'validateZip',
          type: 'function',
          jsdoc: '/** Validates a US zip code. */',
          signature: 'export function validateZip(zip: string): boolean;'
        }
      ]
    }
  ];

  it('produces markdown with a file header', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('## File: validation.ts');
  });

  it('includes the function signature in a code block', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('export function validateZip');
    expect(md).toContain('```typescript');
    expect(md).toContain('```');
  });

  it('includes JSDoc when present', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('Validates a US zip code');
  });

  it('skips files with no exports', () => {
    const emptyFiles = [{ filepath: '/project/src/utils/empty.ts', exports: [] }];
    const md = compileMarkdown(emptyFiles);
    expect(md).not.toContain('## File: empty.ts');
  });

  it('includes the CONTEXTSNAP header with a date', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('# CONTEXTSNAP CODEBASE CONTEXT');
  });

  it('includes the AI reuse preamble', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('ALREADY EXIST');
    expect(md).toContain('reuse');
  });

  it('includes an import path hint per file', () => {
    const md = compileMarkdown(mockFiles, '/project/src/utils');
    expect(md).toContain("// import from './validation'");
  });

  it('includes the project stack line when provided', () => {
    const md = compileMarkdown(mockFiles, '/project/src/utils', { stack: ['react', 'zod'] });
    expect(md).toContain('**Project stack:** react, zod');
  });

  it('omits the stack line when empty', () => {
    const md = compileMarkdown(mockFiles, '/project/src/utils', { stack: [] });
    expect(md).not.toContain('Project stack');
  });

  it('appends the line number to the signature when present', () => {
    const withLine = [{
      filepath: '/project/src/utils/validation.ts',
      exports: [{
        name: 'validateZip',
        type: 'function',
        signature: 'export function validateZip(zip: string): boolean;',
        line: 42
      }]
    }];
    const md = compileMarkdown(withLine);
    expect(md).toContain('export function validateZip(zip: string): boolean; // :42');
  });

  it('omits the line suffix when line is absent', () => {
    const md = compileMarkdown(mockFiles);
    expect(md).toContain('export function validateZip(zip: string): boolean;\n');
    expect(md).not.toContain('boolean; // :');
  });
});

// ─────────────────────────────────────────────
// Unit: compileJSON
// ─────────────────────────────────────────────
describe('compileJSON()', () => {
  const mockFiles = [
    {
      filepath: '/project/src/utils/math.ts',
      exports: [
        { name: 'add', type: 'function', signature: 'export function add(a: number, b: number): number;' },
        { name: 'PI',  type: 'const',    signature: 'export const PI: number;' },
      ]
    },
    {
      filepath: '/project/src/utils/empty.ts',
      exports: []
    }
  ];

  it('returns valid JSON', () => {
    const json = compileJSON(mockFiles, '/project/src/utils');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('has a generated date and files array', () => {
    const parsed = JSON.parse(compileJSON(mockFiles, '/project/src/utils'));
    expect(parsed.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(parsed.files)).toBe(true);
  });

  it('includes exports per file', () => {
    const parsed = JSON.parse(compileJSON(mockFiles, '/project/src/utils'));
    const math = parsed.files.find(f => f.path.includes('math'));
    expect(math).toBeDefined();
    expect(math.exports.length).toBe(2);
    expect(math.exports[0].name).toBe('add');
  });

  it('omits files with no exports', () => {
    const parsed = JSON.parse(compileJSON(mockFiles, '/project/src/utils'));
    expect(parsed.files.some(f => f.path.includes('empty'))).toBe(false);
  });

  it('includes an importFrom path without extension', () => {
    const parsed = JSON.parse(compileJSON(mockFiles, '/project/src/utils'));
    const math = parsed.files.find(f => f.path.includes('math'));
    expect(math.importFrom).toBe('./math');
  });

  it('includes the stack when provided', () => {
    const parsed = JSON.parse(compileJSON(mockFiles, '/project/src/utils', { stack: ['react'] }));
    expect(parsed.stack).toContain('react');
  });
});
