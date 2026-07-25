const fs = require('fs');
const path = require('path');

const publicDir = path.resolve('c:/Users/h/Desktop/Sharik-faiber/public');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.js') && !file.endsWith('unified-header.js') && !file.endsWith('auth.js')) {
        results.push(file);
      }
    }
  });
  return results;
}

const jsFiles = walk(publicDir);
let replacedCount = 0;

jsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Extremely flexible Regex to remove the block from "let mainNav" to "applyTheme("dark");\n}"
  // Because formatting might differ, we use [\s\S]*? between known anchors.
  const regex = /(?:let|const|var)?\s*mainNav\s*=\s*document\.getElementById\("mainNav"\);[\s\S]*?applyTheme\("dark"\);\s*\}/g;
  
  if (regex.test(content)) {
    content = content.replace(regex, '/* Header logic moved to unified-header.js */');
  }

  // Some files might have window.onload or DOMContentLoaded wrappers. The above regex matches anything in between.

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    replacedCount++;
    console.log("Cleaned header logic in: ", file);
  }
});

console.log("Successfully removed duplicated header logic in " + replacedCount + " JS files.");
