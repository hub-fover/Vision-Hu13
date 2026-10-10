export function* kmeansSteps(rgba,k=4,iterations=12){
 const n=rgba.length/4;if(!Number.isInteger(n)||!n)throw Error('空图像');
 k=Math.max(2,Math.min(12,Math.round(k)));iterations=Math.max(1,Math.min(40,Math.round(iterations)));
 const centers=[Array.from(rgba.slice(0,3))];
 while(centers.length<k){let best=0,far=-1;for(let i=0;i<n;i++){let d=Math.min(...centers.map(c=>c.reduce((s,v,j)=>s+(v-rgba[4*i+j])**2,0)));if(d>far){far=d;best=i}}centers.push(Array.from(rgba.slice(4*best,4*best+3)))}
 for(let iteration=1;iteration<=iterations;iteration++){
  const labels=new Uint8Array(n),sums=centers.map(()=>[0,0,0,0]);
  for(let i=0;i<n;i++){let best=0,dist=Infinity;centers.forEach((c,j)=>{let d=c.reduce((s,v,q)=>s+(v-rgba[4*i+q])**2,0);if(d<dist){dist=d;best=j}});labels[i]=best;for(let q=0;q<3;q++)sums[best][q]+=rgba[4*i+q];sums[best][3]++}
  centers.forEach((c,j)=>{if(sums[j][3])for(let q=0;q<3;q++)c[q]=sums[j][q]/sums[j][3]});
  let sse=0;const image=new Uint8ClampedArray(rgba.length);for(let i=0;i<n;i++){for(let q=0;q<3;q++){const c=centers[labels[i]][q];image[4*i+q]=c;sse+=(rgba[4*i+q]-c)**2}image[4*i+3]=255}
  yield {iteration,labels,image,centers:centers.map(c=>c.slice()),sse,mse:sse/(n*3),counts:sums.map(c=>c[3])};
 }
}
export function frameDifference(a,b,threshold=25){
 if(a.length!==b.length)throw Error('两帧尺寸不同');const n=a.length/4,diff=new Uint8ClampedArray(a.length),mask=new Uint8Array(n),image=new Uint8ClampedArray(a.length);let changed=0;
 for(let i=0;i<n;i++){let d=0;for(let q=0;q<3;q++)d+=Math.abs(a[4*i+q]-b[4*i+q])/3;mask[i]=+(d>threshold);changed+=mask[i];for(let q=0;q<3;q++){diff[4*i+q]=d;image[4*i+q]=mask[i]*255}diff[4*i+3]=image[4*i+3]=255}return{diff,mask,image,changed};
}
export function sparseFlow(jsfeat,a,b,w,h,{window=21,iterations=30,levels=3,threshold=20}={}){
 const prev=new jsfeat.pyramid_t(levels),next=new jsfeat.pyramid_t(levels);prev.allocate(w,h,jsfeat.U8_t|jsfeat.C1_t);next.allocate(w,h,jsfeat.U8_t|jsfeat.C1_t);
 jsfeat.imgproc.grayscale(a,w,h,prev.data[0]);jsfeat.imgproc.grayscale(b,w,h,next.data[0]);prev.build(prev.data[0],true);next.build(next.data[0],true);
 const corners=Array.from({length:w*h},()=>new jsfeat.keypoint_t(0,0,0,0));jsfeat.fast_corners.set_threshold(threshold);let n=jsfeat.fast_corners.detect(prev.data[0],corners,Math.max(window,20));corners.length=n;corners.sort((a,b)=>b.score-a.score);
 const chosen=[];for(const c of corners){if(chosen.every(p=>(p.x-c.x)**2+(p.y-c.y)**2>100))chosen.push(c);if(chosen.length>=180)break}n=chosen.length;
 const xy=new Float32Array(n*2),out=new Float32Array(n*2),status=new Uint8Array(n);chosen.forEach((p,i)=>{xy[2*i]=p.x;xy[2*i+1]=p.y});
 jsfeat.optical_flow_lk.track(prev,next,xy,out,n,window,iterations,status,.01,.0001);
 const tracks=chosen.map((p,i)=>({x:p.x,y:p.y,nx:out[2*i],ny:out[2*i+1],valid:!!status[i]}));return{tracks,detected:n,tracked:tracks.filter(t=>t.valid).length,pyramid:prev.data.map(m=>({width:m.cols,height:m.rows,data:Array.from(m.data.slice(0,m.cols*m.rows))}))};
}
