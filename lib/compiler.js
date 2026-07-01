import path from 'path';

/**
 * Compiles a list of parsed files and their exports into a single markdown document.
 * 
 * @param {Array} scannedFiles - List of parsed file descriptors.
 * @returns {string} The formatted markdown string.
 */
export function compileMarkdown(scannedFiles) {
  let md = `# CONTEXTIFY CODEBASE CONTEXT (Generated ${new Date().toISOString().split('T')[0]})\n\n`;

  for (const file of scannedFiles) {
    if (file.exports.length === 0) continue;

    // Use only basename or relative path for display in markdown
    const relativePath = path.basename(file.filepath);
    md += `## File: ${relativePath}\n`;
    md += `\`\`\`typescript\n`;
    for (const exp of file.exports) {
      if (exp.jsdoc) {
        md += `${exp.jsdoc}\n`;
      }
      md += `${exp.signature}\n\n`;
    }
    md += `\`\`\`\n\n`;
  }
  return md.trim() + '\n';
}

/**
 * Generates the ANSI console tree representation of the parsed files.
 * 
 * @param {Array} scannedFiles - List of parsed file descriptors.
 * @param {string} baseDir - Base target folder path for resolving relative directories.
 * @returns {string} The console tree string.
 */
export function generateASCIITree(scannedFiles, baseDir) {
  let tree = `  \x1b[1;32m[Contextify] ──────────────────────────────────────────\x1b[0m\n`;
  
  const filesWithExports = scannedFiles.filter(f => f.exports.length > 0);
  
  if (filesWithExports.length === 0) {
    tree += `  \x1b[33m⚠ No exportable functions found in targeted path.\x1b[0m\n`;
  } else {
    const limit = 30;
    const toRender = filesWithExports.slice(0, limit);
    
    toRender.forEach((file, index) => {
      const relativePath = path.relative(baseDir, file.filepath);
      const isLast = index === toRender.length - 1 && filesWithExports.length <= limit;
      const prefix = isLast ? '  └── ' : '  ├── ';
      const exportsList = file.exports.map(e => e.name).join(', ');
      
      tree += `  \x1b[36m${prefix}${relativePath}\x1b[0m (\x1b[37m${exportsList}\x1b[0m)\n`;
    });
    
    if (filesWithExports.length > limit) {
      tree += `  └── ... and ${filesWithExports.length - limit} more files (Tree truncated. Complete signatures in .ai-context.md)\n`;
    }
  }
  
  tree += `  \x1b[1;32m───────────────────────────────────────────────────────\x1b[0m`;
  return tree;
}
