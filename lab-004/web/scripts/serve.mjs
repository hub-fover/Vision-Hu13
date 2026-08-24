import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const assetRoot=resolve(root,'assets');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.webm':'video/webm','.mp4':'video/mp4','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg'};
createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.endsWith('/'))path+='index.html';const isAsset=path.startsWith('/web/assets/');const file=isAsset?resolve(assetRoot,`.${path.slice('/web/assets'.length)}`):resolve(root,`.${path}`);const boundary=isAsset?assetRoot:root;if(!file.startsWith(boundary+sep))throw 0;const data=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(4174,'127.0.0.1',()=>console.log('LAB004 web: http://127.0.0.1:4174/web/'));
