import fs from 'fs/promises';
import { init as lexerInit, parse as lexerParse } from 'es-module-lexer';

/**
 * Skips over a string or template literal starting at index i (code[i] is the
 * opening quote). Returns the index of the closing quote.
 */
function skipString(code, i) {
  const quote = code[i];
  i++;
  while (i < code.length && code[i] !== quote) {
    if (code[i] === '\\') i++; // skip escaped char
    i++;
  }
  return i;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'instanceof', 'yield', 'await', 'throw'
]);

/**
 * Decides whether the '/' at index i starts a regex literal (vs division).
 * Looks back at the last significant token: after an identifier, number,
 * ')', ']', '.', or a closing quote, '/' is division; otherwise regex.
 */
function isRegexStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  const c = code[j];
  if (/[A-Za-z0-9_$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(code[k])) k--;
    return REGEX_PRECEDING_KEYWORDS.has(code.slice(k + 1, j + 1));
  }
  return !(c === ')' || c === ']' || c === '"' || c === "'" || c === '`' || c === '.');
}

/**
 * Skips over a regex literal starting at index i (code[i] is the opening '/').
 * Returns the index of the closing '/', honoring escapes and character
 * classes. Returns i unchanged if no closing '/' exists on the same line —
 * meaning this was not a regex literal after all.
 */
function skipRegexLiteral(code, i) {
  let j = i + 1;
  let inClass = false;
  while (j < code.length) {
    const c = code[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '\n') return i; // regex literals cannot span lines — bail
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j;
    j++;
  }
  return i;
}

/**
 * If code[i] opens a regex literal, returns the index of its closing '/';
 * otherwise returns i. Callers use this so quotes and braces inside regex
 * literals (e.g. /"/ or /{/) never derail string/brace scanning.
 */
function maybeSkipRegex(code, i) {
  if (code[i] !== '/' || code[i + 1] === '/' || code[i + 1] === '*') return i;
  if (!isRegexStart(code, i)) return i;
  return skipRegexLiteral(code, i);
}

/**
 * Returns a same-length copy of the code with all comment interiors replaced
 * by spaces (newlines preserved). Indices in the result map 1:1 to the
 * original, so regex matches on the blanked copy can read JSDoc from the
 * original. Kills false positives from export syntax mentioned in comments.
 */
function blankComments(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(code, i);
      out += code.slice(i, end + 1);
      i = end + 1;
    } else if (c === '/' && maybeSkipRegex(code, i) !== i) {
      const end = maybeSkipRegex(code, i);
      out += code.slice(i, end + 1);
      i = end + 1;
    } else if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      const stop = close === -1 ? code.length : close + 2;
      while (i < stop) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Returns a same-length copy with string/template-literal and regex-literal
 * interiors replaced by spaces (delimiters and newlines kept). Run on the
 * comment-blanked copy, this yields a scan-safe view: export syntax inside
 * string values (e.g. a template building "export default {…}") can no
 * longer produce phantom matches.
 */
function blankStrings(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(code, i);
      out += c;
      for (let j = i + 1; j < end && j < code.length; j++) {
        out += code[j] === '\n' ? '\n' : ' ';
      }
      if (end < code.length) out += code[end];
      i = end + 1;
    } else if (c === '/' && maybeSkipRegex(code, i) !== i) {
      const end = maybeSkipRegex(code, i);
      out += '/';
      for (let j = i + 1; j < end; j++) {
        out += code[j] === '\n' ? '\n' : ' ';
      }
      out += '/';
      i = end + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Finds the first index of any target character, ignoring characters
 * inside string and template literals.
 */
function findOutsideStrings(code, targets) {
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(code, i);
    } else if (c === '/') {
      i = maybeSkipRegex(code, i);
    } else if (targets.includes(c)) {
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Finds the index of the closing brace matching the opening brace at openIdx.
 * Braces inside string and template literals are ignored.
 */
function findMatchingBrace(code, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(code, i);
    } else if (c === '/') {
      i = maybeSkipRegex(code, i);
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Strips class method implementations, replacing bodies with semicolons.
 * String-aware — braces inside literals do not confuse the scan.
 */
export function stripClassMethodBodies(classCode) {
  const classOpen = findOutsideStrings(classCode, ['{']);
  if (classOpen === -1) return classCode;

  let output = classCode.slice(0, classOpen + 1);
  let i = classOpen + 1;

  while (i < classCode.length) {
    const c = classCode[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(classCode, i);
      output += classCode.slice(i, end + 1);
      i = end + 1;
    } else if (c === '/' && maybeSkipRegex(classCode, i) !== i) {
      const end = maybeSkipRegex(classCode, i);
      output += classCode.slice(i, end + 1);
      i = end + 1;
    } else if (c === '{') {
      // Method (or initializer) body — replace with semicolon
      const close = findMatchingBrace(classCode, i);
      output = output.trimEnd() + ';';
      i = close === -1 ? classCode.length : close + 1;
    } else {
      output += c;
      i++;
    }
  }
  return output;
}

const MAX_JSDOC_CHARS = 600;

/**
 * Formats a raw JSDoc capture back into a clean comment block. Capped at
 * MAX_JSDOC_CHARS — snapshots are contracts, not documentation dumps, and
 * the cap also limits how much arbitrary comment text (a potential prompt
 * injection channel) flows into AI-facing context.
 */
function formatJSDoc(jsdocRaw) {
  let raw = jsdocRaw;
  if (raw.length > MAX_JSDOC_CHARS) {
    raw = raw.slice(0, MAX_JSDOC_CHARS) + ' […truncated]';
  }
  return `/**\n${raw.split('\n').map(line => ` * ${line.replace(/^\s*\*?\s*/, '')}`).join('\n')}\n */`;
}

/**
 * Returns the formatted JSDoc block that immediately precedes idx in the
 * original source, or undefined if none is attached.
 */
function jsdocBefore(content, idx) {
  const before = content.slice(0, idx);
  const m = before.match(/\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*$/);
  return m ? formatJSDoc(m[1].trim()) : undefined;
}

/**
 * Extracts a signature: everything before the body brace (or up to ';').
 * Braces inside parentheses (e.g. default params `options = {}`) and inside
 * strings don't end the signature — only a top-level '{' or ';' does.
 */
function headSignature(code) {
  let parenDepth = 0;
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(code, i);
    } else if (c === '/') {
      i = maybeSkipRegex(code, i);
    } else if (c === '(') {
      parenDepth++;
    } else if (c === ')') {
      parenDepth--;
    } else if (parenDepth === 0 && c === '{') {
      return code.substring(0, i).trim().replace(/\s+/g, ' ') + ';';
    } else if (parenDepth === 0 && c === ';') {
      return code.substring(0, i + 1).trim().replace(/\s+/g, ' ');
    }
    i++;
  }
  return code.trim().replace(/\s+/g, ' ');
}

/** Extracts a class/interface signature with balanced braces, bodies stripped for classes. */
function blockSignature(code, type) {
  const braceIdx = findOutsideStrings(code, ['{']);
  if (braceIdx === -1) return code.trim();

  const closeIdx = findMatchingBrace(code, braceIdx);
  const end = closeIdx === -1 ? code.length : closeIdx + 1;
  let signature = code.substring(0, end).trim();

  if (type === 'class') {
    signature = stripClassMethodBodies(signature);
  }
  return signature;
}

/**
 * Parses a single file, extracting its JSDoc comments and export declarations.
 * Handles ESM (export function/const/class/interface/type, export default,
 * export { ... }) and CommonJS (exports.foo =, module.exports.foo =,
 * module.exports = { ... }).
 *
 * @param {string} filePath - Absolute path to the source file.
 * @returns {Promise<{filepath: string, exports: Array}>} List of exports.
 */
export async function parseFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  // Three same-length views, indices interchangeable:
  //   content — original; JSDoc is read from here.
  //   clean   — comments blanked; signature text is sliced from here.
  //   scan    — comments + string/regex interiors blanked; all regex
  //             matching and brace counting run here, so export syntax
  //             inside string values can't produce phantom exports.
  const clean = blankComments(content);
  const scan = blankStrings(clean);
  const found = [];

  // ── ESM named declarations ──
  const exportRegex = /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function\s*\*|function|const|class|interface|type|enum|let|var)\s+([a-zA-Z0-9_$]+)/g;
  let match;
  while ((match = exportRegex.exec(scan)) !== null) {
    const keyword = match[1].replace(/\s+/g, '');
    const type = keyword === 'function*' ? 'function' : keyword;
    const name = match[2];
    const startIdx = match.index;
    const exportContent = clean.substring(startIdx);

    let signature;
    if (type === 'class' || type === 'interface' || type === 'enum') {
      signature = blockSignature(exportContent, type);
    } else {
      signature = headSignature(exportContent);
      // Arrow values: drop a trailing '=>' left before the body brace
      if (signature.endsWith('=>;')) {
        signature = signature.slice(0, -3).trimEnd() + ';';
      }
    }

    found.push({ idx: startIdx, name, type, signature, jsdoc: jsdocBefore(content, startIdx) });
  }

  // ── ESM default exports: function/class form ──
  let hasDefaultExport = false;
  const defaultDeclIdx = new Set();
  const defaultRegex = /export\s+default\s+(async\s+)?(function\s*\*|function|class)(\s+[a-zA-Z0-9_$]+)?/g;
  while ((match = defaultRegex.exec(scan)) !== null) {
    const type = match[2].replace(/\s+/g, '') === 'class' ? 'class' : 'function';
    const name = match[3] ? match[3].trim() : 'default';
    const startIdx = match.index;
    const exportContent = clean.substring(startIdx);

    const signature = type === 'function'
      ? headSignature(exportContent)
      : blockSignature(exportContent, type);

    hasDefaultExport = true;
    defaultDeclIdx.add(startIdx);
    found.push({ idx: startIdx, name, type, signature, jsdoc: jsdocBefore(content, startIdx) });
  }

  // ── ESM default exports: expression form (export default foo / {…} / () => …) ──
  const defaultExprRegex = /export\s+default\s+/g;
  while ((match = defaultExprRegex.exec(scan)) !== null) {
    const startIdx = match.index;
    if (defaultDeclIdx.has(startIdx)) continue; // already handled above

    const rhsIdx = startIdx + match[0].length;
    let signature;
    if (clean[rhsIdx] === '{') {
      // Object literal: list its top-level keys
      const closeIdx = findMatchingBrace(scan, rhsIdx);
      const inner = closeIdx === -1 ? '' : scan.substring(rhsIdx + 1, closeIdx);
      const keys = inner
        .split(',')
        .map(part => part.split(':')[0].trim())
        .filter(n => /^[a-zA-Z0-9_$]+$/.test(n));
      signature = `export default { ${keys.join(', ')} };`;
    } else {
      signature = headSignature(clean.substring(startIdx));
      if (signature.endsWith('=>;')) {
        signature = signature.slice(0, -3).trimEnd() + ';';
      }
    }

    hasDefaultExport = true;
    found.push({ idx: startIdx, name: 'default', type: 'export', signature, jsdoc: jsdocBefore(content, startIdx) });
  }

  // ── ESM re-export all: export * [as ns] from '...' ──
  const starRegex = /export\s*\*\s*(?:as\s+([a-zA-Z0-9_$]+)\s+)?from\s*['"]([^'"]+)['"]/g;
  while ((match = starRegex.exec(scan)) !== null) {
    found.push({
      idx: match.index,
      name: match[1] || '*',
      type: 'export',
      signature: clean.slice(match.index, match.index + match[0].length).trim().replace(/\s+/g, ' ') + ';',
      jsdoc: undefined
    });
  }

  // ── ESM named export lists: export [type] { a, b as c } [from '...'] ──
  const namedListRegex = /export\s+type\s*\{([^}]*)\}(\s*from\s*['"][^'"]+['"])?|export\s*\{([^}]*)\}(\s*from\s*['"][^'"]+['"])?/g;
  while ((match = namedListRegex.exec(scan)) !== null) {
    const names = (match[1] ?? match[3])
      .split(',')
      .map(part => {
        const asMatch = part.trim().match(/(?:.*\s+as\s+)?([a-zA-Z0-9_$]+)\s*$/);
        return asMatch ? asMatch[1] : part.trim();
      })
      .filter(Boolean);
    if (names.length === 0) continue;

    found.push({
      idx: match.index,
      name: names.join(', '),
      type: 'export',
      signature: clean.slice(match.index, match.index + match[0].length).trim().replace(/\s+/g, ' ') + ';',
      jsdoc: undefined
    });
  }

  // ── CommonJS property exports: exports.foo = / module.exports.foo = ──
  // Lookbehind rejects other objects (file.exports.x); (?!=) rejects comparisons (===).
  const cjsPropRegex = /(?<![.\w])(?:module\.)?exports\.([a-zA-Z0-9_$]+)\s*=(?!=)/g;
  while ((match = cjsPropRegex.exec(scan)) !== null) {
    const name = match[1];
    const startIdx = match.index;
    const rhs = clean.substring(startIdx + match[0].length);
    const isFunction = /^\s*(async\s+)?(function\b|\()/.test(rhs) || /^[^;{]*=>/.test(rhs.split('\n')[0]);

    found.push({
      idx: startIdx,
      name,
      type: isFunction ? 'function' : 'const',
      signature: headSignature(clean.substring(startIdx)),
      jsdoc: jsdocBefore(content, startIdx)
    });
  }

  // ── CommonJS object export: module.exports = { a, b } ──
  const cjsObjectRegex = /module\.exports\s*=\s*\{/g;
  while ((match = cjsObjectRegex.exec(scan)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const closeIdx = findMatchingBrace(scan, openIdx);
    if (closeIdx === -1) continue;

    const inner = scan.substring(openIdx + 1, closeIdx);
    const names = inner
      .split(',')
      .map(part => part.split(':')[0].trim())
      .filter(n => /^[a-zA-Z0-9_$]+$/.test(n));
    if (names.length === 0) continue;

    found.push({
      idx: match.index,
      name: names.join(', '),
      type: 'export',
      signature: `module.exports = { ${names.join(', ')} };`,
      jsdoc: undefined
    });
  }

  // ── Validation: cross-check regex results against es-module-lexer ──
  // The lexer is a spec-accurate ESM lexer; any export name it finds that the
  // regexes missed becomes a name-only stub plus a warning, so a parser gap
  // is loud instead of silent.
  const warnings = [];
  try {
    await lexerInit;
    const [, lexExports] = lexerParse(content, filePath);
    const known = new Set();
    for (const exp of found) {
      for (const n of String(exp.name).split(',')) known.add(n.trim());
    }
    if (hasDefaultExport) known.add('default');

    for (const le of lexExports) {
      const name = le.n;
      if (!name || known.has(name)) continue;
      found.push({
        idx: le.s ?? clean.length,
        name,
        type: 'export',
        signature: `export ${name}; // signature unresolved`,
        jsdoc: undefined
      });
      warnings.push(`${name}: export found by validator but missed by parser — emitted name-only stub`);
    }
  } catch {
    // Lexer rejects some TS-only syntax; validation is best-effort there.
  }

  // Preserve source order regardless of which regex found the export
  found.sort((a, b) => a.idx - b.idx);

  // Single pass converting each idx to a 1-based line number (found is sorted)
  let line = 1;
  let pos = 0;
  for (const exp of found) {
    const idx = Math.min(Math.max(exp.idx, 0), content.length);
    for (; pos < idx; pos++) {
      if (content[pos] === '\n') line++;
    }
    exp.line = line;
  }

  return {
    filepath: filePath,
    exports: found.map(({ idx, ...exp }) => exp),
    warnings
  };
}
