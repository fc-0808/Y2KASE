import Module from "node:module";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(root, "node_modules");
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${nodeModules}${path.delimiter}${process.env.NODE_PATH}`
  : nodeModules;
Module._initPaths();

register(pathToFileURL(path.join(root, "scripts", "dev-resolve-hook.mjs")));
