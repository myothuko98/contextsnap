import fs from 'fs/promises';

/**
 * Strips class method implementations, replacing bodies with semicolons.
 */
export function stripClassMethodBodies(classCode) {
  let output = '';
  let braceCount = 0;
  let inClass = false;
  let inMethodBody = false;
  let i = 0;

  while (i < classCode.length) {
    const char = classCode[i];

    if (!inClass) {
      output += char;
      if (char === '{') {
        inClass = true;
        braceCount = 1;
      }
    } else {
      if (!inMethodBody) {
        if (char === '{') {
          inMethodBody = true;
          braceCount = 1;
          output += ';'; // Replace body with semicolon
        } else if (char === '}') {
          inClass = false;
          output += char;
        } else {
          output += char;
        }
      } else {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            inMethodBody = false;
          }
        }
      }
    }
    i++;
  }
  return output;
}

/**
 * Strips function bodies from a standalone code snippet, replacing them with semicolons.
 */
export function stripFunctionBody(code) {
  let output = '';
  let braceCount = 0;
  let inBody = false;
  let i = 0;

  while (i < code.length) {
    const char = code[i];

    if (!inBody) {
      if (char === '{') {
        braceCount = 1;
        inBody = true;
        output = output.trimEnd() + ';';
      } else {
        output += char;
      }
    } else {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          inBody = false;
        }
      }
    }
    i++;
  }
  return output;
}

/**
 * Parses a single file, extracting its JSDoc comments and export declarations.
 * 
 * @param {string} filePath - Absolute path to the source file.
 * @returns {Promise<{filepath: string, exports: Array}>} List of exports.
 */
export async function parseFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const exportsList = [];
  
  // Matches: JSDoc (optional) + export + async (optional) + keyword + name
  const exportRegex = /(?:\/\*\*([\s\S]*?)\*\/)?\s*export\s+(async\s+)?(function|const|class|interface|type)\s+([a-zA-Z0-9_]+)/g;
  
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const jsdocRaw = match[1] ? match[1].trim() : undefined;
    const type = match[3];
    const name = match[4];
    const startIdx = match.index;
    
    // Format JSDoc comments back cleanly
    const jsdoc = jsdocRaw 
      ? `/**\n${jsdocRaw.split('\n').map(line => ` * ${line.replace(/^\s*\*?\s*/, '')}`).join('\n')}\n */` 
      : undefined;
      
    let signature = '';
    const exportContent = content.substring(startIdx);
    
    if (type === 'function') {
      const braceIdx = exportContent.indexOf('{');
      if (braceIdx !== -1) {
        signature = exportContent.substring(0, braceIdx).trim();
        signature = signature.replace(/\s+/g, ' ') + ';';
      } else {
        const semiIdx = exportContent.indexOf(';');
        signature = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1).trim() : exportContent.trim();
        signature = signature.replace(/\s+/g, ' ');
      }
    } else if (type === 'const') {
      const braceIdx = exportContent.indexOf('{');
      const semiIdx = exportContent.indexOf(';');
      
      if (braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx)) {
        let sigPart = exportContent.substring(0, braceIdx).trim();
        if (sigPart.endsWith('=>')) {
          sigPart = sigPart.substring(0, sigPart.length - 2).trim();
        }
        signature = sigPart.replace(/\s+/g, ' ') + ';';
      } else {
        signature = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1).trim() : exportContent.trim();
        signature = signature.replace(/\s+/g, ' ');
      }
    } else if (type === 'class' || type === 'interface') {
      let braceCount = 0;
      const braceIdx = exportContent.indexOf('{');
      if (braceIdx !== -1) {
        braceCount = 1;
        let i = braceIdx + 1;
        while (i < exportContent.length && braceCount > 0) {
          if (exportContent[i] === '{') braceCount++;
          if (exportContent[i] === '}') braceCount--;
          i++;
        }
        signature = exportContent.substring(0, i).trim();
        
        if (type === 'class') {
          signature = stripClassMethodBodies(signature);
        }
      } else {
        signature = exportContent.trim();
      }
    } else if (type === 'type') {
      const semiIdx = exportContent.indexOf(';');
      signature = semiIdx !== -1 ? exportContent.substring(0, semiIdx + 1).trim() : exportContent.trim();
      signature = signature.replace(/\s+/g, ' ');
    }
    
    exportsList.push({
      name,
      type,
      signature,
      jsdoc
    });
  }
  
  return {
    filepath: filePath,
    exports: exportsList
  };
}
