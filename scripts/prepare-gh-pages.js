import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputPublicDir = path.resolve(rootDir, ".output/public");
const distDir = path.resolve(rootDir, "dist");

function getAssetFiles() {
  const assetsDir = path.join(outputPublicDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    console.error("Assets directory not found at:", assetsDir);
    return { cssFiles: [], jsFiles: [] };
  }

  const allAssets = fs.readdirSync(assetsDir);
  const cssFiles = allAssets.filter((f) => f.endsWith(".css")).map((f) => `assets/${f}`);

  // Find index-*.js as main entry
  const mainJs = allAssets.find((f) => f.startsWith("index-") && f.endsWith(".js"));
  const jsFiles = mainJs
    ? [`assets/${mainJs}`]
    : allAssets.filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`);

  return { cssFiles, jsFiles };
}

function generateIndexHtml(
  cssFiles,
  jsFiles,
  routeTitle = "Hospital Hub — Internal Medicine Clinic",
) {
  const cssLinks = cssFiles.map((css) => `    <link rel="stylesheet" href="./${css}">`).join("\n");

  const jsScripts = jsFiles
    .map((js) => `    <script type="module" src="./${js}"></script>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="./favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${routeTitle}</title>
    <meta name="description" content="Hospital management hub, cardiovascular lab appointment portals, staff directory, echocardiogram, stress test, and stock take application." />
    
    <!-- Open Graph / Meta -->
    <meta property="og:title" content="${routeTitle}" />
    <meta property="og:description" content="Hospital management hub, cardiovascular lab appointment portals, staff directory, echocardiogram, stress test, and stock take application." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />

    <!-- Single Page Apps for GitHub Pages Redirection Handler -->
    <script type="text/javascript">
      (function(l) {
        if (l.search[1] === '/' ) {
          var decoded = l.search.slice(1).split('&').map(function(s) { 
            return s.replace(/~and~/g, '&')
          }).join('?');
          window.history.replaceState(null, null,
              l.pathname.slice(0, -1) + decoded + l.hash
          );
        }
      }(window.location))
    </script>

${cssLinks}
  </head>
  <body class="bg-background text-foreground antialiased min-h-screen">
    <div id="root"></div>
${jsScripts}
  </body>
</html>`;
}

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
  console.log("Preparing GitHub Pages static build bundle...");

  if (!fs.existsSync(outputPublicDir)) {
    console.error("Error: .output/public directory does not exist. Run build first.");
    process.exit(1);
  }

  const { cssFiles, jsFiles } = getAssetFiles();
  if (jsFiles.length === 0) {
    console.error("Error: No JS bundles found in .output/public/assets");
    process.exit(1);
  }

  console.log(`Found ${cssFiles.length} CSS files and ${jsFiles.length} JS entry files.`);

  const indexHtmlContent = generateIndexHtml(cssFiles, jsFiles);
  const notFoundHtmlContent = generate404Html();

  // 1. Write index.html and 404.html to .output/public
  fs.writeFileSync(path.join(outputPublicDir, "index.html"), indexHtmlContent, "utf-8");
  fs.writeFileSync(path.join(outputPublicDir, "404.html"), notFoundHtmlContent, "utf-8");
  fs.writeFileSync(path.join(outputPublicDir, ".nojekyll"), "", "utf-8");

  // 2. Pre-generate sub-routes static files so direct access also works directly
  const knownRoutes = [
    { path: "staff", title: "Staff Directory — Hospital Hub" },
    { path: "stress-test", title: "Exercise Stress Test — Hospital Hub" },
    { path: "holter", title: "24H Holter Monitoring — Hospital Hub" },
    { path: "guideline", title: "Clinical Guidelines — Hospital Hub" },
    { path: "stock-take", title: "Stock Take Management — Hospital Hub" },
    { path: "echocardiogram", title: "Echocardiogram — Hospital Hub" },
  ];

  for (const route of knownRoutes) {
    const routeHtml = generateIndexHtml(
      cssFiles.map((c) => `../${c}`),
      jsFiles.map((j) => `../${j}`),
      route.title,
    );

    // Write [route].html
    fs.writeFileSync(path.join(outputPublicDir, `${route.path}.html`), indexHtmlContent, "utf-8");

    // Write [route]/index.html
    const routeDir = path.join(outputPublicDir, route.path);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.writeFileSync(path.join(routeDir, "index.html"), routeHtml, "utf-8");
  }

  // 3. Mirror all files to dist/
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  copyDirectoryRecursive(outputPublicDir, distDir);

  console.log("Successfully prepared GitHub Pages static output in both .output/public and dist/");
}

prepareGitHubPages();
