import { readdir, readFile } from "node:fs/promises";
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

  const violations = [];
  for (const file of files) {
    try {
      const content = await readFile(file, "utf8");
      if (content.includes("\t")) {
        violations.push(`${file}: tab characters detected`);
      }
      if (content.includes("\r")) {
        violations.push(`${file}: CRLF line endings detected`);
      }
      if (content.length > 0 && !content.endsWith("\n")) {
        violations.push(`${file}: missing trailing newline`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }

  if (violations.length) {
    console.error("format check failed:\n", violations.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
