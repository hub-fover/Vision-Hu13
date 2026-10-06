import {analyzeEdges,canny,generateSample} from './algorithms/edges.mjs';
import {runGeometric} from './scenes/geometric.mjs';
import {transferBuffers} from './algorithms/transfer.mjs';
const send=payload=>self.postMessage(payload,transferBuffers(payload));
self.onmessage=({data:job})=>{
  const start=performance.now();
  try {
    const {id,scene,w,h,options,seed=42}=job;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w>1280||h>1280||w*h>1280*1280) throw new Error('计算尺寸超出预算');
    for(const [pixels,width,height] of [[job.input,w,h],[job.input2,job.input2Width||w,job.input2Height||h]]){
      if(pixels==null)continue;
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width>1280||height>1280||width*height>1280*1280)throw new Error('计算尺寸超出预算');
      if(pixels.length!==width*height)throw new Error('输入长度与尺寸不一致');
      for(const value of pixels)if(!Number.isFinite(value))throw new Error('输入像素必须为有限数值');
    }
    if(['03','04','05','06','07','08','09','10'].includes(scene)){
      const output=runGeometric(job);send({id,scene,w,h,...output,sourceMappings:job.sourceMappings,options,seed,timing:performance.now()-start});return;
    }
    const input=job.input?Float32Array.from(job.input):generateSample(options.preset,w,h,options.noise,seed);
    if(input.length!==w*h) throw new Error('输入长度与尺寸不一致');
    // Uploaded/real-photo noise is added deterministically using a zero-noise baseline difference.
    if(job.input&&options.noise) {
      const noisy=generateSample('step',w,h,options.noise,seed),clean=generateSample('step',w,h,0,seed);
      for(let i=0;i<input.length;i++) input[i]=Math.max(0,Math.min(255,input[i]+noisy[i]-clean[i]));
    }
    const result=scene==='02'?canny(input,w,h,options):analyzeEdges(input,w,h,options);
    send({id,scene,w,h,input,result,sourceMappings:job.sourceMappings,options,seed,timing:performance.now()-start});
  } catch(error){self.postMessage({id:job.id,error:error.message});}
};
