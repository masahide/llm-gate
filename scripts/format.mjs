import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const watchDirs = ["src", "tests", "docs"];
const additionalFiles = ["AGENTS.md", "README.md", "package.json", "tsconfig.json"];
const allowedExts = new Set([".ts", ".md", ".json"]);

async function collectFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const resolved = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectFiles(resolved);
        results.push(...nested);
      } else if (allowedExts.has(extname(entry.name))) {
        results.push(resolved);
      }
    }
    return results;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function transform(content) {
  let normalized = content.replace(/\r\n/g, "\n");
  normalized = normalized.replace(/\t/g, "  ");
  normalized = normalized.replace(/[ \t]+$/gm, "");
  if (normalized.length && !normalized.endsWith("\n")) {
    normalized += "\n";
  }
  return normalized;
}

async function main() {
  const files = new Set();
  for (const dir of watchDirs) {
    for (const file of await collectFiles(dir)) {
      files.add(file);
    }
  }
  for (const file of additionalFiles) {
    files.add(file);
  }

  const updated = [];
  for (const file of files) {
    try {
      const content = await readFile(file, "utf8");
      const formatted = transform(content);
      if (formatted !== content) {
        await writeFile(file, formatted, "utf8");
        updated.push(file);
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }

  if (updated.length) {
    console.log("formatted files:\n", updated.join("\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
