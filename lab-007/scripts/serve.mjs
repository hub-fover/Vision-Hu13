import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';

import { resolveStaticPath } from './server-utils.mjs';

const root = resolve(import.meta.dirname, '../web');
const types = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.wasm', 'application/wasm'], ['.mjs', 'text/javascript; charset=utf-8'],
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const target = resolveStaticPath(root, url.pathname);
    const info = await stat(target);
    const file = info.isDirectory() ? resolve(target, 'index.html') : target;
    response.writeHead(200, { 'content-type': types.get(extname(file).toLowerCase()) || 'application/octet-stream', 'cache-control': 'no-store' });
    if (request.method === 'HEAD') return response.end();
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(4177, '127.0.0.1', () => process.stdout.write('LAB 007 server: http://127.0.0.1:4177\n'));
