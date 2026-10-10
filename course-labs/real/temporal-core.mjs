import {frameDifference,sparseFlow} from './perception-core.mjs';
const median=a=>{if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
export function components(mask,w,h,minArea=20){
 const seen=new Uint8Array(mask.length),boxes=[];
 for(let p=0;p<mask.length;p++){if(!mask[p]||seen[p])continue;const queue=[p];seen[p]=1;let minX=w,minY=h,maxX=0,maxY=0;
  for(let k=0;k<queue.length;k++){const i=queue[k],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n)}}
  if(queue.length>=minArea)boxes.push({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area:queue.length});
 }return boxes;
}
function opening(mask,w,h){
 const eroded=new Uint8Array(mask.length),out=new Uint8Array(mask.length);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let ok=1;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)ok&=mask[(y+j)*w+x+i];eroded[y*w+x]=ok}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(eroded[y*w+x])for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)out[(y+j)*w+x+i]=1;return out;
}
function pyramid(jsfeat,frame,levels){const p=new jsfeat.pyramid_t(levels);p.allocate(frame.width,frame.height,jsfeat.U8_t|jsfeat.C1_t);jsfeat.imgproc.grayscale(frame.data,frame.width,frame.height,p.data[0]);p.build(p.data[0],true);return p;}
export function createAnalyzer(jsfeat,options={}){
 const o={mode:'flow',window:21,iterations:30,levels:3,fb:1.5,threshold:25,alpha:.03,minArea:25,freeze:true,clean:true,reseed:true,...options};
 let prev=null,bg=null,points=[],nextId=1,index=0;
 const seed=frame=>sparseFlow(jsfeat,frame.data,frame.data,frame.width,frame.height,o).tracks.filter(t=>t.valid).map(t=>({id:nextId++,x:t.x,y:t.y,history:[[t.x,t.y]]}));
 return {push(frame){
  const {width:w,height:h}=frame;if(!frame.data||frame.data.length!==w*h*4)throw Error('帧数据尺寸错误');
  if(prev&&(w!==prev.width||h!==prev.height))throw Error('连续帧尺寸必须一致');if(prev&&frame.time<=prev.time)throw Error('帧时间必须递增');
  if(!prev){prev=frame;bg=Float32Array.from(frame.data);if(o.mode==='flow')points=seed(frame);return null;}
  const previous=prev;let result;
  if(o.mode==='background'){
   const fd=frameDifference(previous.data,frame.data,o.threshold),diff=new Uint8ClampedArray(frame.data.length),background=new Uint8ClampedArray(frame.data.length);let mask=new Uint8Array(w*h);
   for(let p=0;p<w*h;p++){let d=0;for(let q=0;q<3;q++){d+=Math.abs(frame.data[4*p+q]-bg[4*p+q])/3;background[4*p+q]=bg[4*p+q]}background[4*p+3]=255;mask[p]=+(d>o.threshold);for(let q=0;q<3;q++)diff[4*p+q]=d;diff[4*p+3]=255;}
   for(let p=0;p<w*h;p++)if(!o.freeze||!mask[p])for(let q=0;q<3;q++)bg[4*p+q]=(1-o.alpha)*bg[4*p+q]+o.alpha*frame.data[4*p+q];
   if(o.clean)mask=opening(mask,w,h);const image=new Uint8ClampedArray(frame.data.length);for(let p=0;p<mask.length;p++){image[4*p]=image[4*p+1]=image[4*p+2]=mask[p]*255;image[4*p+3]=255}
   const boxes=components(mask,w,h,o.minArea);result={image,background,diff,frameDiff:fd.image,boxes,metrics:{changed:fd.changed,foreground:mask.reduce((s,v)=>s+v,0),regions:boxes.length}};
  }else{
   const a=pyramid(jsfeat,previous,o.levels),b=pyramid(jsfeat,frame,o.levels),n=points.length,xy=Float32Array.from(points.flatMap(p=>[p.x,p.y])),out=new Float32Array(n*2),back=new Float32Array(n*2),valid=new Uint8Array(n),reverse=new Uint8Array(n);
   jsfeat.optical_flow_lk.track(a,b,xy,out,n,o.window,o.iterations,valid,.01,.0001);jsfeat.optical_flow_lk.track(b,a,out,back,n,o.window,o.iterations,reverse,.01,.0001);
   const tracks=points.map((p,i)=>{const nx=out[i*2],ny=out[i*2+1],fb=Math.hypot(back[i*2]-p.x,back[i*2+1]-p.y);const ok=!!valid[i]&&!!reverse[i]&&fb<=o.fb&&nx>=0&&ny>=0&&nx<w&&ny<h;return {...p,nx,ny,fb,valid:ok,history:ok?[...p.history,[nx,ny]].slice(-30):p.history}});
   const good=tracks.filter(t=>t.valid),dx=good.map(t=>t.nx-t.x),dy=good.map(t=>t.ny-t.y),dt=frame.time-previous.time;
   result={tracks,metrics:{tested:n,active:good.length,lost:n-good.length,retention:n?good.length/n:0,medianDx:median(dx),medianDy:median(dy),medianSpeed:median(good.map(t=>Math.hypot(t.nx-t.x,t.ny-t.y)/dt)),medianFB:median(good.map(t=>t.fb))}};
   points=good.map(t=>({id:t.id,x:t.nx,y:t.ny,history:t.history}));let added=0;
   if(o.reseed&&points.length<60){for(const p of seed(frame)){if(points.every(t=>(t.x-p.x)**2+(t.y-p.y)**2>100)){points.push(p);added++}if(points.length>=150)break}}
   result.metrics.added=added;
  }
  prev=frame;return {index:++index,time:frame.time,dt:frame.time-previous.time,width:w,height:h,originalWidth:frame.originalWidth??w,originalHeight:frame.originalHeight??h,previous:previous.data,current:frame.data,...result};
 }};
}
