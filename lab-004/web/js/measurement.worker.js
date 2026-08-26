import { measureMotions } from './measurement.js';
import { motionFromFramesFlowRansac } from './capture.js';
let cancelled=new Set();let runtimePromise;
async function loadLocalRuntime(){runtimePromise??=import('../vendor/opencv.js').catch(()=>null);return runtimePromise;}
self.onmessage=async event=>{const {id,type,payload}=event.data;if(type==='cancel'){cancelled.add(id);return;}if(type==='load-runtime'){const runtime=await loadLocalRuntime();self.postMessage({id,result:{available:Boolean(runtime)}});return;}if(type==='measure'){try{if(cancelled.has(id))return;const motions=payload?.motions||motionFromFramesFlowRansac(payload.frames,payload.roi,payload.fps||30);const result=measureMotions(motions,payload);self.postMessage({id,result});}catch(error){self.postMessage({id,error:{code:error.code||'INVALID_FRAME',message:error.message}});}}};
