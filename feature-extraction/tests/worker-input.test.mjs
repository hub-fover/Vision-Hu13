import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from '../scripts/serve.mjs';

test('real Worker rejects malformed geometric input before computation',{timeout:30000},async()=>{
  const server=await startServer(0),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const messages=await page.evaluate(async()=>{
      const jobs=[
        {id:1,scene:'03',w:32,h:32,input:new Float32Array(10),options:{preset:'flat'}},
        {id:2,scene:'08',w:32,h:32,input:Float32Array.from({length:1024},(_,i)=>i===10?NaN:128),options:{preset:'flat'}},
        {id:3,scene:'09',w:32,h:32,input:new Float32Array(1024),input2:new Float32Array(10),input2Width:32,input2Height:32,options:{preset:'realpair'}},
        {id:4,scene:'01',w:1281,h:3,options:{preset:'step',sigma:1.2,noise:0,row:1,method:'sobel'}},
        {id:5,scene:'01',w:3,h:1281,options:{preset:'step',sigma:1.2,noise:0,row:1,method:'sobel'}},
        {id:6,scene:'09',w:32,h:32,input:new Float32Array(1024),input2:new Float32Array(3843),input2Width:1281,input2Height:3,options:{preset:'realpair'}}
      ];
      const results=[];
      for(const job of jobs){
        const worker=new Worker('./compute.worker.mjs',{type:'module'});
        results.push(await new Promise((resolve,reject)=>{
          const deadline=setTimeout(()=>resolve({error:'Worker did not respond to malformed input within 3 seconds'}),3000);
          worker.onmessage=e=>{clearTimeout(deadline);resolve(e.data);};
          worker.onerror=e=>{clearTimeout(deadline);reject(new Error(e.message));};
          worker.postMessage(job);
        }));worker.terminate();
      }
      return results;
    });
    assert.match(messages[0].error||'',/输入长度/);
    assert.match(messages[1].error||'',/有限/);
    assert.match(messages[2].error||'',/输入长度/);
    for(const message of messages.slice(3))assert.match(message.error||'',/尺寸.*预算/);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
