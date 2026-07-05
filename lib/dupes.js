/** Splits an identifier into lowercase words: formatDate → [format, date]. */
function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Finds likely duplicate exports across a parsed file set:
 *  - same-name: identical normalized name in different files
 *  - same-words: same word set in a different order (formatDate vs dateFormat)
 *
 * @param {Array} scannedFiles - Parser output.
 * @returns {Array<{a: object, b: object, reason: string}>} pairs, source order.
 */
export function findDuplicates(scannedFiles) {
  const entries = [];
  for (const file of scannedFiles) {
    for (const exp of file.exports) {
      const name = String(exp.name);
      // Only single-identifier exports rank: skip lists, default, and re-exports
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || name === 'default') continue;
      entries.push({
        name,
        normalized: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        wordKey: words(name).sort().join(' '),
        file: file.filepath,
        line: exp.line,
        signature: exp.signature,
      });
    }
  }

  const pairs = [];
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      let reason = null;
      if (a.normalized === b.normalized) {
        // Same name in the same file = overloads/re-declarations, not dupes
        if (a.file !== b.file) reason = 'same name';
      } else if (a.wordKey && a.wordKey === b.wordKey && a.wordKey.includes(' ')) {
        reason = 'same words, different order';
      }
      if (!reason) continue;

      const key = [a.file, a.name, b.file, b.name].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b, reason });
    }
  }

  return pairs;
}
