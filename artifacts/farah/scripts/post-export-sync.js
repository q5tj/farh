/**
 * Post-export Vercel adapter.
 *
 * Earlier attempts to point Vercel at the expo export output via
 * vercel.json#outputDirectory or copies under `dist`/`public`/`build`
 * all failed with "No Output Directory named 'dist' found" — meaning
 * Vercel's project-level Output Directory or Root Directory setting
 * is pointing at a path neither we nor the build can predict.
 *
 * Solution: switch to Vercel's Build Output API. When
 * `.vercel/output/config.json` exists at the project root after the
 * build, Vercel uses that filesystem layout and **ignores
 * outputDirectory, framework, and the dashboard Output Directory
 * setting entirely**. This is the only path that bypasses the
 * dashboard overrides we can't see or change from CI.
 *
 * Layout we emit (per the spec):
 *   .vercel/output/static/        ← every static file
 *   .vercel/output/config.json    ← routes (filesystem-first, SPA fallback)
 *
 * We also still mirror to `dist`, `public`, `build` at the repo root
 * as a belt-and-suspenders fallback for any zero-config path Vercel
 * might still try.
 *
 * Run from `artifacts/farah/` (cwd of the build:web script).
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

function copy(target) {
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

// 1. Build Output API: `.vercel/output/static/` + config.json at the
//    project root. This is the canonical Vercel v3 deploy contract and
//    overrides any dashboard Output Directory setting.
const outputApiDir = path.join(repoRoot, ".vercel", "output");
const outputApiStatic = path.join(outputApiDir, "static");
fs.mkdirSync(outputApiDir, { recursive: true });
copy(outputApiStatic);

const config = {
  version: 3,
  routes: [
    // Serve concrete files from .vercel/output/static when they exist.
    { handle: "filesystem" },
    // SPA fallback: any path without an extension goes to the entry HTML.
    // We use the explicit destination form so the regex isn't ambiguous.
    { src: "^/(.*)$", dest: "/index.html" },
  ],
};
fs.writeFileSync(
  path.join(outputApiDir, "config.json"),
  JSON.stringify(config, null, 2),
);
console.log(`[sync] ✓ ${path.join(outputApiDir, "config.json")}`);

// 2. Legacy fallback locations — harmless if Vercel picks Build Output
//    API, useful if for some reason it doesn't.
for (const name of ["dist", "public", "build"]) {
  copy(path.join(repoRoot, name));
}

console.log("[sync] Done. Vercel will deploy from .vercel/output/ via Build Output API.");
