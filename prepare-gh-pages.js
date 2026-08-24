import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const publicDir = path.resolve(rootDir, "public");

function copyDirectoryRecursive(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectoryRecursive(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function prepareGitHubPages() {
  console.log("Preparing GitHub Pages distribution...");

  if (!fs.existsSync(distDir)) {
    console.error("ERROR: dist directory does not exist. Run the Vite build first.");
    process.exit(1);
  }

  const indexHtmlPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtmlPath)) {
    console.error("ERROR: dist/index.html does not exist.");
    process.exit(1);
  }

  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

  // Disable Jekyll processing so Vite assets are served unchanged.
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "", "utf8");

  // GitHub Pages serves 404.html for an unknown deep URL. Using the actual SPA
  // document here lets TanStack Router read window.location.pathname directly.
  // No redirect/query-string encoding is needed.
  fs.writeFileSync(path.join(distDir, "404.html"), indexHtml, "utf8");

  // Physical route directories avoid the 404 hop for the public appointment URLs.
  const routes = ["echo", "stress-test", "holter"];
  for (const route of routes) {
    const routeDirectory = path.join(distDir, route);
    fs.mkdirSync(routeDirectory, { recursive: true });
    fs.writeFileSync(path.join(routeDirectory, "index.html"), indexHtml, "utf8");
    console.log(`Created route: /${route}`);
  }

  // Keep compatibility with hosts that resolve /route.html.
  for (const route of routes) {
    fs.writeFileSync(path.join(distDir, `${route}.html`), indexHtml, "utf8");
  }

  if (fs.existsSync(publicDir)) copyDirectoryRecursive(publicDir, distDir);

  const rootCnamePath = path.join(rootDir, "CNAME");
  if (fs.existsSync(rootCnamePath)) {
    fs.copyFileSync(rootCnamePath, path.join(distDir, "CNAME"));
  }

  console.log("GitHub Pages preparation completed.");
  console.log("Routes generated:");
  for (const route of routes) console.log(`  https://imchsi.com/${route}`);
}

prepareGitHubPages();
