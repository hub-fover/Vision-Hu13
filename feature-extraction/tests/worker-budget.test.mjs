import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from '../scripts/serve.mjs';

test('all ten Workers finish at maximum square analysis size with bounded returned buffers',{timeout:90000},async t=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const results=await page.evaluate(async()=>{
      const {geometricScenes}=await import('./scenes/geometric.mjs');
      const results=[];
      for(let n=1;n<=10;n++){
        const scene=String(n).padStart(2,'0'),config=geometricScenes[scene];
        const options=config?Object.fromEntries(config.controls.map(c=>[c.id,c.value])):{sigma:1.2,noise:0,row:150,method:'sobel',low:10,high:25};
        options.preset=scene==='08'?'blobs':scene==='09'?'texture':config?.defaultPreset||'step';
        const worker=new Worker('./compute.worker.mjs',{type:'module'});
        try{
          const result=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error(`scene ${scene} did not finish within 20s`)),20000);
            worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};
            worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
            worker.postMessage({id:n,scene,w:1280,h:1280,options,seed:42});
          });
          const buffers=new Set();
          function collect(value){
            if(!value||typeof value!=='object')return;
            if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}
            for(const child of Object.values(value))collect(child);
          }
          collect(result);
          results.push({scene,error:result.error,bytes:[...buffers].reduce((sum,b)=>sum+b.byteLength,0),timing:result.timing,stages:result.result?.stages.length,inputLength:result.input?.length});
        }finally{worker.terminate();}
      }
      return results;
    });
    for(const r of results){
      assert.equal(r.error,undefined,`scene ${r.scene}`);
      assert.equal(r.inputLength,1280*1280);assert.ok(r.stages>=2);
      assert.ok(Number.isFinite(r.timing)&&r.timing>=0);
      assert.ok(r.bytes<=256*1024*1024,`scene ${r.scene}: returned buffers exceed 256MiB`);
      t.diagnostic(JSON.stringify(r));
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
