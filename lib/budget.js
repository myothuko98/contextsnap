// Rough chars-per-token divisor, matching the CLI's estimate elsewhere
const CHARS_PER_TOKEN = 4;
const OVERHEAD_TOKENS = 130; // preamble + header + stack line
const FILE_HEADER_TOKENS = 18; // "## File: …" + code fence + import hint

function exportCost(exp) {
  const chars = (exp.jsdoc?.length ?? 0) + exp.signature.length + 8;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Highest usage count across an export's (possibly comma-joined) names. */
function exportUsage(exp, usage) {
  return Math.max(0, ...String(exp.name).split(',').map(n => usage.get(n.trim()) ?? 0));
}

/**
 * Trims the least-used exports until the estimated token total fits the
 * budget. Ranking: fewest importing files first; ties drop the costliest
 * export first. Files whose exports are all trimmed disappear entirely.
 *
 * @param {Array} scannedFiles - Parser output (not mutated).
 * @param {number} budgetTokens - Target token ceiling.
 * @param {Map<string, number>} usage - export name → importing-file count.
 * @returns {{files: Array, dropped: Array<{name: string, file: string}>, estTokens: number}}
 */
export function applyBudget(scannedFiles, budgetTokens, usage) {
  const entries = [];
  scannedFiles.forEach((file, fi) => {
    file.exports.forEach((exp, ei) => {
      entries.push({
        fi, ei,
        cost: exportCost(exp),
        usage: exportUsage(exp, usage),
        name: exp.name,
        filepath: file.filepath,
      });
    });
  });

  const activeFiles = new Set(entries.map(e => e.fi));
  let total = OVERHEAD_TOKENS
    + activeFiles.size * FILE_HEADER_TOKENS
    + entries.reduce((sum, e) => sum + e.cost, 0);

  // Drop order: least used first, then costliest first, stable on source order
  const dropOrder = [...entries].sort((a, b) =>
    a.usage - b.usage || b.cost - a.cost || a.fi - b.fi || a.ei - b.ei
  );

  const droppedKeys = new Set();
  const dropped = [];
  for (const entry of dropOrder) {
    if (total <= budgetTokens) break;
    droppedKeys.add(`${entry.fi}:${entry.ei}`);
    dropped.push({ name: entry.name, file: entry.filepath });
    total -= entry.cost;

    const fileHasSurvivors = entries.some(
      e => e.fi === entry.fi && !droppedKeys.has(`${e.fi}:${e.ei}`)
    );
    if (!fileHasSurvivors && activeFiles.delete(entry.fi)) {
      total -= FILE_HEADER_TOKENS;
    }
  }

  const files = scannedFiles
    .map((file, fi) => ({
      ...file,
      exports: file.exports.filter((_, ei) => !droppedKeys.has(`${fi}:${ei}`)),
    }))
    .filter(file => file.exports.length > 0);

  return { files, dropped, estTokens: total };
}
