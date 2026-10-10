import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
async function walk(dir){let paths=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())paths.push(...await walk(p));else if(e.name!=='integrity.json')paths.push(relative(root,p).replaceAll('\\','/'));}return paths;}
test('real sample, runtime and model assets match recorded release hashes',async()=>{
 const manifest=JSON.parse(await readFile(resolve(root,'assets/integrity.json'),'utf8'));
 assert.equal(manifest.schema,'vision-course-real-assets.v1');assert.ok(manifest.files.length>5);
 assert.deepEqual(manifest.files.map(x=>x.path).sort(),[...await walk(resolve(root,'assets')),...await walk(resolve(root,'real/assets'))].sort());
 for(const record of manifest.files){assert.ok(!record.path.includes('..'));const b=await readFile(resolve(root,record.path));assert.equal(b.length,record.bytes,record.path);assert.equal(createHash('sha256').update(b).digest('hex'),record.sha256,record.path);}
});
