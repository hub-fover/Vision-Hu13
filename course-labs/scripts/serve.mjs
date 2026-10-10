import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../../web');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'};
export function serve(port=0){return new Promise((done,reject)=>{const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname),target=resolve(root,'.'+path);
  if(relative(root,target).startsWith('..')){res.writeHead(403).end();return;}
  let file=target;if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end('Not found');}
 });server.once('error',reject);server.listen(port,'127.0.0.1',()=>done(server));});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const server=await serve(Number(process.env.PORT??4188));console.log(`http://127.0.0.1:${server.address().port}/course-labs/`);}
