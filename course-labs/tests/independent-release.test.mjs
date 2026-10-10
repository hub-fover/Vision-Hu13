import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';import {resolve} from 'node:path';
import {sites} from '../independent-sites.mjs';
const root=resolve(import.meta.dirname,'../../work/independent-sites');
test('nine sites each have a root page, own assets and deployment configuration',async()=>{
 assert.equal(sites.length,9);assert.equal(new Set(sites.map(s=>s.repository)).size,9);
 for(const s of sites){const dir=resolve(root,s.repository),html=await readFile(resolve(dir,'index.html'),'utf8');assert.doesNotMatch(html,/<iframe|src="\.\.\//);for(const file of ['README.md','LICENSE','package.json','.github/workflows/check.yml'])await access(resolve(dir,file));
 if(s.group==='depth'){await access(resolve(dir,'vendor/transformers.web.min.js'));await access(resolve(dir,'assets/samples/manifest.json'));assert.match(html,/独立实验/)}else{assert.match(html,new RegExp(`data-chapter="${s.chapter}"`));assert.match(html,new RegExp(`data-scene="${s.scene}"`));await access(resolve(dir,'app.mjs'));await access(resolve(dir,`real/${s.group}.mjs`));assert.ok((await readdir(resolve(dir,s.group==='geometry'?'assets':'real/assets'))).length>0)}
 }
});
