const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function minifyJSContent(js) {
  let clean = js.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = clean.split('\n');
  const result = [];
  for (let line of lines) {
    let code = line;
    let inString = false;
    let stringChar = '';
    let commentIdx = -1;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      const next = line[i+1];
      if ((c === '"' || c === "'" || c === '`') && (i === 0 || line[i-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = c;
        } else if (stringChar === c) {
          inString = false;
        }
      }
      if (!inString && c === '/' && next === '/') {
        commentIdx = i;
        break;
      }
    }
    if (commentIdx !== -1) {
      code = line.substring(0, commentIdx);
    }
    const trimmed = code.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result.join('\n');
}

function processDirectory(dir) {
  let count = 0;
  let savedBytes = 0;
  let errors = [];

  function scan(currentDir) {
    for (const f of fs.readdirSync(currentDir)) {
      if (['node_modules', '.git', '.firebase'].includes(f)) continue;
      const fullPath = path.join(currentDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (f.endsWith('.js')) {
        const original = fs.readFileSync(fullPath, 'utf8');
        const minified = minifyJSContent(original);
        if (minified.length >= original.length) continue;

        const tempPath = fullPath + '.tmp.js';
        fs.writeFileSync(tempPath, minified, 'utf8');
        try {
          execSync(`node --check "${tempPath}"`, { stdio: 'pipe' });
          fs.writeFileSync(fullPath, minified, 'utf8');
          savedBytes += (Buffer.byteLength(original) - Buffer.byteLength(minified));
          count++;
        } catch (err) {
          console.log(`⚠️ Skip file with syntax requirement: ${path.basename(fullPath)}`);
          errors.push({ file: fullPath, error: err.message });
        } finally {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      }
    }
  }

  scan(dir);
  console.log(`⚡ Successfully minified ${count} JS files. Saved ${(savedBytes / 1024).toFixed(1)} KB! Errors: ${errors.length}`);
}

const targetDir = path.join(__dirname, '../../public');
processDirectory(targetDir);
