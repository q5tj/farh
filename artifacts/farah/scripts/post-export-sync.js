/**
 * Post-export Vercel safety net.
 *
 * Vercel's project-level "Output Directory" setting overrides whatever
 * we put in vercel.json. We can't see or change that setting from CI,
 * so the only way to guarantee Vercel finds our build artifacts is to
 * mirror the export into every conventional output directory at the
 * repo root (`dist`, `public`, `build`). Whichever path the dashboard
 * is pointing at, the files will be there.
 *
 * Run from `artifacts/farah/` (cwd of the build:web script) after
 * `expo export --output-dir dist`.
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

const targets = ["dist", "public", "build"];
let synced = 0;
for (const name of targets) {
  const target = path.join(repoRoot, name);
  // Skip if target IS the source (would erase the directory we're copying from).
  if (path.resolve(target) === path.resolve(sourceDist)) continue;
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.cpSync(sourceDist, target, { recursive: true });
    console.log(`[sync] ✓ ${target}`);
    synced += 1;
  } catch (e) {
    console.warn(`[sync] ✗ ${target}: ${e.message}`);
  }
}
console.log(`[sync] Mirrored expo export to ${synced} directory(ies).`);
