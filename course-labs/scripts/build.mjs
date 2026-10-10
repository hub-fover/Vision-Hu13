import {mkdir,cp,readFile,writeFile,readdir,stat,rm,lstat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
const source=resolve(import.meta.dirname,'..'),dest=resolve(source,'../web/course-labs');
if(relative(resolve(source,'../web'),dest)!=='course-labs')throw Error('发布目录超出目标范围');
try{if((await lstat(dest)).isSymbolicLink())throw Error('发布目录不能是符号链接');await rm(dest,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(dest,{recursive:true});
for(const file of ['index.html','app.mjs','independent-sites.mjs','style.css','README.md','TEACHER.md','LICENSES.md'])await cp(resolve(source,file),resolve(dest,file));
for(const folder of ['real','assets'])await cp(resolve(source,folder),resolve(dest,folder),{recursive:true});
const shell=await readFile(resolve(source,'lab.html'),'utf8');
for(const id of ['004','005','006','007','008']){
 const path=resolve(dest,`chapter-${id}`);await mkdir(path,{recursive:true});await writeFile(resolve(path,'index.html'),shell);
}
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())out.push(...await files(resolve(dir,entry.name)));else out.push(resolve(dir,entry.name));}return out;}
const staged=await files(dest);
for(const p of staged){if(/node_modules|\.pptx$|\.test\.mjs$/.test(p))throw Error('发布目录包含不应发布的文件');}
let bytes=0;for(const p of staged)bytes+=(await stat(p)).size;
console.log(`Course Labs: ${staged.length} files, ${(bytes/1024).toFixed(0)} KiB staged at ${dest}`);
