/**
 * Sharik Production JS Minifier using Terser (AST Engine)
 * Minifies all JavaScript files into single-line production bundles.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function minifyJSFile(filePath) {
  try {
    const original = fs.readFileSync(filePath, 'utf8');
    if (!original.trim()) return 0;

    // Use npx terser to compress and mangle JS safely
    const command = `npx -y terser "${filePath}" --compress --mangle -o "${filePath}"`;
    execSync(command, { stdio: 'pipe' });

    const minified = fs.readFileSync(filePath, 'utf8');
    return Buffer.byteLength(original) - Buffer.byteLength(minified);
  } catch (err) {
    console.error(`⚠️ Terser error on ${path.basename(filePath)}:`, err.message);
    return 0;
  }
}

function processDirectory(dir) {
  let count = 0;
  let savedBytes = 0;

  function scan(currentDir) {
    for (const f of fs.readdirSync(currentDir)) {
      if (['node_modules', '.git', '.firebase'].includes(f)) continue;
      const fullPath = path.join(currentDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (f.endsWith('.js')) {
        const bytesSaved = minifyJSFile(fullPath);
        if (bytesSaved > 0) {
          savedBytes += bytesSaved;
          count++;
        }
      }
    }
  }

  scan(dir);
  console.log(`🎉 Terser AST Minifier Summary:`);
  console.log(`- Files Minified: ${count}`);
  console.log(`- Saved Size: ${(savedBytes / 1024).toFixed(1)} KB`);
}

const targetDir = path.join(__dirname, '../../public');
processDirectory(targetDir);
