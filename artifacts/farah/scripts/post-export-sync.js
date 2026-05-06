/**
 * No-op: kept for backwards compatibility with build:web.
 *
 * Earlier versions of this script tried (in vain) to work around a
 * misconfigured Vercel project by mirroring `dist` to multiple
 * fallback locations and writing a serverless entrypoint. None of
 * those workarounds bypassed the dashboard-level Build Settings
 * override that was forcing @vercel/node onto our static output.
 *
 * The only actual fix is to either reset the project's Build &
 * Development Settings overrides in the Vercel dashboard, or delete
 * and re-create the project so it picks up vercel.json fresh.
 *
 * This file is left in place so build:web doesn't fail; it just
 * verifies the export landed where we expect it.
 */

const fs = require("fs");
const path = require("path");

const sourceDist = path.resolve(__dirname, "..", "dist");
if (!fs.existsSync(sourceDist)) {
  console.error(`[post-export] dist not found at ${sourceDist}`);
  process.exit(1);
}
const indexHtml = path.join(sourceDist, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error(`[post-export] index.html missing in ${sourceDist}`);
  process.exit(1);
}
console.log(`[post-export] expo export OK — ${sourceDist}`);
