import { gaussianKernel, derivatives, seededRandom } from './numerics.mjs';

export function reflect(i,n) {
  if(n===1) return 0;
  while(i<0||i>=n) i=i<0?-i:2*n-2-i;
  return i;
}
export function blur(input,w,h,sigma) {
  if(sigma===0) return Float32Array.from(input);
  const k=gaussianKernel(sigma),r=k.length>>1,tmp=new Float32Array(w*h),out=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    let s=0; for(let j=-r;j<=r;j++) s+=input[y*w+reflect(x+j,w)]*k[j+r]; tmp[y*w+x]=s;
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    let s=0; for(let j=-r;j<=r;j++) s+=tmp[reflect(y+j,h)*w+x]*k[j+r]; out[y*w+x]=s;
  }
  return out;
}
export function gradient(input,w,h,method='sobel') {
  const a=method==='scharr'?3:1,b=method==='scharr'?10:2,scale=2*(2*a+b);
  const gx=new Float32Array(w*h),gy=new Float32Array(w*h),magnitude=new Float32Array(w*h),direction=new Float32Array(w*h);
  const at=(x,y)=>input[reflect(y,h)*w+reflect(x,w)];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=y*w+x;
    gx[i]=(a*(at(x+1,y-1)-at(x-1,y-1))+b*(at(x+1,y)-at(x-1,y))+a*(at(x+1,y+1)-at(x-1,y+1)))/scale;
    gy[i]=(a*(at(x-1,y+1)-at(x-1,y-1))+b*(at(x,y+1)-at(x,y-1))+a*(at(x+1,y+1)-at(x+1,y-1)))/scale;
    magnitude[i]=Math.hypot(gx[i],gy[i]); direction[i]=Math.atan2(gy[i],gx[i]);
  }
  return {gx,gy,magnitude,direction};
}
export function laplacian(input,w,h) {
  const out=new Float32Array(w*h), at=(x,y)=>input[reflect(y,h)*w+reflect(x,w)];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) out[y*w+x]=at(x-1,y)+at(x+1,y)+at(x,y-1)+at(x,y+1)-4*at(x,y);
  return out;
}
export function suppress(mag,dir,w,h) {
  const out=new Float32Array(w*h);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    const i=y*w+x,angle=(dir[i]*180/Math.PI+180)%180;
    let offset=1;
    if(angle>=22.5&&angle<67.5) offset=w+1;
    else if(angle>=67.5&&angle<112.5) offset=w;
    else if(angle>=112.5&&angle<157.5) offset=w-1;
    // Asymmetric tie-break keeps a plateau one pixel wide.
    if(mag[i]>mag[i-offset]&&mag[i]>=mag[i+offset]) out[i]=mag[i];
  }
  return out;
}
export function hysteresis(nms,w,h,low,high) {
  if(!Number.isFinite(low)||!Number.isFinite(high)||low<0||high<=0||low>high) throw new RangeError('invalid threshold order');
  const labels=new Uint8Array(w*h),edges=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let tail=0,strong=0,weak=0,retainedWeak=0;
  for(let i=0;i<nms.length;i++) {
    if(nms[i]>0&&nms[i]>=high) {labels[i]=2;edges[i]=255;queue[tail++]=i;strong++;}
    else if(nms[i]>0&&nms[i]>=low) {labels[i]=1;weak++;}
  }
  for(let head=0;head<tail;head++) {
    const i=queue[head],x=i%w,y=Math.floor(i/w);
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const nx=x+dx,ny=y+dy,j=ny*w+nx;
      if(nx>=0&&nx<w&&ny>=0&&ny<h&&labels[j]===1&&!edges[j]) {edges[j]=255;queue[tail++]=j;retainedWeak++;}
    }
  }
  return {labels,edges,strong,weak,retainedWeak,removedWeak:weak-retainedWeak};
}
export function canny(input,w,h,{sigma=1.2,low=10,high=25}={}) {
  const smoothed=blur(input,w,h,sigma),g=gradient(smoothed,w,h),nms=suppress(g.magnitude,g.direction,w,h);
  const connected=hysteresis(nms,w,h,low,high);
  return {smoothed,...g,nms,...connected,edgeCount:connected.strong+connected.retainedWeak,
    stages:[{name:'原始灰度',data:input,kind:'gray'},{name:'高斯平滑',data:smoothed,kind:'gray'},
      {name:'梯度幅值',data:g.magnitude,kind:'magnitude'},{name:'梯度方向',data:g.direction,mask:g.magnitude,kind:'direction'},
      {name:'非极大值抑制',data:nms,kind:'magnitude'},{name:'双阈值分类',data:connected.labels,kind:'labels'},
      {name:'8 邻域连通结果',data:connected.edges,kind:'gray'}]};
}
export function generateSample(kind,w,h,noise=0,seed=42) {
  const out=new Float32Array(w*h),random=seededRandom(seed);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const mid=w*(0.5+0.13*Math.sin(y/h*Math.PI*2));
    let value;
    if(kind==='line') value=Math.abs(x-mid)<w*.035?220:30;
    else if(kind==='roof') value=30+190*Math.max(0,1-Math.abs(x-mid)/(w*.18));
    else if(kind==='weak') {
      const box=x>w*.2&&x<w*.72&&y>h*.18&&y<h*.8;
      value=box?30+(y<h*.45?180:45):30;
      if(x>w*.83&&x<w*.88&&y>h*.25&&y<h*.6) value=65;
    } else value=x<mid?30:220;
    const normal=Math.sqrt(-2*Math.log(Math.max(1e-10,random())))*Math.cos(2*Math.PI*random());
    out[y*w+x]=Math.max(0,Math.min(255,value+noise*normal));
  }
  return out;
}
export function analyzeEdges(input,w,h,{sigma=1,row=Math.floor(h/2),method='sobel'}={}) {
  const smoothed=blur(input,w,h,sigma),g=gradient(smoothed,w,h,method==='scharr'?'scharr':'sobel'),log=laplacian(smoothed,w,h);
  row=Math.max(0,Math.min(h-1,Math.round(row)));
  const gray=smoothed.slice(row*w,(row+1)*w),d=derivatives(gray),peaks=[],zeroCrossings=[];
  for(let x=1;x<w-1;x++) {
    const v=Math.abs(d.first[x]);
    if(v>2&&v>Math.abs(d.first[x-1])&&v>=Math.abs(d.first[x+1])) peaks.push(x);
    if(d.second[x-1]*d.second[x]<0&&Math.abs(d.second[x-1])+Math.abs(d.second[x])>1e-3
      &&Math.max(Math.abs(d.first[x]),Math.abs(d.first[x-1]))>2) zeroCrossings.push(x-.5);
  }
  return {smoothed,...g,log,row,profile:{gray,...d,peaks,zeroCrossings},stages:[
    {name:'高斯平滑',data:smoothed,kind:'gray'}, {name:'Sobel 幅值 / 核归一化 1/8',data:gradient(smoothed,w,h,'sobel').magnitude,kind:'magnitude'},
    {name:'Scharr 幅值 / 核归一化 1/32',data:gradient(smoothed,w,h,'scharr').magnitude,kind:'magnitude'},
    {name:'LoG / 平滑后离散拉普拉斯',data:log,kind:'signed'}]};
}
