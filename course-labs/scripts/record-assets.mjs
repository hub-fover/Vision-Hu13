import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(e.name!=='integrity.json')files.push(p);}return files;}
const records=[];for(const p of [...await walk(resolve(root,'assets')),...await walk(resolve(root,'real/assets'))].sort()){const b=await readFile(p);records.push({path:relative(root,p).replaceAll('\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await writeFile(resolve(root,'assets/integrity.json'),JSON.stringify({schema:'vision-course-real-assets.v1',files:records},null,2)+'\n');
console.log(`Recorded ${records.length} real lab assets`);
