import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';

test('actual Worker, parameters, stage playback, upload, export, reset, desktop and mobile', {timeout:60000}, async () => {
  const server=await startServer(0);
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
  const page=await context.newPage(),errors=[],outbound=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')) outbound.push(r.url());});
  try {
    await page.goto(base+'/?scene=02');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const initial=await page.locator('#result').evaluate(c=>c.toDataURL());
    await page.locator('#high').fill('110'); await page.locator('#high').dispatchEvent('input');
    await page.waitForFunction(()=>document.body.dataset.state==='ready'&&document.querySelector('#high').value==='110');
    assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),initial);
    await page.getByRole('button',{name:'复位全部'}).click();
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#result').evaluate(c=>c.toDataURL()),initial);
    const before=await page.locator('#stage-name').textContent();
    await page.getByRole('button',{name:'单步'}).click();
    assert.notEqual(await page.locator('#stage-name').textContent(),before);
    await page.getByRole('button',{name:'播放阶段'}).click();
    await page.getByRole('button',{name:'暂停'}).click();
    const pngPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'导出 PNG'}).click();
    assert.match((await pngPromise).suggestedFilename(),/\.png$/);
    const jsonPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'导出参数'}).click();
    const download=await jsonPromise; assert.match(download.suggestedFilename(),/\.json$/);
    await page.locator('#upload').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not a picture')});
    await page.waitForFunction(()=>document.body.dataset.state==='error');
    assert.match(await page.locator('#status').textContent(),/解码/);
    await page.getByRole('button',{name:'复位全部'}).click();
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#upload').setInputFiles(fileURLToPath(new URL('../web/assets/mountains.jpg',import.meta.url)));
    await page.waitForFunction(()=>document.body.dataset.state==='ready'&&document.querySelector('#source-note').textContent.includes('本地上传'));
    await page.locator('#scene').selectOption('01');
    await page.waitForFunction(()=>document.body.dataset.state==='ready'&&document.querySelector('#title').textContent.includes('边缘从哪里来'));
    await page.locator('#preset').selectOption('roof');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const box=await page.locator('#input').boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height*.25);
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.ok(Number(await page.locator('#row').inputValue())<120);
    await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL('../artifacts/edges-desktop.png',import.meta.url)),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:fileURLToPath(new URL('../artifacts/edges-mobile.png',import.meta.url)),fullPage:true});
    await page.setViewportSize({width:1440,height:960});
    for(const scene of ['04','05','07','10']){
      await page.locator('#scene').selectOption(scene);
      await page.waitForFunction(()=>document.body.dataset.state==='ready');
      assert.ok((await page.locator('#status').textContent()).length>10);
      assert.ok((await page.locator('#metrics').textContent()).includes('实际计算'));
      if(scene==='04'){
        const before=await page.locator('#input').evaluate(c=>c.toDataURL());
        const rect=await page.locator('#input').boundingBox();await page.mouse.click(rect.x+30,rect.y+30);
        await page.waitForFunction(()=>document.body.dataset.state==='ready');
        assert.notEqual(await page.locator('#input').evaluate(c=>c.toDataURL()),before);
        assert.ok(!(await page.locator('#metrics').textContent()).includes('真值'));
        await page.locator('#preset').selectOption('ellipse');await page.waitForFunction(()=>document.body.dataset.state==='ready');
      }
      if(scene==='05'){
        const before=await page.locator('#status').textContent();await page.locator('#phase').fill('32.7');await page.locator('#phase').dispatchEvent('input');
        await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.notEqual(await page.locator('#status').textContent(),before);
        await page.locator('#preset').selectOption('flat');await page.waitForFunction(()=>document.body.dataset.state==='error');
        assert.match(await page.locator('#status').textContent(),/平坦剖面.*对比度/);
        await page.getByRole('button',{name:'复位全部'}).click();await page.waitForFunction(()=>document.body.dataset.state==='ready');
      }
      if(scene==='07'){
        const before=await page.locator('#result').evaluate(c=>c.toDataURL());
        const rect=await page.locator('#process').boundingBox();await page.mouse.click(rect.x+rect.width*.2,rect.y+rect.height*.3);
        await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),before);
        await page.locator('#preset').selectOption('circle');await page.waitForFunction(()=>document.body.dataset.state==='ready');
      }
      if(scene==='10'){
        await page.locator('#preset').selectOption('collinear');await page.waitForFunction(()=>document.body.dataset.state==='error');
        assert.match(await page.locator('#status').textContent(),/退化|病态/);
        const downloads=[];page.on('download',d=>downloads.push(d));await page.getByRole('button',{name:'导出 PNG'}).click();assert.equal(downloads.length,0);
        await page.getByRole('button',{name:'复位全部'}).click();await page.waitForFunction(()=>document.body.dataset.state==='ready');
      }
      await page.screenshot({path:fileURLToPath(new URL(`../artifacts/scene-${scene}.png`,import.meta.url)),fullPage:true});
    }
    assert.deepEqual(errors,[]); assert.deepEqual(outbound,[]);
  } finally {await browser.close(); await new Promise(r=>server.close(r));}
});

test('corner scene actual Worker responds to selected window and flat failure example',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=03`);
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.match(await page.locator('#status').textContent(),/特征值/);
    const before=await page.locator('#status').textContent();
    await page.locator('#input').click({position:{x:60,y:60}});
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#status').textContent(),before);
    await page.locator('#corner-angle').fill('30');await page.locator('#corner-angle').dispatchEvent('input');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const rotated=await page.locator('#result').evaluate(c=>c.toDataURL());
    await page.locator('#corner-scale').fill('0.6');await page.locator('#corner-scale').dispatchEvent('input');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),rotated);
    const box=await page.locator('#input').boundingBox(),start=await page.locator('#status').textContent();
    await page.mouse.move(box.x+60,box.y+60);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:4});await page.mouse.up();
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#status').textContent(),start);
    await page.locator('#preset').selectOption('flat');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.match(await page.locator('#status').textContent(),/保留 0 个角点/);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'artifacts/scene-03.png',fullPage:true});
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('Snake real worker, force controls, actual iteration playback and initial contour editing',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=06`);
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.match(await page.locator('#status').textContent(),/真实迭代/);
    const original=await page.locator('#result').evaluate(c=>c.toDataURL());
    await page.locator('#snake-force').fill('0');await page.locator('#snake-force').dispatchEvent('input');
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),original);
    await page.getByRole('button',{name:'复位全部'}).click();await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.getByRole('button',{name:'单步'}).click();assert.match(await page.locator('#stage-name').textContent(),/迭代 0/);
    const input=await page.locator('#input').evaluate(c=>c.toDataURL()),box=await page.locator('#input').boundingBox();
    await page.mouse.move(box.x+box.width*(.5+87/480),box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.85,box.y+box.height*.45);await page.mouse.up();
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#input').evaluate(c=>c.toDataURL()),input);
    const downloaded=page.waitForEvent('download');await page.locator('#export-json').click();
    const stream=await (await downloaded).createReadStream();let json='';for await(const chunk of stream)json+=chunk;
    const config=JSON.parse(json);assert.equal(config.edits.contour.length,40);
    assert.ok(config.edits.contour[0][0]>390);
    for(const preset of ['weak','concave']){await page.locator('#preset').selectOption(preset);await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.match(await page.locator('#status').textContent(),/真实迭代/);}
    assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/scene-06.png',fullPage:true});
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('real photo SIFT runs in browser, transformations change features and descriptor selection is real',{timeout:60000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],external=[];const base=`http://127.0.0.1:${server.address().port}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  try{
    await page.goto(base+'/?scene=08');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.match(await page.locator('#status').textContent(),/实际 SIFT/);assert.match(await page.locator('#source-kind').textContent(),/真实/);
    const siftLegend=await page.locator('#legend').textContent();
    assert.match(siftLegend,/蓝.*关键点/);assert.match(siftLegend,/橙.*选中/);assert.match(siftLegend,/DoG/);
    assert.doesNotMatch(siftLegend,/对应点与变换网格/);
    const before=await page.locator('#result').evaluate(c=>c.toDataURL());
    await page.locator('#sift-angle').fill('30');await page.locator('#sift-angle').dispatchEvent('input');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#result').evaluate(c=>c.toDataURL()),before);
    await page.locator('#preset').selectOption('blobs');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#result').click({position:{x:240,y:145}});await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const download=page.waitForEvent('download');await page.locator('#export-json').click();let json='';for await(const chunk of await(await download).createReadStream())json+=chunk;
    assert.equal(typeof JSON.parse(json).edits.selectedKeypoint,'number');
    const option=await page.locator('#stage option').evaluateAll(items=>items.find(i=>i.textContent.includes('128维')).value);
    await page.locator('#stage').selectOption(option);assert.match(await page.locator('#stage-name').textContent(),/128维/);
    await page.screenshot({path:'artifacts/scene-08.png',fullPage:true});
    await page.locator('#preset').selectOption('flat');await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.match(await page.locator('#status').textContent(),/没有/);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('matching real SIFT pipeline, ratio parameter, four stage evidence and difficult cases',{timeout:60000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=09`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const status=await page.locator('#status').textContent();assert.match(status,/几何内点/);assert.match(await page.locator('#metrics').textContent(),/中位重投影/);
    const matchingLegend=await page.locator('#legend').textContent();
    assert.match(matchingLegend,/蓝.*内点/);assert.match(matchingLegend,/橙.*外点/);
    assert.match(matchingLegend,/内点比例不等于正确率/);assert.doesNotMatch(matchingLegend,/对应点与变换网格/);
    assert.equal(await page.locator('#stage option').count(),4);
    await page.locator('#match-ratio').fill('0.3');await page.locator('#match-ratio').dispatchEvent('input');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.notEqual(await page.locator('#status').textContent(),status);
    await page.getByRole('button',{name:'复位全部'}).click();await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.equal(await page.locator('#status').textContent(),status);
    for(const preset of ['repeat','large','blur']){await page.locator('#preset').selectOption(preset);await page.waitForFunction(()=>document.body.dataset.state==='ready');assert.match(await page.locator('#status').textContent(),/候选/);}
    await page.screenshot({path:'artifacts/scene-09.png',fullPage:true});assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('real two-frame matching and independent second upload never claim ground-truth accuracy',{timeout:45000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage(),external=[],base=`http://127.0.0.1:${server.address().port}`;
  page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  try{
    await page.goto(base+'/?scene=09');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.doesNotMatch(await page.locator('#metrics').textContent(),/正确率/);assert.match(await page.locator('#source-note').textContent(),/8.48/);
    await page.locator('#upload').setInputFiles(fileURLToPath(new URL('../web/assets/mountains.jpg',import.meta.url)));await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#upload-second').setInputFiles(fileURLToPath(new URL('../web/assets/mountains-02.jpg',import.meta.url)));await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.doesNotMatch(await page.locator('#metrics').textContent(),/正确率/);assert.match(await page.locator('#source-note').textContent(),/本地双图/);
    const downloaded=page.waitForEvent('download');await page.locator('#export-json').click();
    let exported='';for await(const chunk of await(await downloaded).createReadStream())exported+=chunk;
    const mappings=JSON.parse(exported).sourceMappings;
    assert.deepEqual(mappings.first.original,{width:1600,height:900});
    assert.deepEqual(mappings.second.original,{width:1600,height:900});
    assert.deepEqual(mappings.second.originalToAnalysis,[[.4,0,-.3],[0,.4,-.3],[0,0,1]]);
    assert.ok(!JSON.stringify(mappings).includes('pixels'));
    assert.deepEqual(external,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('high quality SIFT native stages render exact constant DoG and cancelled jobs cannot overwrite reset',{timeout:45000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=08`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#quality').selectOption('1280');await page.locator('#cancel').click();
    assert.equal(await page.locator('body').getAttribute('data-state'),'cancelled');
    await page.locator('#preset').selectOption('flat');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const layer=await page.locator('#stage option').evaluateAll(items=>items.find(i=>i.textContent.startsWith('DoG octave 2')).value);
    await page.locator('#stage').selectOption(layer);
    assert.deepEqual(await page.locator('#process').evaluate(c=>[...c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data]),[128,128,128,255]);
    await page.locator('#preset').selectOption('photo');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#input').evaluate(c=>c.width),1280);assert.match(await page.locator('#status').textContent(),/实际 SIFT/);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
test('freehand initial Snake contour is resampled, computed and saved in exported configuration',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=06`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.getByRole('button',{name:'绘制初始轮廓'}).click();const box=await page.locator('#input').boundingBox();
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.25);await page.mouse.down();
    for(const [x,y]of [[.7,.25],[.7,.75],[.3,.75],[.3,.25]])await page.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const download=page.waitForEvent('download');await page.locator('#export-json').click();let text='';for await(const chunk of await(await download).createReadStream())text+=chunk;
    const contour=JSON.parse(text).edits.contour;assert.equal(contour.length,40);assert.ok(Math.abs(contour[0][0]-144)<2);assert.ok(Math.abs(contour[0][1]-75)<2);
    assert.match(await page.locator('#status').textContent(),/真实迭代/);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('reset after high quality photo restores preview resolution and identical default result',{timeout:60000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=08`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const initial=await page.locator('#result').evaluate(c=>c.toDataURL());
    assert.equal(await page.locator('#input').evaluate(c=>c.width),640);
    await page.locator('#quality').selectOption('1280');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#input').evaluate(c=>c.width),1280);
    await page.getByRole('button',{name:'复位全部'}).click();await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#quality').inputValue(),'640');
    assert.equal(await page.locator('#input').evaluate(c=>c.width),640);
    assert.equal(await page.locator('#result').evaluate(c=>c.toDataURL()),initial);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('real photo sampling excludes CSS letterboxing on desktop and mobile',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=01`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#preset').selectOption('photo');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    for(const viewport of [{width:1440,height:960},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.locator('#input').scrollIntoViewIfNeeded();
      const point=await page.locator('#input').evaluate(c=>{
        const rect=c.getBoundingClientRect(),scale=Math.min(c.clientWidth/c.width,c.clientHeight/c.height);
        return {x:rect.left+c.clientLeft+c.clientWidth/2,y:rect.top+c.clientTop+(c.clientHeight-c.height*scale)/2+36*scale};
      });
      await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>document.body.dataset.state==='ready');
      assert.equal(Number(await page.locator('#row').inputValue()),36);
      assert.match(await page.locator('#status').textContent(),/y=36/);
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('changing Snake preset exits pending freehand mode before subsequent normal editing',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=06`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.getByRole('button',{name:'绘制初始轮廓'}).click();
    await page.locator('#preset').selectOption('weak');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const box=await page.locator('#input').boundingBox();
    await page.mouse.move(box.x+box.width*(.5+87/480),box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.85,box.y+box.height*.45,{steps:4});await page.mouse.up();
    await page.waitForFunction(()=>['ready','error'].includes(document.body.dataset.state));
    assert.equal(await page.locator('body').getAttribute('data-state'),'ready');
    const download=page.waitForEvent('download');await page.locator('#export-json').click();let json='';for await(const chunk of await(await download).createReadStream())json+=chunk;
    const contour=JSON.parse(json).edits.contour;assert.equal(contour.length,40);assert.ok(contour[0][0]>390);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('uploaded image quality switch redecodes locally and exports actual source mapping',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  const external=[];page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.address().port}/`))external.push(r.url());});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=01`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#upload').setInputFiles(fileURLToPath(new URL('../web/assets/mountains.jpg',import.meta.url)));await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#input').evaluate(c=>c.width),640);
    await page.locator('#quality').selectOption('1280');await page.waitForFunction(()=>['ready','error'].includes(document.body.dataset.state));
    assert.equal(await page.locator('body').getAttribute('data-state'),'ready');
    assert.deepEqual(await page.locator('#input').evaluate(c=>[c.width,c.height]),[1280,720]);
    const download=page.waitForEvent('download');await page.locator('#export-json').click();let json='';for await(const chunk of await(await download).createReadStream())json+=chunk;
    const config=JSON.parse(json);assert.deepEqual(config.dimensions,{width:1280,height:720});
    assert.deepEqual(config.sourceMappings.first.originalToAnalysis,[[.8,0,-.09999999999999998],[0,.8,-.09999999999999998],[0,0,1]]);
    await page.locator('#quality').selectOption('640');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.deepEqual(await page.locator('#input').evaluate(c=>[c.width,c.height]),[640,360]);assert.deepEqual(external,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('dual uploads quality switch updates both mappings and reset supersedes in-flight decoding',{timeout:45000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=09`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#upload').setInputFiles(fileURLToPath(new URL('../web/assets/mountains.jpg',import.meta.url)));await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#upload-second').setInputFiles(fileURLToPath(new URL('../web/assets/mountains-02.jpg',import.meta.url)));await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#quality').selectOption('1280');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    const download=page.waitForEvent('download');await page.locator('#export-json').click();let json='';for await(const chunk of await(await download).createReadStream())json+=chunk;
    const config=JSON.parse(json);
    for(const key of ['first','second']){
      assert.deepEqual(config.sourceMappings[key].decoded,{width:1280,height:720});
      assert.deepEqual(config.sourceMappings[key].original,{width:1600,height:900});
      assert.equal(config.sourceMappings[key].originalToAnalysis[0][0],.8);
    }
    await page.evaluate(()=>{
      const quality=document.getElementById('quality');quality.value='640';quality.dispatchEvent(new Event('change'));
      document.getElementById('reset').click();
    });
    await page.waitForFunction(()=>document.body.dataset.state==='ready');
    assert.equal(await page.locator('#quality').inputValue(),'640');
    assert.equal(await page.locator('#input').evaluate(c=>c.width),640);
    assert.equal(await page.locator('#upload').evaluate(e=>e.files.length),0);
    assert.equal(await page.locator('#upload-second').evaluate(e=>e.files.length),0);
    assert.match(await page.locator('#source-kind').textContent(),/真实视频双帧/);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('photo pan follows CSS pointer distance through letterboxing and zoom on desktop and mobile',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?scene=01`);await page.waitForFunction(()=>document.body.dataset.state==='ready');
    await page.locator('#preset').selectOption('photo');await page.waitForFunction(()=>document.body.dataset.state==='ready');
    for(const viewport of [{width:1440,height:960},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.locator('#home-view').click();
      await page.locator('#zoom').evaluate(e=>{e.value='1.5';e.dispatchEvent(new Event('input'));});
      await page.locator('#input').scrollIntoViewIfNeeded();
      const layout=await page.locator('#input').evaluate(c=>{
        const r=c.getBoundingClientRect(),s=Math.min(c.clientWidth/c.width,c.clientHeight/c.height);
        return {x:r.left+c.clientLeft+c.clientWidth/2,y:r.top+c.clientTop+c.clientHeight/2,s,h:c.height};
      });
      await page.keyboard.down('Shift');await page.mouse.move(layout.x,layout.y);await page.mouse.down();
      await page.mouse.move(layout.x,layout.y+30,{steps:3});await page.mouse.up();await page.keyboard.up('Shift');
      // Independent geometry: centered 1.5x zoom plus exactly 30 CSS-pixel downward pan.
      await page.mouse.click(layout.x,layout.y+(120-layout.h/2)*1.5*layout.s+30);
      await page.waitForFunction(()=>document.body.dataset.state==='ready');
      assert.equal(Number(await page.locator('#row').inputValue()),120);
      assert.match(await page.locator('#status').textContent(),/y=120/);
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
