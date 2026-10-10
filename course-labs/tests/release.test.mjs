import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../web/course-labs');
test('all five chapter routes are independently staged with shared resources',async()=>{
 for(const id of ['004','005','006','007','008']){
  const html=await readFile(resolve(root,`chapter-${id}/index.html`),'utf8');
  assert.match(html,/src="\.\.\/app.mjs"/);

 }
 for(const name of ['index.html','style.css','app.mjs','README.md','TEACHER.md'])await access(resolve(root,name));
 for(const name of ['real/entry.mjs','real/geometry.mjs','real/perception.mjs','real/models.mjs','real/depth.mjs','real/style.css','assets/integrity.json','real/assets/models/mobilenet/model.json','real/assets/models/coco/model.json'])await access(resolve(root,name));
});

test('synthetic runtime and chapter modules are not published',async()=>{for(const name of ['chapters','compute.worker.mjs','render.mjs','runtime.mjs'])await assert.rejects(access(resolve(root,name)));const app=await readFile(resolve(root,'app.mjs'),'utf8');assert.doesNotMatch(app,/compute.worker|chapters\/ch/);});
