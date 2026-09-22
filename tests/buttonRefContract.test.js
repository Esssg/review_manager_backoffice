import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const buttonSource = fs.readFileSync(
  path.join(projectRoot, "src/components/ui/button.tsx"),
  "utf8"
);

test("공통 Button은 React 18 Radix asChild 트리거를 위해 DOM ref를 전달한다", () => {
  assert.match(buttonSource, /React\.forwardRef</);
  assert.match(buttonSource, /<Comp[\s\S]*?ref=\{ref\}/);
});
