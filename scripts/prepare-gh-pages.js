import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const publicDir = path.resolve(rootDir, "public");

/**
 * Recursively copy a directory.
 */
function copyDirectoryRecursive(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(target, { recursive: true });

  const entries = fs.readdirSync(source, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * Prepare GitHub Pages deployment.
 */
function prepareGitHubPages() {
  console.log("Preparing GitHub Pages distribution...");

  // ------------------------------------------------------------
  // 1. Verify Vite build exists
  // ------------------------------------------------------------

  if (!fs.existsSync(distDir)) {
    console.error("ERROR: dist directory does not exist.");
    console.error("Run the Vite build first.");
    process.exit(1);
  }

  const indexHtmlPath = path.join(distDir, "index.html");

  if (!fs.existsSync(indexHtmlPath)) {
    console.error("ERROR: dist/index.html does not exist.");
    process.exit(1);
  }

  // Read the finished Vite index.html.
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

  // ------------------------------------------------------------
  // 2. Create .nojekyll
  // ------------------------------------------------------------

  fs.writeFileSync(
    path.join(distDir, ".nojekyll"),
    "",
    "utf8"
  );

  // ------------------------------------------------------------
  // 3. Create 404.html
  //
  // GitHub Pages has no server-side React routing.
  // If someone enters a route directly, GitHub Pages can return
  // this file instead of the React application.
  // ------------------------------------------------------------

  const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hospital Hub</title>

  <script>
    // GitHub Pages SPA fallback.
    // Custom domain = keep zero path segments.

    const location = window.location;

    const redirectPath =
      location.pathname +
      location.search +
      location.hash;

    // Redirect to the root SPA while preserving the requested route.
    const redirectUrl =
      location.protocol +
      "//" +
      location.host +
      "/?/" +
      redirectPath.replace(/^\\//, "").replace(/&/g, "~and~");

    location.replace(redirectUrl);
  </script>
</head>

<body>
  <div
    style="
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    "
  >
    Loading...
  </div>
</body>
</html>`;

  fs.writeFileSync(
    path.join(distDir, "404.html"),
    notFoundHtml,
    "utf8"
  );

  // ------------------------------------------------------------
  // 4. Generate physical directories for all application routes
  //
  // This is the important part.
  //
  // /staff
  // /stress-test
  // /holter
  //
  // will physically exist as:
  //
  // dist/staff/index.html
  // dist/stress-test/index.html
  // dist/holter/index.html
  // ------------------------------------------------------------

  const routes = [
    "staff",
    "stress-test",
    "holter",
    "guideline",
    "stock-take",
    "echocardiogram",
  ];

  for (const route of routes) {
    const routeDirectory = path.join(distDir, route);

    fs.mkdirSync(routeDirectory, {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(routeDirectory, "index.html"),
      indexHtml,
      "utf8"
    );

    console.log(`Created route: /${route}`);
  }

  // ------------------------------------------------------------
  // 5. Also create .html versions
  //
  // This isn't strictly necessary for directory URLs,
  // but keeps compatibility with static hosting.
  // ------------------------------------------------------------

  for (const route of routes) {
    fs.writeFileSync(
      path.join(distDir, `${route}.html`),
      indexHtml,
      "utf8"
    );
  }

  // ------------------------------------------------------------
  // 6. Copy public assets
  // ------------------------------------------------------------

  if (fs.existsSync(publicDir)) {
    copyDirectoryRecursive(publicDir, distDir);
  }

  // ------------------------------------------------------------
  // 7. Print deployment structure
  // ------------------------------------------------------------

  console.log("");
  console.log("GitHub Pages preparation completed.");
  console.log("");
  console.log("Routes generated:");

  for (const route of routes) {
    console.log(`  https://imchsi.com/${route}`);
  }

  console.log("");
  console.log("Root:");
  console.log("  https://imchsi.com/");
  console.log("");
}

prepareGitHubPages();
