import { describe, it, expect } from 'vitest';
import { compileMarkdown, generateASCIITree } from '../lib/compiler.js';
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
});
