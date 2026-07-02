import fs from 'fs/promises';

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
 * Finds the first index of any target character, ignoring characters
 * inside string and template literals.
 */
function findOutsideStrings(code, targets) {
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(code, i);
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

/** Formats a raw JSDoc capture back into a clean comment block. */
function formatJSDoc(jsdocRaw) {
  return `/**\n${jsdocRaw.split('\n').map(line => ` * ${line.replace(/^\s*\*?\s*/, '')}`).join('\n')}\n */`;
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
  // All matching runs on the comment-blanked copy; JSDoc is read from the
  // original via the 1:1 index mapping.
  const clean = blankComments(content);
  const found = [];

  // ── ESM named declarations ──
  const exportRegex = /export\s+(async\s+)?(function|const|class|interface|type)\s+([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = exportRegex.exec(clean)) !== null) {
    const type = match[2];
    const name = match[3];
    const startIdx = match.index;
    const exportContent = clean.substring(startIdx);

    let signature;
    if (type === 'function' || type === 'const' || type === 'type') {
      signature = headSignature(exportContent);
      // Arrow consts: drop a trailing '=>' left before the body brace
      if (type === 'const' && signature.endsWith('=>;')) {
        signature = signature.slice(0, -3).trimEnd() + ';';
      }
    } else {
      signature = blockSignature(exportContent, type);
    }

    found.push({ idx: startIdx, name, type, signature, jsdoc: jsdocBefore(content, startIdx) });
  }

  // ── ESM default exports ──
  const defaultRegex = /export\s+default\s+(async\s+)?(function|class)(\s+[a-zA-Z0-9_]+)?/g;
  while ((match = defaultRegex.exec(clean)) !== null) {
    const type = match[2];
    const name = match[3] ? match[3].trim() : 'default';
    const startIdx = match.index;
    const exportContent = clean.substring(startIdx);

    const signature = type === 'function'
      ? headSignature(exportContent)
      : blockSignature(exportContent, type);

    found.push({ idx: startIdx, name, type, signature, jsdoc: jsdocBefore(content, startIdx) });
  }

  // ── ESM named export lists: export { a, b as c } [from '...'] ──
  const namedListRegex = /export\s*\{([^}]*)\}(\s*from\s*['"][^'"]+['"])?/g;
  while ((match = namedListRegex.exec(clean)) !== null) {
    const names = match[1]
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
      signature: match[0].trim().replace(/\s+/g, ' ') + ';',
      jsdoc: undefined
    });
  }

  // ── CommonJS property exports: exports.foo = / module.exports.foo = ──
  // Lookbehind rejects other objects (file.exports.x); (?!=) rejects comparisons (===).
  const cjsPropRegex = /(?<![.\w])(?:module\.)?exports\.([a-zA-Z0-9_$]+)\s*=(?!=)/g;
  while ((match = cjsPropRegex.exec(clean)) !== null) {
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
  while ((match = cjsObjectRegex.exec(clean)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const closeIdx = findMatchingBrace(clean, openIdx);
    if (closeIdx === -1) continue;

    const inner = clean.substring(openIdx + 1, closeIdx);
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

  // Preserve source order regardless of which regex found the export
  found.sort((a, b) => a.idx - b.idx);

  return {
    filepath: filePath,
    exports: found.map(({ idx, ...exp }) => exp)
  };
}
