const fs = require('fs');
const path = require('path');

const publicDir = path.resolve('c:/Users/h/Desktop/Sharik-faiber/public');

const unifiedHeaderHTML = `<header id="header">
    <div class="logo">
      <a href="/index.html"><img class="logo-img" src="/images/logo.svg" alt="شارك" decoding="async"></a>
    </div>
    <button class="menu-icon" id="menuBtn" aria-label="القائمة">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <nav class="nav" id="mainNav">
      <a href="/index.html">Home</a>
      <a href="/work/work.html">How it works</a>
      <a href="/blogs/blogs.html">Blog</a>
      <a href="/Matching/matching.html">Matching</a>
    </nav>

    <div class="header-actions">
      <a href="/login-signup/signup.html"><button class="btn-login">انشاء حساب</button></a>

      <div class="theme-switcher">
        <button id="themeBtn" aria-label="تغيير الوضع">🌙</button>
        <div class="theme-menu" id="themeMenu">
          <button onclick="applyTheme('light')"><span style="margin-left: 8px;">☀️</span> فاتح</button>
          <button onclick="applyTheme('dark')"><span style="margin-left: 8px;">🌙</span> داكن</button>
        </div>
      </div>
    </div>
  </header>`;

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

  // Calculate relative path to public root
  const relativeToRoot = path.relative(path.dirname(file), publicDir).replace(/\\/g, '/');
  const basePath = relativeToRoot === '' ? '.' : relativeToRoot;
  
  // 1. Replace <header>...</header>
  const headerRegex = /<header[^>]*>[\s\S]*?<\/header>/i;
  let dynamicHeader = unifiedHeaderHTML
    .replace(/\/images\//g, basePath + '/images/')
    .replace(/\/index\.html/g, basePath + '/index.html')
    .replace(/\/work\//g, basePath + '/work/')
    .replace(/\/blogs\//g, basePath + '/blogs/')
    .replace(/\/Matching\//g, basePath + '/Matching/')
    .replace(/\/login-signup\//g, basePath + '/login-signup/');
  
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, dynamicHeader);
  } else {
    console.log("No header found in:", file);
    return;
  }

  // 2. Inject CSS right before </head> if not present
  // we check for `unified-header.css` generically
  if (!content.includes('unified-header.css')) {
    content = content.replace(/(<\/head>)/i, `  <link rel="stylesheet" href="${basePath}/unified-header.css" />\n$1`);
  } else {
    // If it already exists, make sure the path is dynamic
    content = content.replace(/<link rel="stylesheet"[^>]*href="[^"]*unified-header\.css"[^>]*>/i, `<link rel="stylesheet" href="${basePath}/unified-header.css" />`);
  }

  // 3. Inject JS right after </header> if not present
  if (!content.includes('unified-header.js')) {
    content = content.replace(/(<\/header>)/i, `$1\n  <script src="${basePath}/unified-header.js"></script>`);
  } else {
    content = content.replace(/<script src="[^"]*unified-header\.js"><\/script>/i, `<script src="${basePath}/unified-header.js"></script>`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    replacedCount++;
  }
});

console.log("Successfully replaced header in " + replacedCount + " files.");
