import fs from 'fs/promises';
import path from 'path';

const IGNORE_FILE = '.contextsnapignore';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles an ignore pattern into a segment matcher.
 * - Plain patterns match a path segment or filename exactly ('dist' skips
 *   the dist/ folder but not distribution.ts).
 * - Patterns with '*' are wildcards ('*.mock.*' skips api.mock.ts).
 */
function patternToMatcher(pattern) {
  if (pattern.includes('*')) {
    const rx = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
    return segment => rx.test(segment);
  }
  return segment => segment === pattern;
}

/**
 * Loads extra ignore patterns from a .contextsnapignore file in baseDir.
 * One pattern per line; blank lines and #-comments are skipped.
 * Returns [] if the file doesn't exist.
 *
 * @param {string} baseDir - Directory to look for the ignore file in.
 * @returns {Promise<string[]>} Patterns found.
 */
export async function loadIgnoreFile(baseDir) {
  try {
    const raw = await fs.readFile(path.join(baseDir, IGNORE_FILE), 'utf-8');
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Recursively scans a target directory for JS/TS/JSX/TSX files,
 * ignoring .git, node_modules, hidden files, and ignore patterns.
 *
 * @param {string} dirPath - The folder path to scan.
 * @param {string[]} ignorePatterns - Segment/wildcard patterns to exclude.
 * @returns {Promise<string[]>} List of absolute file paths found.
 */
export async function scanDirectory(dirPath, ignorePatterns = []) {
  const files = [];
  const matchers = ignorePatterns.map(patternToMatcher);

  const isIgnored = name => matchers.some(m => m(name));

  async function traverse(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Default hardcoded ignores
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name.startsWith('.')
      ) {
        continue;
      }

      // User-supplied ignore patterns match individual path segments
      if (isIgnored(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await traverse(dirPath);
  return files.sort();
}
