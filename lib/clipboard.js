import { exec } from 'child_process';
import os from 'os';

/**
 * Pipes text into a clipboard command via stdin.
 * Never shell-interpolates the content — safe for any characters.
 */
function pipeTo(command, text) {
  return new Promise((resolve, reject) => {
    const proc = exec(command);
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

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
      await pipeTo('pbcopy', text);
    } else if (platform === 'linux') {
      // Try xclip, fall back to xsel
      try {
        await pipeTo('xclip -selection clipboard', text);
      } catch {
        await pipeTo('xsel --clipboard --input', text);
      }
    } else if (platform === 'win32') {
      await pipeTo('clip', text);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
