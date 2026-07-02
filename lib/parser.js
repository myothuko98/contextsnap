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
 * Finds the first index of any target character, ignoring characters
 * inside string and template literals.
 *
 * @param {string} code - Source snippet to scan.
 * @param {string[]} targets - Characters to look for.
 * @returns {number} Index of first match, or -1.
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
 *
 * @param {string} code - Source snippet.
 * @param {number} openIdx - Index of the opening '{'.
 * @returns {number} Index of the matching '}', or -1 if unbalanced.
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

/** Extracts a function signature: everything before the body brace. */
function functionSignature(exportContent) {
  const braceIdx = findOutsideStrings(exportContent, ['{']);
  if (braceIdx !== -1) {
    return exportContent.substring(0, braceIdx).trim().replace(/\s+/g, ' ') + ';';
  }
  const semiIdx = findOutsideStrings(exportContent, [';']);
  const sig = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1) : exportContent;
  return sig.trim().replace(/\s+/g, ' ');
}

/** Extracts a class/interface signature with balanced braces, bodies stripped for classes. */
function blockSignature(exportContent, type) {
  const braceIdx = findOutsideStrings(exportContent, ['{']);
  if (braceIdx === -1) return exportContent.trim();

  const closeIdx = findMatchingBrace(exportContent, braceIdx);
  const end = closeIdx === -1 ? exportContent.length : closeIdx + 1;
  let signature = exportContent.substring(0, end).trim();

  if (type === 'class') {
    signature = stripClassMethodBodies(signature);
  }
  return signature;
}

/**
 * Parses a single file, extracting its JSDoc comments and export declarations.
 * Handles: export function/const/class/interface/type, export default, export { ... }.
 *
 * @param {string} filePath - Absolute path to the source file.
 * @returns {Promise<{filepath: string, exports: Array}>} List of exports.
 */
export async function parseFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const found = [];

  // Named declarations: JSDoc (optional) + export + async (optional) + keyword + name.
  // The JSDoc capture forbids '*/' inside, so it can never swallow a neighboring comment.
  const exportRegex = /(?:\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*)?export\s+(async\s+)?(function|const|class|interface|type)\s+([a-zA-Z0-9_]+)/g;

  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const jsdocRaw = match[1] ? match[1].trim() : undefined;
    const type = match[3];
    const name = match[4];
    const startIdx = match.index;
    const jsdoc = jsdocRaw ? formatJSDoc(jsdocRaw) : undefined;
    const exportContent = content.substring(startIdx);

    let signature = '';
    if (type === 'function') {
      signature = functionSignature(exportContent);
    } else if (type === 'const') {
      const braceIdx = findOutsideStrings(exportContent, ['{']);
      const semiIdx = findOutsideStrings(exportContent, [';']);

      if (braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx)) {
        // Arrow function or object literal — keep only the declaration part
        let sigPart = exportContent.substring(0, braceIdx).trim();
        if (sigPart.endsWith('=>')) {
          sigPart = sigPart.substring(0, sigPart.length - 2).trim();
        }
        signature = sigPart.replace(/\s+/g, ' ') + ';';
      } else {
        const sig = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1) : exportContent;
        signature = sig.trim().replace(/\s+/g, ' ');
      }
    } else if (type === 'class' || type === 'interface') {
      signature = blockSignature(exportContent, type);
    } else if (type === 'type') {
      const semiIdx = findOutsideStrings(exportContent, [';']);
      const sig = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1) : exportContent;
      signature = sig.trim().replace(/\s+/g, ' ');
    }

    found.push({ idx: startIdx, name, type, signature, jsdoc });
  }

  // Default exports: export default [async] function/class [Name]
  const defaultRegex = /(?:\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*)?export\s+default\s+(async\s+)?(function|class)(\s+[a-zA-Z0-9_]+)?/g;
  while ((match = defaultRegex.exec(content)) !== null) {
    const jsdocRaw = match[1] ? match[1].trim() : undefined;
    const type = match[3];
    const name = match[4] ? match[4].trim() : 'default';
    const startIdx = match.index;
    const jsdoc = jsdocRaw ? formatJSDoc(jsdocRaw) : undefined;
    const exportContent = content.substring(startIdx);

    const signature = type === 'function'
      ? functionSignature(exportContent)
      : blockSignature(exportContent, type);

    found.push({ idx: startIdx, name, type, signature, jsdoc });
  }

  // Named export lists: export { a, b as c } [from '...']
  const namedListRegex = /export\s*\{([^}]*)\}(\s*from\s*['"][^'"]+['"])?/g;
  while ((match = namedListRegex.exec(content)) !== null) {
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

  // Preserve source order regardless of which regex found the export
  found.sort((a, b) => a.idx - b.idx);

  return {
    filepath: filePath,
    exports: found.map(({ idx, ...exp }) => exp)
  };
}
