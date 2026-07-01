import fs from 'fs/promises';
import path from 'path';

/**
 * Recursively scans a target directory for JS/TS/JSX/TSX files,
 * ignoring .git, node_modules, hidden files, and ignore patterns.
 * 
 * @param {string} dirPath - The folder path to scan.
 * @param {string[]} ignorePatterns - Optional array of strings to match for exclusion.
 * @returns {Promise<string[]>} List of absolute file paths found.
 */
export async function scanDirectory(dirPath, ignorePatterns = []) {
  const files = [];

  async function traverse(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(dirPath, fullPath);

      // Default hardcoded ignores
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name.startsWith('.')
      ) {
        continue;
      }

      // Check user-supplied ignore patterns
      if (ignorePatterns.some(pattern => relativePath.includes(pattern) || entry.name.includes(pattern))) {
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
