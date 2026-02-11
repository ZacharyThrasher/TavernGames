import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(thisFile);
const rootDir = path.resolve(scriptDir, "..", "..");

const targets = [
  path.join(rootDir, "scripts", "twenty-one"),
  path.join(rootDir, "scripts", "app"),
  path.join(rootDir, "scripts", "main.js"),
];

const rules = [
  {
    name: "empty-catch",
    regex: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    message: "Avoid empty catch blocks; use explicit logging/context.",
  },
  {
    name: "commented-import-removed",
    regex: /\/\/\s*import\s+.+Removed/gi,
    message: "Remove stale commented-out imports.",
  },
  {
    name: "commented-wait",
    regex: /\/\/\s*await\s+new\s+Promise\s*\(/gi,
    message: "Remove stale commented-out delay code.",
  },
  {
    name: "commented-console-log",
    regex: /\/\/\s*console\.log\s*\(/gi,
    message: "Remove stale commented-out console.log statements.",
  },
];

async function walkJsFiles(entryPath) {
  const stats = await fs.stat(entryPath);
  if (stats.isFile()) return [entryPath];

  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function getLineForIndex(text, index) {
  const slice = text.slice(0, index);
  return slice.split("\n").length;
}

async function main() {
  const findings = [];

  for (const target of targets) {
    const files = await walkJsFiles(target);
    for (const filePath of files) {
      const source = await fs.readFile(filePath, "utf8");
      for (const rule of rules) {
        const regex = new RegExp(rule.regex.source, rule.regex.flags);
        let match;
        while ((match = regex.exec(source)) !== null) {
          findings.push({
            file: path.relative(rootDir, filePath),
            line: getLineForIndex(source, match.index),
            rule: rule.name,
            message: rule.message,
          });
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`Quality check failed with ${findings.length} issue(s):`);
    for (const item of findings) {
      console.error(`- ${item.file}:${item.line} [${item.rule}] ${item.message}`);
    }
    process.exit(1);
  }

  console.log("Quality checks passed.");
}

main().catch((error) => {
  console.error(`Quality checks failed unexpectedly: ${error.stack || error.message}`);
  process.exit(1);
});
