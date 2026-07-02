import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Loads .contextsnaprc.json or .contextsnaprc from baseDir.
 * Returns {} when neither file exists.
 * CLI flags always override values returned here.
 */
export async function loadConfig(baseDir) {
  for (const name of ['.contextsnaprc.json', '.contextsnaprc']) {
    try {
      const raw = await readFile(join(baseDir, name), 'utf-8');
      return JSON.parse(raw);
    } catch {
      // file missing or invalid JSON — try next
    }
  }
  return {};
}
