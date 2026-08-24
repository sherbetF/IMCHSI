import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const publicDir = path.resolve(rootDir, "public");

function generate404Html() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Hospital Hub</title>
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages
      // MIT License
      // https://github.com/rafgraph/spa-github-pages
      var pathSegmentsToKeep = 1;
      var l = window.location;
      
      // If hosted on custom domain or root domain, keep 0 segments
      if (!l.hostname.endsWith('.github.io')) {
        pathSegmentsToKeep = 0;
      }
      
      var newPath = l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.split('/').slice(1 + pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash;
        
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') + newPath
      );
    </script>
  </head>
  <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
    <div style="text-align: center; padding: 20px;">
      <h2 style="margin-bottom: 8px;">Loading Hospital Hub...</h2>
      <p style="color: #94a3b8; font-size: 14px;">Redirecting you to the requested page.</p>
    </div>
  </body>
</html>`;
}

function copyDirectoryRecursive(source, target) {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function prepareGitHubPages() {
  console.log("Preparing GitHub Pages distribution...");

  if (!fs.existsSync(distDir)) {
    console.error("Error: dist directory does not exist. Run vite build first.");
    process.exit(1);
  }

  const indexHtmlPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtmlPath)) {
    console.error("Error: dist/index.html does not exist.");
    process.exit(1);
  }

  const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf-8");

  // 1. Write 404.html and .nojekyll
  fs.writeFileSync(path.join(distDir, "404.html"), generate404Html(), "utf-8");
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "", "utf-8");

  // 2. Pre-generate known sub-routes as static files so direct access / reload works on GitHub Pages
  const knownRoutes = [
    "staff",
    "stress-test",
    "holter",
    "guideline",
    "stock-take",
    "echocardiogram",
  ];

  for (const route of knownRoutes) {
    // Write dist/[route].html
    fs.writeFileSync(path.join(distDir, `${route}.html`), indexHtmlContent, "utf-8");

    // Write dist/[route]/index.html
    const routeDir = path.join(distDir, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.writeFileSync(path.join(routeDir, "index.html"), indexHtmlContent, "utf-8");
  }

  // 3. Ensure static public assets (favicon, images, etc.) are in dist/
  if (fs.existsSync(publicDir)) {
    copyDirectoryRecursive(publicDir, distDir);
  }

  console.log("Successfully prepared GitHub Pages static output in dist/");
}

prepareGitHubPages();
