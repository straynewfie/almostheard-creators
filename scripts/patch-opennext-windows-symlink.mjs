/**
 * Windows OpenNext soft-patches (idempotent):
 * 1) copyTracedFiles: symlink EPERM → recursive copy
 * 2) turbopack runtime patch: normalize traced paths to `/` so requireChunk
 *    cases are generated (OpenNext #1305; fixed upstream in adapter ≥1.20.2)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function patchCopyTracedFiles() {
  const target = path.join(
    root,
    "node_modules",
    "@opennextjs",
    "aws",
    "dist",
    "build",
    "copyTracedFiles.js",
  );
  if (!fs.existsSync(target)) {
    console.warn(`[patch-opennext] skip symlink — missing ${target}`);
    return;
  }
  const marker = "OPENNEXT_WINDOWS_SYMLINK_FALLBACK";
  const source = fs.readFileSync(target, "utf8");
  if (source.includes(marker)) return;

  const needle = `        if (symlink) {
            try {
                symlinkSync(symlink, to);
            }
            catch (e) {
                if (e.code !== "EEXIST") {
                    throw e;
                }
            }
        }`;

  const replacement = `        if (symlink) {
            try {
                symlinkSync(symlink, to);
            }
            catch (e) {
                // ${marker}
                if (e.code === "EEXIST") {
                    // already linked
                }
                else if (e.code === "EPERM" || e.code === "EACCES") {
                    const resolved = path.isAbsolute(symlink)
                        ? symlink
                        : path.resolve(path.dirname(from), symlink);
                    cpSync(resolved, to, { recursive: true, force: true });
                }
                else {
                    throw e;
                }
            }
        }`;

  if (!source.includes(needle)) {
    console.warn("[patch-opennext] skip symlink — expected block not found");
    return;
  }
  fs.writeFileSync(target, source.replace(needle, replacement));
  console.log("[patch-opennext] applied Windows symlink→copy fallback");
}

function patchTurbopackWindowsPaths() {
  const target = path.join(
    root,
    "node_modules",
    "@opennextjs",
    "cloudflare",
    "dist",
    "cli",
    "build",
    "patches",
    "plugins",
    "turbopack.js",
  );
  if (!fs.existsSync(target)) {
    console.warn(`[patch-opennext] skip turbopack — missing ${target}`);
    return;
  }
  const marker = "OPENNEXT_WINDOWS_TURBOPACK_PATHS";
  let source = fs.readFileSync(target, "utf8");
  if (source.includes(marker)) return;

  const needle = `            patchCode: async ({ code, tracedFiles, filePath }) => {
                const mappings = discoverExternalModuleMappings(filePath);`;

  const replacement = `            patchCode: async ({ code, tracedFiles, filePath }) => {
                // ${marker}
                tracedFiles = tracedFiles.map((f) => f.replace(/\\\\/g, "/"));
                filePath = filePath.replace(/\\\\/g, "/");
                const mappings = discoverExternalModuleMappings(filePath);`;

  if (!source.includes(needle)) {
    console.warn("[patch-opennext] skip turbopack — expected patchCode block not found");
    return;
  }
  fs.writeFileSync(target, source.replace(needle, replacement));
  console.log("[patch-opennext] applied Windows Turbopack path normalization");
}

patchCopyTracedFiles();
patchTurbopackWindowsPaths();
