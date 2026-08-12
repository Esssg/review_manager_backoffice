import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoots = ["src", "scripts", "supabase/functions", "supabase/migrations"];
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".ts", ".sql"]);
const allowedTables = new Set([
  "admins",
  "products",
  "admin_menu_permissions",
  "product_steps",
  "applications",
  "submissions",
  "evidence_photos"
]);
const forbiddenTablePatterns = [
  /\bevidence_photo\b/g,
  /\bparticipants\b/g,
  /\bcampaigns\b/g
];

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }

    if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

test("runtime Supabase table references stay within the project allowlist", async () => {
  const files = [];

  for (const sourceRoot of sourceRoots) {
    files.push(...(await collectSourceFiles(join(projectRoot, sourceRoot))));
  }

  const violations = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = filePath.slice(projectRoot.length + 1);

    for (const match of source.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      if (!allowedTables.has(match[1])) {
        violations.push(`${relativePath}: unknown table ${match[1]}`);
      }
    }

    for (const pattern of forbiddenTablePatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: forbidden table reference ${pattern.source}`);
        pattern.lastIndex = 0;
      }
    }
  }

  assert.deepEqual(violations, []);
});
