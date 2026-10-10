import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serve} from '../scripts/serve.mjs';
const dir=resolve(import.meta.dirname,'../../.superpowers/sdd/course-labs-plan/qa');await mkdir(dir,{recursive:true});
const server=await serve(),base=`http://127.0.0.1:${server.address().port}/course-labs/`;
const browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})}),report=[],errors=[],external=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});});
const page=await context.newPage();
const ready=async()=>{await page.waitForFunction(()=>['ready','error'].includes(document.body.dataset.state),{timeout:30000});assert.equal(await page.getAttribute('body','data-state'),'ready',await page.locator('#status').textContent());};
const change=async(el,value)=>{await el.evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.waitForTimeout(180);await ready();};
const signature=()=>page.locator('#view-2').evaluate(c=>c.toDataURL());
try{
 await page.goto(base);assert.equal(await page.locator('.chapter-card').count(),5);await page.screenshot({path:resolve(dir,'home-desktop.png'),fullPage:true});
 for(const id of ['004','005','006','007','008']){
  const {scenes}=await import(`../chapters/ch${id}.mjs`);
  for(const scene of scenes){
   await page.goto(`${base}chapter-${id}/?scene=${scene.id}`);await ready();
   assert.equal(await page.locator('#title').textContent(),scene.title);assert.equal(await page.locator('#scene-nav a').count(),scenes.length);
   assert.ok(await page.locator('#stage option').count()>=2);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const initial=await signature();await page.locator('#previous').click();await page.locator('#next').click();assert.equal(await signature(),initial);
   await page.locator('#play').click();await page.waitForTimeout(50);assert.equal(await page.locator('#play').getAttribute('aria-pressed'),'true');await page.locator('#play').click();
   await page.locator('#baseline').click();
   const first=scene.controls[0],value=first.value===first.max?first.min:first.max;await change(page.locator(`#param-${first.key}`),value);
   const modified=await signature();await page.locator('#compare').click();assert.equal(await signature(),initial);await page.locator('#compare').click();assert.equal(await signature(),modified);
   await page.locator('#reset').click();await ready();assert.equal(await signature(),initial);
   await page.locator('#teacher').click();assert.equal(await page.locator('#teacher-panel').isVisible(),true);assert.match(page.url(),/teacher=1/);
   await page.screenshot({path:resolve(dir,`${id}-${scene.id}-desktop.png`),fullPage:true});
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(dir,`${id}-${scene.id}-mobile.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});
   report.push({chapter:id,scene:scene.id,title:scene.title,desktop:true,mobile:true,stages:true,comparison:true,reset:true,teacher:true});console.log(`PASS ${id}/${scene.id} ${scene.title}`);
  }
 }
 await page.goto(`${base}chapter-006/?scene=04`);await ready();
 const fixture=await page.evaluate(()=>{let c=document.createElement('canvas');c.width=16;c.height=8;let x=c.getContext('2d');x.fillStyle='black';x.fillRect(0,0,8,8);x.fillStyle='white';x.fillRect(8,0,8,8);return c.toDataURL().split(',')[1];});
 await page.locator('#upload').setInputFiles({name:'local-test.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(()=>document.querySelector('#input-note').textContent.includes('local-test'));await ready();assert.match(await page.locator('#status').textContent(),/自选图像/);
 const jsonWait=page.waitForEvent('download');await page.locator('#export-json').click();const json=await jsonWait;await json.saveAs(resolve(dir,'uploaded-result.json'));const exported=JSON.parse(await readFile(resolve(dir,'uploaded-result.json'),'utf8'));assert.equal(exported.run.input.width,16);assert.equal(exported.run.input.data.length,128);assert.equal(exported.numeric.uploaded,true);
 const pngWait=page.waitForEvent('download');await page.locator('#export-png').click();const png=await pngWait;await png.saveAs(resolve(dir,'result.png'));const bytes=await readFile(resolve(dir,'result.png'));assert.equal(bytes.subarray(1,4).toString(),'PNG');
 await page.locator('#upload').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.body.dataset.state==='error');assert.match(await page.locator('#status').textContent(),/图像无法读取/);await page.locator('#reset').click();await ready();
 await page.locator('#seed').fill('-1');await page.locator('#seed').dispatchEvent('change');assert.equal(await page.getAttribute('body','data-state'),'error');await page.locator('#reset').click();await ready();
 await page.locator('#cancel').click();assert.equal(await page.getAttribute('body','data-state'),'cancelled');await page.locator('#reset').click();await ready();
 await page.evaluate(()=>{const e=document.querySelector('#param-k');e.value='6';e.dispatchEvent(new Event('input'));document.querySelector('#cancel').click();});await page.waitForTimeout(350);assert.equal(await page.getAttribute('body','data-state'),'cancelled','pending debounce must not restart after cancel');await page.locator('#reset').click();await ready();
 // Cancel an active worker and ensure its result cannot update the UI.
 await page.locator('#param-k').evaluate(e=>{e.value='6';e.dispatchEvent(new Event('input'));});await page.waitForTimeout(110);await page.locator('#cancel').click();await page.waitForTimeout(350);assert.equal(await page.getAttribute('body','data-state'),'cancelled');await page.locator('#reset').click();await ready();
 await page.goto(`${base}chapter-004/?scene=invalid`);await ready();assert.match(page.url(),/scene=01/);
 await page.goto(`${base}chapter-004/?scene=02`);await ready();const before=await signature();await page.locator('#view-2').press('ArrowRight');assert.notEqual(await signature(),before);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(resolve(dir,'browser-report.json'),JSON.stringify({experiments:report,checks:{upload:true,png:true,json:true,invalidImage:true,invalidSeed:true,cancel:true,invalidRoute:true,surfaceRotation:true,noExternalRequests:true},errors},null,2));console.log('PASS upload/export/errors/cancel/routes/surface/privacy');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
