import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const extensions = ["", ".ts", ".tsx", ".js", ".jsx"];

function resolveSourcePath(specifier) {
  const requestedPath = path.join(sourceRoot, specifier.slice(2));

  for (const extension of extensions) {
    const candidate = `${requestedPath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const extension of extensions.slice(1)) {
    const candidate = path.join(requestedPath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const sourcePath = resolveSourcePath(specifier);
  if (!sourcePath) {
    return nextResolve(specifier, context);
  }

  return nextResolve(pathToFileURL(sourcePath).href, context);
}
