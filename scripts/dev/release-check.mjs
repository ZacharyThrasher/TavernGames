import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const syntaxOnly = args.has("--syntax-only");
const manifestOnly = args.has("--manifest-only");

if (syntaxOnly && manifestOnly) {
  console.error("Cannot use --syntax-only and --manifest-only together.");
  process.exit(1);
}

const thisFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(thisFile);
const rootDir = path.resolve(scriptDir, "..", "..");

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function walkJsFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function checkSyntax() {
  if (typeof vm.SourceTextModule !== "function") {
    warn("Syntax check skipped: this Node runtime does not expose vm.SourceTextModule.");
    return;
  }

  const scriptsDir = path.join(rootDir, "scripts");
  const jsFiles = await walkJsFiles(scriptsDir);
  for (const filePath of jsFiles) {
    const source = await fs.readFile(filePath, "utf8");
    try {
      // Parse each file as ESM to validate syntax without executing module code.
      new vm.SourceTextModule(source, { identifier: filePath });
    } catch (error) {
      const details = error?.stack || error?.message || String(error);
      fail(`Syntax check failed: ${path.relative(rootDir, filePath)}\n${details}`);
    }
  }
  console.log(`Syntax checked ${jsFiles.length} JS files.`);
}

async function checkManifestAndAssets() {
  const manifestPath = path.join(rootDir, "module.json");
  if (!(await exists(manifestPath))) {
    fail("Missing module.json.");
    return;
  }

  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    fail(`module.json is not valid JSON: ${error.message}`);
    return;
  }

  const requiredFields = ["id", "version", "manifest", "download", "esmodules", "styles", "languages"];
  for (const field of requiredFields) {
    if (manifest[field] === undefined || manifest[field] === null) {
      fail(`module.json missing required field: ${field}`);
    }
  }

  const version = manifest.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    fail(`module.json version is not semver-like: ${version}`);
  }

  if (typeof manifest.download === "string" && typeof version === "string") {
    const expectedTag = `v${version}`;
    if (!manifest.download.includes(expectedTag)) {
      fail(`Download URL does not include release tag ${expectedTag}: ${manifest.download}`);
    }
  }

  if (typeof manifest.manifest === "string" && !manifest.manifest.endsWith("/module.json")) {
    fail(`Manifest URL should end with /module.json: ${manifest.manifest}`);
  }

  const assetPaths = [];
  if (Array.isArray(manifest.esmodules)) assetPaths.push(...manifest.esmodules);
  if (Array.isArray(manifest.styles)) assetPaths.push(...manifest.styles);
  if (Array.isArray(manifest.languages)) {
    for (const lang of manifest.languages) {
      if (typeof lang?.path === "string") assetPaths.push(lang.path);
    }
  }

  for (const relPath of assetPaths) {
    const fullPath = path.join(rootDir, relPath);
    if (!(await exists(fullPath))) {
      fail(`Manifest path is missing: ${relPath}`);
    }
  }

  for (const lang of manifest.languages ?? []) {
    if (!lang?.path) continue;
    const languagePath = path.join(rootDir, lang.path);
    try {
      await readJson(languagePath);
    } catch (error) {
      fail(`Language file is invalid JSON (${lang.path}): ${error.message}`);
    }
  }

  const moduleZipPath = path.join(rootDir, "module.zip");
  if (!(await exists(moduleZipPath))) {
    warn("module.zip is missing in repo root (release packaging step may be incomplete).");
  }

  const statePath = path.join(rootDir, "scripts", "state.js");
  if (await exists(statePath)) {
    const stateText = await fs.readFile(statePath, "utf8");
    const templateMatches = [...stateText.matchAll(/templates\/[A-Za-z0-9/_-]+\.hbs/g)];
    const templatePaths = [...new Set(templateMatches.map(match => match[0]))];
    for (const relTemplate of templatePaths) {
      const templateFullPath = path.join(rootDir, relTemplate);
      if (!(await exists(templateFullPath))) {
        fail(`Template referenced in preloadTemplates is missing: ${relTemplate}`);
      }
    }
  }

  const moduleIds = [];
  const moduleIdSources = [
    path.join(rootDir, "scripts", "state.js"),
    path.join(rootDir, "scripts", "twenty-one", "constants.js"),
  ];
  for (const sourcePath of moduleIdSources) {
    if (!(await exists(sourcePath))) continue;
    const text = await fs.readFile(sourcePath, "utf8");
    const match = text.match(/MODULE_ID\s*=\s*"([^"]+)"/);
    if (match) moduleIds.push({ source: path.relative(rootDir, sourcePath), value: match[1] });
  }

  for (const { source, value } of moduleIds) {
    if (manifest.id !== value) {
      fail(`MODULE_ID mismatch: module.json id (${manifest.id}) != ${value} in ${source}`);
    }
  }

  console.log(`Manifest checked (${manifest.id} v${manifest.version}).`);
}

async function main() {
  if (!manifestOnly) {
    await checkSyntax();
  }
  if (!syntaxOnly) {
    await checkManifestAndAssets();
  }

  for (const message of warnings) {
    console.warn(`WARN: ${message}`);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`ERROR: ${message}`);
    }
    process.exit(1);
  }

  console.log("Release checks passed.");
}

main().catch((error) => {
  console.error(`Release checks failed unexpectedly: ${error.stack || error.message}`);
  process.exit(1);
});
