import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const excludedDirectories = new Set([".git", "node_modules", "tests", "scripts"]);
const files = [];

async function collectJavaScript(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        await collectJavaScript(resolve(directory, entry.name));
      }
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(resolve(directory, entry.name));
    }
  }
}

await collectJavaScript(root);
files.sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (!process.exitCode) console.log(`Syntax checked ${files.length} JavaScript files.`);
