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
      if (file.endsWith('.html')) {
        results.push(file);
      }
    }
  });
  return results;
}

const htmlFiles = walk(publicDir);
let replacedCount = 0;

htmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace src of logo-img
  content = content.replace(/\/images\/ChatGPT Image 12 مايو 2026، 06_28_48 م\.png/g, '/images/logo.png');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    replacedCount++;
  }
});

console.log("Successfully updated logo src in " + replacedCount + " files.");
