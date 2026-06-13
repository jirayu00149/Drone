const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const publicOutDir = path.join(root, "dist");
const droneOutDir = path.join(root, "dist-drone");
const target = process.argv[2] || "all";

const defaultPublicSiteUrl = "https://autokgapai.pages.dev";
const defaultDroneSiteUrl = "https://autokgapai-drone.pages.dev";
const publicSiteUrl = cleanBaseUrl(process.env.PUBLIC_SITE_URL || defaultPublicSiteUrl);
const droneSiteUrl = cleanBaseUrl(process.env.DRONE_SITE_URL || defaultDroneSiteUrl);
const droneAccessCode = process.env.DRONE_ACCESS_CODE || "drone-ops";

const sharedPublicEntries = [
  "index.html",
  "search.html",
  "report.html",
  "styles.css",
  "shared.js",
  "public.js",
  "tubelight-nav.js",
  "assets"
];

const droneEntries = [
  "styles.css",
  "shared.js",
  "admin.js",
  "drone-access.js",
  "tubelight-nav.js",
  "assets"
];

function cleanBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

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

function copyEntries(entries, outDir) {
  for (const entry of entries) {
    const source = path.join(root, entry);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing build entry: ${entry}`);
    }
    copyRecursive(source, path.join(outDir, entry));
  }
}

function writeText(outDir, relativePath, content) {
  const destination = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
}

function configJs() {
  const config = {
    publicBaseUrl: publicSiteUrl,
    droneBaseUrl: droneSiteUrl,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    droneAccessHash: process.env.DRONE_ACCESS_HASH || sha256(droneAccessCode)
  };

  return `window.HatyaiRescueConfig = ${JSON.stringify(config, null, 2)};\n`;
}

function redirectPage(sourceFile) {
  return fs
    .readFileSync(path.join(root, sourceFile), "utf8")
    .replaceAll(`${defaultDroneSiteUrl}/`, `${droneSiteUrl}/`)
    .replaceAll("./drone/index.html", `${droneSiteUrl}/`)
    .replaceAll("./drone/", `${droneSiteUrl}/`);
}

function buildPublic() {
  fs.rmSync(publicOutDir, { recursive: true, force: true });
  fs.mkdirSync(publicOutDir, { recursive: true });
  copyEntries(sharedPublicEntries, publicOutDir);
  writeText(publicOutDir, "site-config.js", configJs());
  writeText(publicOutDir, "admin.html", redirectPage("admin.html"));
  writeText(publicOutDir, "pilot.html", redirectPage("pilot.html"));
  writeText(
    publicOutDir,
    "_redirects",
    [
      `/drone ${droneSiteUrl}/ 302`,
      `/drone/* ${droneSiteUrl}/:splat 302`,
      `/admin ${droneSiteUrl}/ 302`,
      `/pilot ${droneSiteUrl}/ 302`,
      `/admin.html ${droneSiteUrl}/ 302`,
      `/pilot.html ${droneSiteUrl}/ 302`
    ].join("\n") + "\n"
  );
  console.log(`Built public site to ${path.relative(root, publicOutDir)}`);
}

function buildDrone() {
  fs.rmSync(droneOutDir, { recursive: true, force: true });
  fs.mkdirSync(droneOutDir, { recursive: true });
  copyEntries(droneEntries, droneOutDir);
  copyRecursive(path.join(root, "drone", "drone.css"), path.join(droneOutDir, "drone.css"));
  writeText(droneOutDir, "site-config.js", configJs());
  writeText(
    droneOutDir,
    "_redirects",
    [
      `/drone / 302`,
      `/admin / 302`,
      `/pilot / 302`
    ].join("\n") + "\n"
  );

  const droneIndex = fs
    .readFileSync(path.join(root, "drone", "index.html"), "utf8")
    .replaceAll('href="../styles.css"', 'href="./styles.css"')
    .replaceAll('href="./drone.css"', 'href="./drone.css"')
    .replaceAll('href="../search.html"', `href="${publicSiteUrl}/search.html"`)
    .replaceAll('src="../site-config.js"', 'src="./site-config.js"')
    .replaceAll('src="../shared.js"', 'src="./shared.js"')
    .replaceAll('src="../tubelight-nav.js"', 'src="./tubelight-nav.js"')
    .replaceAll('src="../drone-access.js"', 'src="./drone-access.js"')
    .replaceAll('src="../admin.js"', 'src="./admin.js"');

  writeText(droneOutDir, "index.html", droneIndex);
  console.log(`Built drone site to ${path.relative(root, droneOutDir)}`);
}

if (!["all", "public", "drone"].includes(target)) {
  throw new Error("Usage: node scripts/build-static.js [all|public|drone]");
}

if (target === "all" || target === "public") {
  buildPublic();
}

if (target === "all" || target === "drone") {
  buildDrone();
}
