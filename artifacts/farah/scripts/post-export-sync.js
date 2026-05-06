/**
 * Post-export Vercel adapter.
 *
 * The smoking gun from the latest deploy:
 *   Error: No entrypoint found in output directory: "artifacts/farah/dist"
 *
 * That tells us conclusively the Vercel project has Root Directory
 * set to `artifacts/farah` in the dashboard. After the build, Vercel
 * inspects `<rootDirectory>` — not the repo root — for both:
 *   - the deployment artifact (it found `dist/` and tried to treat it
 *     as a Node.js function, hence the "No entrypoint" error), and
 *   - the Build Output API marker (`.vercel/output/config.json`).
 *
 * Fix: emit the Build Output API layout under **both** the repo root
 * AND `artifacts/farah/`. Whichever one Vercel scans, it'll find the
 * config.json and switch into Build Output API mode (which bypasses
 * its Node.js auto-detection entirely).
 *
 * Also keep the dist/public/build mirrors as a last-resort fallback.
 */

const fs = require("fs");
const path = require("path");

const farahDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(farahDir, "..", "..");
const sourceDist = path.join(farahDir, "dist");

if (!fs.existsSync(sourceDist)) {
  console.error(`[sync] expo export output not found at ${sourceDist}`);
  process.exit(1);
}

function copyDir(target) {
  if (path.resolve(target) === path.resolve(sourceDist)) return false;
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.cpSync(sourceDist, target, { recursive: true });
    console.log(`[sync] ✓ ${target}`);
    return true;
  } catch (e) {
    console.warn(`[sync] ✗ ${target}: ${e.message}`);
    return false;
  }
}

function writeBuildOutputApi(baseDir) {
  const outputApiDir = path.join(baseDir, ".vercel", "output");
  const outputApiStatic = path.join(outputApiDir, "static");
  fs.mkdirSync(outputApiDir, { recursive: true });
  copyDir(outputApiStatic);

  const config = {
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "^/(.*)$", dest: "/index.html" },
    ],
  };
  const configPath = path.join(outputApiDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[sync] ✓ ${configPath}`);
}

// Build Output API at *both* possible roots — repo root (in case
// Vercel's Root Directory is empty) and artifacts/farah (in case
// it's set to the package, which the latest deploy log proved it is).
writeBuildOutputApi(repoRoot);
writeBuildOutputApi(farahDir);

// Legacy mirrors as a fallback for any zero-config code path.
for (const baseDir of [repoRoot, farahDir]) {
  for (const name of ["dist", "public", "build"]) {
    copyDir(path.join(baseDir, name));
  }
}

console.log("[sync] Done. Build Output API + legacy mirrors emitted at both repo root and artifacts/farah.");
