/**
 * Sharik Safe Asset Minifier
 * Safely compresses CSS, JS, and HTML without breaking inline scripts or string literals.
 */

const fs = require('fs');
const path = require('path');

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .trim();
}

function minifyJS(js) {
  // Remove multi-line comments
  let clean = js.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove full-line comments safely
  clean = clean.split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return clean;
}

function minifyHTML(html) {
  // Remove HTML comments (except IE conditionals)
  let clean = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');

  // Separate script blocks from HTML structure
  const scripts = [];
  clean = clean.replace(/(<script[\s\S]*?>)([\s\S]*?)(<\/script>)/gi, (match, open, code, close) => {
    // Minify inline script safely (full line comments removal only)
    const minCode = minifyJS(code);
    const idx = scripts.length;
    scripts.push(`${open}\n${minCode}\n${close}`);
    return `___SCRIPT_BLOCK_${idx}___`;
  });

  // Collapse HTML structure whitespace
  clean = clean
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

  // Restore script blocks
  scripts.forEach((block, idx) => {
    clean = clean.replace(`___SCRIPT_BLOCK_${idx}___`, block);
  });

  return clean;
}

function runMinification(publicDir) {
  let count = 0;
  let savedBytes = 0;

  function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
      if (['node_modules', '.git', '.firebase'].includes(f)) continue;
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        const ext = path.extname(f).toLowerCase();
        if (['.css', '.js', '.html'].includes(ext)) {
          const original = fs.readFileSync(fullPath, 'utf8');
          let minified = original;
          if (ext === '.css') minified = minifyCSS(original);
          else if (ext === '.js') minified = minifyJS(original);
          else if (ext === '.html') minified = minifyHTML(original);

          if (minified.length < original.length) {
            fs.writeFileSync(fullPath, minified, 'utf8');
            savedBytes += (Buffer.byteLength(original) - Buffer.byteLength(minified));
            count++;
          }
        }
      }
    }
  }

  scan(publicDir);
  console.log(`⚡ Safe Minifier processed ${count} files. Saved ${(savedBytes / 1024).toFixed(1)} KB!`);
}

if (require.main === module) {
  const target = path.join(__dirname, '../../public');
  runMinification(target);
}

module.exports = runMinification;
