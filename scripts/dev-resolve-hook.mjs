import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectPackage = pathToFileURL(path.join(root, "package.json")).href;

function isBareSpecifier(specifier) {
  return (
    !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("node:") &&
    !specifier.startsWith("file:") &&
    !/^[a-zA-Z]:[\\/]/.test(specifier)
  );
}

/**
 * Dev compiles into a cache outside this OneDrive repo. Node then resolves
 * those files from their real path and cannot see this project's
 * node_modules. Bare imports from that cache resolve as if they lived here.
 */
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? "";
  if (parent.includes("y2kase-next") && isBareSpecifier(specifier)) {
    return nextResolve(specifier, { ...context, parentURL: projectPackage });
  }
  return nextResolve(specifier, context);
}
