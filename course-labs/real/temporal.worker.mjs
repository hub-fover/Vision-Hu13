let analyzer;
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  const {createAnalyzer}=await import('./temporal-core.mjs');let jsfeat;
  if(data.options.mode==='flow'){self.window=self;importScripts('./assets/perception/jsfeat.js');jsfeat=self.jsfeat;}
  analyzer=createAnalyzer(jsfeat,data.options);self.postMessage({ready:true});
 }else if(data.type==='frame')self.postMessage({result:analyzer.push(data.frame),done:true});
}catch(e){self.postMessage({error:e.message})}};
