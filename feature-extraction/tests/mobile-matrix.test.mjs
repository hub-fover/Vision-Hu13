import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from '../scripts/serve.mjs';
test('all ten scene routes on mobile: teacher, compare, stage, downloads, decode error and reset',{timeout:120000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),base=`http://127.0.0.1:${server.address().port}`,errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  try{
    for(let scene=1;scene<=10;scene++){
      const id=String(scene).padStart(2,'0');await page.goto(base+'/?scene='+id+'&teacher=1');await page.waitForFunction(()=>document.body.dataset.state==='ready');
      assert.equal(await page.locator('#scene').inputValue(),id);assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('teacher')));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('#teacher').click();const initial=await page.locator('#result').evaluate(c=>c.toDataURL());
      await page.locator('#original').check();assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),initial);await page.locator('#original').uncheck();
      const stage=await page.locator('#stage-name').textContent();await page.locator('#step').click();assert.notEqual(await page.locator('#stage-name').textContent(),stage);
      const jsonPromise=page.waitForEvent('download');await page.locator('#export-json').click();let text='';for await(const chunk of await(await jsonPromise).createReadStream())text+=chunk;const config=JSON.parse(text);assert.equal(config.scene,id);assert.ok(config.computeMs>=0);
      const pngPromise=page.waitForEvent('download');await page.locator('#export-png').click();const png=await pngPromise;const stream=await png.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);assert.deepEqual([...Buffer.concat(chunks).subarray(0,8)],[137,80,78,71,13,10,26,10]);
      await page.locator('#upload').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid')});await page.waitForFunction(()=>document.body.dataset.state==='error');assert.match(await page.locator('#status').textContent(),/解码失败/);
      await page.locator('#reset').click();await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.equal(await page.locator('#result').evaluate(c=>c.toDataURL()),initial);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
