import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Copies text to the system clipboard using OS-native commands.
 * Fails gracefully — returns false instead of throwing.
 *
 * @param {string} text - The text to copy.
 * @returns {Promise<boolean>} true on success, false on failure.
 */
export async function copyToClipboard(text) {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      const proc = exec('pbcopy');
      proc.stdin.write(text);
      proc.stdin.end();
      await new Promise((resolve, reject) => {
        proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`pbcopy exited ${code}`))));
      });
    } else if (platform === 'linux') {
      // Try xclip, fall back to xsel
      try {
        const proc = exec('xclip -selection clipboard');
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise((resolve, reject) => {
          proc.on('close', code => (code === 0 ? resolve() : reject()));
        });
      } catch {
        const proc = exec('xsel --clipboard --input');
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise((resolve, reject) => {
          proc.on('close', code => (code === 0 ? resolve() : reject()));
        });
      }
    } else if (platform === 'win32') {
      await execAsync(`echo ${JSON.stringify(text)} | clip`);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
