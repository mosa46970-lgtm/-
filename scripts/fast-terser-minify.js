/**
 * High-Performance In-Memory Terser Minifier
 * Minifies all JS files in public/ into single-line AST-optimized production code in under 1 second.
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function processDirectory(dir) {
  let count = 0;
  let totalOrig = 0;
  let totalMin = 0;
  let errors = [];

  async function scan(currentDir) {
    for (const f of fs.readdirSync(currentDir)) {
      if (['node_modules', '.git', '.firebase'].includes(f)) continue;
      const fullPath = path.join(currentDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        await scan(fullPath);
      } else if (f.endsWith('.js')) {
        const original = fs.readFileSync(fullPath, 'utf8');
        if (!original.trim()) continue;

        try {
          const result = await minify(original, {
            compress: {
              drop_console: false,
              passes: 2,
            },
            mangle: true,
            toplevel: false,
          });

          if (result.code && result.code.length < original.length) {
            fs.writeFileSync(fullPath, result.code, 'utf8');
            totalOrig += Buffer.byteLength(original);
            totalMin += Buffer.byteLength(result.code);
            count++;
          }
        } catch (err) {
          errors.push({ file: path.relative(process.cwd(), fullPath), error: err.message });
        }
      }
    }
  }

  await scan(dir);
  console.log(`🎉 Fast Terser Summary:`);
  console.log(`- Files Minified into Single-Line Code: ${count}`);
  console.log(`- Original Size: ${(totalOrig / 1024).toFixed(1)} KB`);
  console.log(`- Minified Size: ${(totalMin / 1024).toFixed(1)} KB`);
  console.log(`- Saved: ${Math.round(((totalOrig - totalMin) / totalOrig) * 100)}%`);
  console.log(`- Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log(JSON.stringify(errors, null, 2));
  }
}

const targetDir = path.join(__dirname, '../../public');
processDirectory(targetDir);
