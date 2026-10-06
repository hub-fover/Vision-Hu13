import {blur,gradient} from './edges.mjs';

export function transformImage(input,w,h,{angle=0,scale=1}={}){
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(angle)||input.length!==w*h)throw new RangeError('变换尺度或图像尺寸无效');
  const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=(w-1)/2,cy=(h-1)/2;
  const map=([x,y])=>[cx+scale*(c*(x-cx)-s*(y-cy)),cy+scale*(s*(x-cx)+c*(y-cy))];
  const pixels=new Float32Array(w*h).fill(35),mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let u=cx+(c*(x-cx)+s*(y-cy))/scale,v=cy+(-s*(x-cx)+c*(y-cy))/scale;
    if(u< -1e-8||v< -1e-8||u>w-1+1e-8||v>h-1+1e-8)continue;
    u=Math.max(0,Math.min(w-1,u));v=Math.max(0,Math.min(h-1,v));
    const ix=Math.floor(u),iy=Math.floor(v),nx=Math.min(w-1,ix+1),ny=Math.min(h-1,iy+1),dx=u-ix,dy=v-iy;
    pixels[y*w+x]=(1-dy)*((1-dx)*input[iy*w+ix]+dx*input[iy*w+nx])+dy*((1-dx)*input[ny*w+ix]+dx*input[ny*w+nx]);mask[y*w+x]=1;
  }
  return {pixels,mask,map};
}

export function structureTensor(input,w,h,{sigma=2,k=.04}={}){
  if(input.length!==w*h||!Number.isFinite(sigma)||sigma<=0)throw new RangeError('结构张量尺寸或窗口尺度无效');
  const {gx,gy}=gradient(blur(input,w,h,.8),w,h);
  const xx=new Float32Array(w*h),xy=new Float32Array(w*h),yy=new Float32Array(w*h);
  for(let i=0;i<xx.length;i++){xx[i]=gx[i]**2;xy[i]=gx[i]*gy[i];yy[i]=gy[i]**2;}
  const a=blur(xx,w,h,sigma),b=blur(xy,w,h,sigma),c=blur(yy,w,h,sigma);
  const small=new Float32Array(w*h),large=new Float32Array(w*h),harris=new Float32Array(w*h);
  for(let i=0;i<a.length;i++){
    const trace=a[i]+c[i],delta=Math.hypot(a[i]-c[i],2*b[i]);
    small[i]=Math.max(0,(trace-delta)/2);large[i]=(trace+delta)/2;
    harris[i]=a[i]*c[i]-b[i]**2-k*trace**2;
  }
  return {a,b,c,small,large,harris};
}

export function detectCorners(t,w,h,{method='shi',threshold=.05,radius=5,maxPoints=300}={}){
  if(threshold<=0||threshold>1||radius<1)throw new RangeError('角点阈值或抑制半径无效');
  const response=method==='harris'?t.harris:t.small;
  let max=0;for(const v of response)max=Math.max(max,v);
  const candidates=[];
  for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
    const value=response[y*w+x];if(value>0&&value>=max*threshold)candidates.push([x,y,value]);
  }
  candidates.sort((a,b)=>b[2]-a[2]||a[1]-b[1]||a[0]-b[0]);
  const points=[],blocked=new Uint8Array(w*h);
  for(const p of candidates){
    const [x,y]=p;if(blocked[y*w+x])continue;points.push(p);
    if(points.length>=maxPoints)break;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(dx*dx+dy*dy<=radius*radius)blocked[(y+dy)*w+x+dx]=1;
  }
  return {response,candidates,points,max};
}

export function windowSSD(input,w,h,center,radius=6,shift=5){
  const x=Math.round(center[0]),y=Math.round(center[1]),size=2*shift+1,values=new Float64Array(size*size);
  if(x-radius-shift<0||y-radius-shift<0||x+radius+shift>=w||y+radius+shift>=h)throw new RangeError('移动窗口太靠近边界');
  for(let v=-shift;v<=shift;v++)for(let u=-shift;u<=shift;u++){
    let sum=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)sum+=(input[(y+dy+v)*w+x+dx+u]-input[(y+dy)*w+x+dx])**2;
    values[(v+shift)*size+u+shift]=sum;
  }
  return {values,size,shift,radius};
}
