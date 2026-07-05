import fs from 'fs/promises';
import path from 'path';
import { scanDirectory } from './scanner.js';

const MAX_USAGE_FILES = 5000;

function stripExt(p) {
  return p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
}

/**
 * Counts how many files import each named export across the project.
 * Powers --budget ranking: exports nobody imports get trimmed first.
 *
 * Only imports that plausibly come from the snapshotted files are counted:
 * relative specifiers must resolve to a scanned file (with /index fallback),
 * and bare specifiers must name a workspace package. Bare npm packages
 * (`import { format } from 'date-fns'`) never inflate a local export's rank.
 *
 * @param {object} opts
 * @param {string} opts.cwd - Project root to scan for importing files.
 * @param {string[]} [opts.ignorePatterns] - Same patterns the main scan uses.
 * @param {string[]} [opts.targetFiles] - The scanned export files; when given,
 *   relative imports count only if they resolve to one of these.
 * @param {string[]} [opts.workspaceNames] - Workspace package names whose
 *   imports should count (monorepo cross-package usage).
 * @returns {Promise<Map<string, number>>} export name → number of importing files.
 */
export async function countImportUsage({ cwd, ignorePatterns = [], targetFiles, workspaceNames = [] }) {
  let files;
  try {
    files = (await scanDirectory(cwd, ignorePatterns)).slice(0, MAX_USAGE_FILES);
  } catch {
    return new Map();
  }

  const targetSet = targetFiles
    ? new Set(targetFiles.map(f => stripExt(path.resolve(f))))
    : null;
  const wsNames = new Set(workspaceNames);

  function specifierCounts(importerDir, spec) {
    if (spec.startsWith('.')) {
      if (!targetSet) return true;
      const resolved = stripExt(path.resolve(importerDir, spec));
      return targetSet.has(resolved) || targetSet.has(path.join(resolved, 'index'));
    }
    if (wsNames.size === 0) return false;
    return wsNames.has(spec) || [...wsNames].some(n => spec.startsWith(n + '/'));
  }

  const counts = new Map();

  await Promise.all(files.map(async file => {
    let content;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      return;
    }
    const importerDir = path.dirname(file);
    const namesInFile = new Set();

    const addNames = (namesBlob, separator) => {
      for (const part of namesBlob.split(',')) {
        const original = part.trim().split(separator)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(original)) namesInFile.add(original);
      }
    };

    // import { a, b as c } from '...'  /  import type { T } from '...'
    const esmNamed = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = esmNamed.exec(content)) !== null) {
      if (specifierCounts(importerDir, m[2])) addNames(m[1], /\s+as\s+/);
    }

    // const { a, b } = require('...')
    const cjsDestructure = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/g;
    while ((m = cjsDestructure.exec(content)) !== null) {
      if (specifierCounts(importerDir, m[2])) addNames(m[1], ':');
    }

    for (const name of namesInFile) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }));

  return counts;
}
