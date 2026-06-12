const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");
const publicEntries = [
  "_redirects",
  "index.html",
  "search.html",
  "report.html",
  "pilot.html",
  "admin.html",
  "styles.css",
  "shared.js",
  "public.js",
  "admin.js",
  "tubelight-nav.js",
  "assets",
  "drone"
];

function copyRecursive(source, destination) {
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing public entry: ${entry}`);
  }
  copyRecursive(source, path.join(outDir, entry));
}

console.log(`Built static site to ${path.relative(root, outDir)}`);
