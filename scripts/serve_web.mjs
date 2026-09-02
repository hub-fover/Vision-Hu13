import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = resolve(ROOT, "web");
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const DEFAULT_HOST = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
};

function createStaticServer(host) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
      const requested = pathname === "/" ? "/index.html" : pathname;
      const filePath = resolve(WEB_ROOT, `.${requested}`);
      const relativePath = relative(WEB_ROOT, filePath);
      if (relativePath.startsWith("..") || relativePath.includes(":")) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

export function startStaticServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
} = {}) {
  const server = createStaticServer(host);
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolveServer(server);
    });
  });
}

export function closeStaticServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
    server.closeAllConnections?.();
  });
}

function openDefaultBrowser(url) {
  const commands = {
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
    win32: ["cmd.exe", ["/d", "/s", "/c", "start", "", url]],
  };
  const [command, args] = commands[process.platform] || commands.linux;
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const server = await startStaticServer();
  const url = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/`;
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await closeStaticServer(server);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("disconnect", shutdown);
  process.stdout.write(`Perspective Paste web server: ${url}\n`);
  if (process.argv.includes("--open")) openDefaultBrowser(url);
}
