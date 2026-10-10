import {normalizeParams,validateInput,checkResult} from './runtime.mjs';
self.onmessage=async({data:req})=>{
 try{
  if(!/^00[4-8]$/.test(req.chapter))throw new Error('未知章节');
  const {scenes}=await import(`./chapters/ch${req.chapter}.mjs`);
  const scene=scenes.find(s=>s.id===req.scene);
  if(!scene)throw new Error('未知实验');
  const params=normalizeParams(scene.controls,req.params),input=validateInput(req.input);
  if(input&&!scene.supportsInput)throw new Error('当前实验使用内置教学数据');
  const start=performance.now();
  const result=checkResult(await scene.compute({params,seed:req.seed,input}));
  self.postMessage({id:req.id,result,params,time:performance.now()-start});
 }catch(error){self.postMessage({id:req.id,error:error.message});}
};
