import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,relative,extname } from 'node:path';
const root=fileURLToPath(new URL('../web/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.json':'application/json'};
export async function startServer(port=4180) {
  const server=createServer(async(req,res)=>{
    try {
      const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const target=resolve(root,'.'+(path==='/'?'/index.html':path));
      if(relative(root,target).startsWith('..')) {res.writeHead(403).end();return;}
      const data=await readFile(target);
      res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
    } catch {res.writeHead(404).end('Not found');}
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',ok);});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await startServer(Number(process.env.PORT)||4180);
  console.log(`特征提取 LAB: http://127.0.0.1:${server.address().port}/`);
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close();server.closeAllConnections();});
}
