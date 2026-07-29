import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = resolve(scriptDirectory, "../web");
const destination = resolve(
  scriptDirectory,
  process.argv[2] || "../../web/lab-002",
);
const excluded = new Set([
  "node_modules",
  "package.json",
  "package-lock.json",
  ".gitignore",
  "README.md",
  "manifest.local.json",
]);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter(path) {
    return path === source || !excluded.has(path.split(/[\\/]/).at(-1));
  },
});
process.stdout.write(`Staged LAB 002 Pages app: ${destination}\n`);
