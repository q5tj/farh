/**
 * Post-export step for the web build.
 *
 * Runs after `expo export --platform web --output-dir dist`:
 *
 * 1. Mirrors `dist/` to the repo-root `dist/` so Vercel can pick it up via
 *    its `outputDirectory: "dist"` setting.
 * 2. Copies `index.html` to `404.html` inside both dist trees. Vercel serves
 *    `404.html` for any path that has no matching file, which keeps the SPA
 *    routing alive on a hard refresh even if our `vercel.json` rewrites
 *    are overridden by a dashboard setting or fail to apply for any reason.
 * 3. Sanity-checks that `index.html` actually exists — fails the build with
 *    a clear error if expo emitted to an unexpected place.
 */

const fs = require("fs");
const path = require("path");

const farahDist = path.resolve(__dirname, "..", "dist");
const repoRootDist = path.resolve(__dirname, "..", "..", "..", "dist");

function fail(msg) {
  console.error(`[post-export] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(farahDist)) {
  fail(`expected dist at ${farahDist} but it does not exist`);
}

const localIndex = path.join(farahDist, "index.html");
if (!fs.existsSync(localIndex)) {
  fail(
    `expo export did not produce index.html in ${farahDist}. ` +
      `Check the expo-router output mode (should be "single" / default).`,
  );
}

// Mirror to repo-root/dist so Vercel's outputDirectory: "dist" finds it.
try {
  fs.rmSync(repoRootDist, { recursive: true, force: true });
  fs.cpSync(farahDist, repoRootDist, { recursive: true });
  console.log(`[post-export] mirrored to ${repoRootDist}`);
} catch (e) {
  fail(`failed to mirror dist to repo root: ${e.message}`);
}

// Vercel serves 404.html for unmatched paths automatically. Aliasing it to
// index.html means hard-refreshes on client-side routes still boot the SPA.
const targets = [
  { from: localIndex, to: path.join(farahDist, "404.html") },
  {
    from: path.join(repoRootDist, "index.html"),
    to: path.join(repoRootDist, "404.html"),
  },
];
for (const { from, to } of targets) {
  fs.copyFileSync(from, to);
}
console.log("[post-export] wrote 404.html (SPA fallback)");
