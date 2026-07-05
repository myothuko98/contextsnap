import fs from 'fs/promises';
import path from 'path';

async function readJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** Expands a workspace glob like "packages/*" into existing directories. */
async function expandPattern(cwd, pattern) {
  // Normalize "packages/**" → "packages/*"; only single-level globs supported
  const clean = pattern.replace(/\/\*\*$/, '/*').replace(/\/$/, '');

  if (!clean.includes('*')) {
    const abs = path.resolve(cwd, clean);
    try {
      if ((await fs.stat(abs)).isDirectory()) return [abs];
    } catch { /* missing dir */ }
    return [];
  }

  const starIdx = clean.indexOf('*');
  const base = path.resolve(cwd, clean.slice(0, starIdx));
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => path.join(base, e.name));
  } catch {
    return [];
  }
}

/**
 * Detects npm/yarn/pnpm workspaces under cwd and returns each package's
 * name and absolute directory. Used to emit '@org/pkg' import hints for
 * files that live in a different workspace package.
 *
 * @param {string} cwd - Monorepo root (where package.json / pnpm-workspace.yaml live).
 * @returns {Promise<Array<{name: string, dir: string}>>}
 */
export async function detectWorkspaces(cwd) {
  const patterns = [];

  const pkg = await readJson(path.join(cwd, 'package.json'));
  if (Array.isArray(pkg?.workspaces)) patterns.push(...pkg.workspaces);
  else if (Array.isArray(pkg?.workspaces?.packages)) patterns.push(...pkg.workspaces.packages);

  // pnpm-workspace.yaml: only the simple "packages:" list form is supported
  try {
    const yaml = await fs.readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf-8');
    for (const line of yaml.split('\n')) {
      const m = line.match(/^\s*-\s*["']?([^"'#\n]+?)["']?\s*$/);
      if (m) patterns.push(m[1].trim());
    }
  } catch { /* not a pnpm workspace */ }

  if (patterns.length === 0) return [];

  const dirs = new Set();
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue;
    for (const dir of await expandPattern(cwd, pattern)) dirs.add(dir);
  }

  const workspaces = [];
  for (const dir of dirs) {
    const wsPkg = await readJson(path.join(dir, 'package.json'));
    if (wsPkg?.name) workspaces.push({ name: wsPkg.name, dir });
  }
  // Longest dir first so nested packages match before their parents
  return workspaces.sort((a, b) => b.dir.length - a.dir.length);
}
