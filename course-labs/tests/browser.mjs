import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {serve} from '../scripts/serve.mjs';
import {chapters} from '../real/catalog.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve(import.meta.dirname,'../../.superpowers/sdd/real-only-course/qa');await mkdir(dir,{recursive:true});
const server=process.env.COURSE_BASE?null:await serve(),base=process.env.COURSE_BASE??`http://127.0.0.1:${server.address().port}/course-labs/`;
const browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[],report=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
try{
await page.goto(base);await page.locator('.chapter-card').last().waitFor();assert.equal(await page.locator('.chapter-card').count(),5);assert.ok(!(await page.locator('body').textContent()).includes('24 个'));await page.screenshot({path:resolve(dir,'home.png'),fullPage:true});
for(const [id,ch] of Object.entries(chapters))for(const s of ch.scenes){await page.goto(`${base}chapter-${id}/?scene=${s.id}`);await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.equal(await page.locator('#title').textContent(),s.title);assert.equal(await page.locator('#scene-nav a').count(),ch.scenes.length);assert.equal(await page.locator('#view-0,#controls,#scope-note,.lab-grid').count(),0);assert.ok(await page.locator('#real-host canvas,#real-host img').count()>0);await page.locator('#teacher').click();assert.equal(await page.locator('#teacher-panel').isVisible(),true);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(dir,`${id}-${s.id}.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});report.push({chapter:id,scene:s.id,title:s.title,realOnly:true,mobile:true});}
for(const [id,scene] of [['004','04'],['005','01'],['007','05'],['008','05']]){await page.goto(`${base}chapter-${id}/?scene=${scene}`);await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.equal(new URL(page.url()).searchParams.get('scene'),chapters[id].scenes[0].id);}
assert.equal(requests.some(u=>/compute\.worker|chapters\/ch00/.test(u)),false);assert.deepEqual(errors,[]);await writeFile(resolve(dir,'report.json'),JSON.stringify({base,report,oldLinksRedirect:true,noSyntheticRequests:true,errors},null,2));console.log(`PASS ${report.length} real-only routes, removed synthetic UI, mobile and old links`);
}finally{await browser.close();await new Promise(r=>server?server.close(r):r());}
