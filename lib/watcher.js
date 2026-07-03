import { watch } from 'fs';

const DEBOUNCE_MS = 300;
const POLL_MS = 500;
const SOURCE_EXT = /\.(js|ts|jsx|tsx)$/;

/**
 * Watches dirs for source file changes and calls onchange (debounced).
 * Uses fs.watch({ recursive }) where supported; falls back to polling on
 * Linux < Node 22 which lacks recursive inotify support.
 * Returns a stop() function.
 */
export function watchDirs(dirs, onchange) {
  let debounceTimer = null;
  const watchers = [];
  let pollInterval = null;
  let stopped = false;
  let usedPolling = false;

  function trigger() {
    if (stopped) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!stopped) onchange();
    }, DEBOUNCE_MS);
  }

  for (const dir of dirs) {
    try {
      const w = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || SOURCE_EXT.test(filename)) trigger();
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch (err) {
      if (
        err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' ||
        err.code === 'ENOSYS' ||
        err.code === 'ENOTSUP'
      ) {
        // Recursive watch not supported (Linux < Node 22) — fall back to polling
        if (!usedPolling) {
          usedPolling = true;
          pollInterval = setInterval(() => trigger(), POLL_MS);
        }
      }
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(debounceTimer);
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
    if (pollInterval) clearInterval(pollInterval);
  }

  return stop;
}
