import { spawn } from "node:child_process";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(root, "node_modules");
const env = { ...process.env };
env.NODE_PATH = env.NODE_PATH
  ? `${nodeModules}${path.delimiter}${env.NODE_PATH}`
  : nodeModules;
Module._initPaths();

const preload = pathToFileURL(path.join(root, "scripts", "dev-resolve.mjs")).href;
env.NODE_OPTIONS = env.NODE_OPTIONS
  ? `${env.NODE_OPTIONS} --import ${preload}`
  : `--import ${preload}`;

const child = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), ...process.argv.slice(2)],
  { cwd: root, env, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
