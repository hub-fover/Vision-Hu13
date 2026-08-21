import { measureMotions, buildSampleMotion } from './measurement.js';
let cancelled=new Set();let runtimePromise;
async function loadLocalRuntime(){runtimePromise??=import('../vendor/opencv.js').catch(()=>null);return runtimePromise;}
self.onmessage=async event=>{const {id,type,payload}=event.data;if(type==='cancel'){cancelled.add(id);return;}if(type==='load-runtime'){const runtime=await loadLocalRuntime();self.postMessage({id,result:{available:Boolean(runtime)}});return;}if(type==='measure'){try{const motions=payload?.motions||buildSampleMotion(240,payload?.fps||30);if(cancelled.has(id))return;const result=measureMotions(motions,payload);self.postMessage({id,result});}catch(error){self.postMessage({id,error:{code:error.code||'INVALID_FRAME',message:error.message}});}}};
