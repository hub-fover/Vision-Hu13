import {blur} from './edges.mjs';
import {solve} from './geometry.mjs';

// SIFT scale-space, starting at input resolution (no initial 2× upsampling).
export function scaleSpace(input,w,h,{octaves=4,layers=3,sigma=1.6,inputSigma=.5}={}){
  if(input.length!==w*h||w*h>1280*1280||layers<2||layers>6||octaves<1||octaves>5||sigma<=inputSigma)throw new RangeError('SIFT 尺度空间参数或尺寸超出预算');
  let base=blur(input,w,h,Math.sqrt(sigma*sigma-inputSigma*inputSigma));
  const pyramid=[],k=2**(1/layers);
  for(let octave=0;octave<octaves&&Math.min(w,h)>=16;octave++){
    const gaussian=[base],sigmas=[sigma];
    for(let layer=1;layer<layers+3;layer++){
      const previous=sigma*k**(layer-1),next=sigma*k**layer;
      gaussian.push(blur(gaussian.at(-1),w,h,Math.sqrt(next*next-previous*previous)));sigmas.push(next);
    }
    const dog=gaussian.slice(1).map((image,l)=>Float32Array.from(image,(v,i)=>v-gaussian[l][i]));
    pyramid.push({w,h,octave,gaussian,dog,sigmas,layers});
    const nw=Math.floor(w/2),nh=Math.floor(h/2),source=gaussian[layers];
    base=Float32Array.from({length:nw*nh},(_,i)=>source[Math.floor(i/nw)*2*w+(i%nw)*2]);w=nw;h=nh;
  }
  return pyramid;
}

export function extremaCandidates(pyramid,{contrast=2,border=3,maxCandidates=10000}={}){
  const candidates=[];
  for(const o of pyramid)for(let layer=1;layer<=o.layers;layer++)for(let y=border;y<o.h-border;y++)for(let x=border;x<o.w-border;x++){
    const value=o.dog[layer][y*o.w+x];if(Math.abs(value)<contrast)continue;
    let extreme=true;
    for(let dz=-1;dz<=1&&extreme;dz++)for(let dy=-1;dy<=1&&extreme;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy&&!dz)continue;const other=o.dog[layer+dz][(y+dy)*o.w+x+dx];
      if(value>0?value<=other:value>=other){extreme=false;break;}
    }
    if(extreme)candidates.push({x,y,layer,octave:o.octave,response:value});
  }
  candidates.sort((a,b)=>Math.abs(b.response)-Math.abs(a.response));
  return candidates.slice(0,maxCandidates);
}

export function refineKeypoint(o,candidate,{contrast=2,edgeRatio=10,maxSteps=5}={}){
  let {x,y,layer}=candidate;
  for(let step=0;step<maxSteps;step++){
    if(x<2||y<2||x>=o.w-2||y>=o.h-2||layer<1||layer>o.layers)return null;
    const at=(dx=0,dy=0,dz=0)=>o.dog[layer+dz][(y+dy)*o.w+x+dx],value=at();
    const gradient=[(at(1)-at(-1))/2,(at(0,1)-at(0,-1))/2,(at(0,0,1)-at(0,0,-1))/2];
    const xx=at(1)+at(-1)-2*value,yy=at(0,1)+at(0,-1)-2*value,zz=at(0,0,1)+at(0,0,-1)-2*value;
    const xy=(at(1,1)-at(1,-1)-at(-1,1)+at(-1,-1))/4;
    const xz=(at(1,0,1)-at(1,0,-1)-at(-1,0,1)+at(-1,0,-1))/4;
    const yz=(at(0,1,1)-at(0,1,-1)-at(0,-1,1)+at(0,-1,-1))/4;
    let offset;try{offset=solve([[xx,xy,xz],[xy,yy,yz],[xz,yz,zz]],gradient.map(v=>-v));}catch{return null;}
    if(offset.some(v=>!Number.isFinite(v)||Math.abs(v)>4))return null;
    if(offset.every(v=>Math.abs(v)<.5)){
      const response=value+.5*gradient.reduce((s,v,i)=>s+v*offset[i],0),det=xx*yy-xy*xy;
      if(Math.abs(response)<contrast||det<=0||(xx+yy)**2/det>=(edgeRatio+1)**2/edgeRatio)return null;
      const scaleLayer=layer+offset[2],sigma=1.6*2**(scaleLayer/o.layers);
      return {x:x+offset[0],y:y+offset[1],layer,scaleLayer,octave:o.octave,sigma,response};
    }
    x+=Math.round(offset[0]);y+=Math.round(offset[1]);layer+=Math.round(offset[2]);
  }
  return null;
}

const wrap=a=>(a%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
function localGradient(input,w,x,y){const gx=(input[y*w+x+1]-input[y*w+x-1])/2,gy=(input[(y+1)*w+x]-input[(y-1)*w+x])/2;return [Math.hypot(gx,gy),Math.atan2(gy,gx)];}
export function orientationHistogram(input,w,h,p){
  let histogram=new Float64Array(36);const sigma=1.5*p.sigma,radius=Math.ceil(3*sigma);
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const x=Math.round(p.x)+dx,y=Math.round(p.y)+dy;if(x<1||y<1||x>=w-1||y>=h-1)continue;
    const [magnitude,angle]=localGradient(input,w,x,y),weight=magnitude*Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma)),bin=wrap(angle)*36/(2*Math.PI),i=Math.floor(bin),f=bin-i;
    histogram[i%36]+=weight*(1-f);histogram[(i+1)%36]+=weight*f;
  }
  for(let pass=0;pass<6;pass++)histogram=Float64Array.from(histogram,(v,i)=>(histogram[(i+35)%36]+v+histogram[(i+1)%36])/3);
  const max=Math.max(...histogram),angles=[];
  for(let i=0;i<36;i++){
    const left=histogram[(i+35)%36],value=histogram[i],right=histogram[(i+1)%36];
    if(value>0&&value>=.8*max&&value>left&&value>=right){const offset=.5*(left-right)/(left-2*value+right);angles.push(wrap((i+offset)*2*Math.PI/36));}
  }
  return {histogram,angles};
}

export function siftDescriptor(input,w,h,p){
  const descriptor=new Float64Array(128),cell=3*p.sigma,radius=Math.ceil(Math.SQRT2*cell*2.5),c=Math.cos(p.angle),s=Math.sin(p.angle);
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const x=Math.round(p.x)+dx,y=Math.round(p.y)+dy;if(x<1||y<1||x>=w-1||y>=h-1)continue;
    const u=(c*dx+s*dy)/cell,v=(-s*dx+c*dy)/cell,bx=u+1.5,by=v+1.5;
    if(bx<=-1||by<=-1||bx>=4||by>=4)continue;
    const [magnitude,angle]=localGradient(input,w,x,y),bo=wrap(angle-p.angle)*8/(2*Math.PI),weight=magnitude*Math.exp(-(u*u+v*v)/8);
    const ix=Math.floor(bx),iy=Math.floor(by),io=Math.floor(bo),fx=bx-ix,fy=by-iy,fo=bo-io;
    for(let a=0;a<=1;a++)for(let b=0;b<=1;b++)for(let d=0;d<=1;d++){
      const xx=ix+a,yy=iy+b;if(xx<0||yy<0||xx>=4||yy>=4)continue;
      descriptor[(yy*4+xx)*8+(io+d)%8]+=weight*(a?fx:1-fx)*(b?fy:1-fy)*(d?fo:1-fo);
    }
  }
  let norm=Math.hypot(...descriptor);if(norm<1e-12)return Float32Array.from(descriptor);
  for(let i=0;i<128;i++)descriptor[i]=Math.min(.2,descriptor[i]/norm);
  norm=Math.hypot(...descriptor);return Float32Array.from(descriptor,v=>v/norm);
}

export function extractSIFT(input,w,h,{contrast=2,edgeRatio=10,maxFeatures=300,octaves=4}={}){
  const pyramid=scaleSpace(input,w,h,{octaves}),candidates=extremaCandidates(pyramid,{contrast:contrast*.5}),refined=[],keypoints=[],seen=new Set();
  for(const candidate of candidates){
    const o=pyramid[candidate.octave],p=refineKeypoint(o,candidate,{contrast,edgeRatio});if(!p)continue;
    const id=`${p.octave}:${p.x.toFixed(2)}:${p.y.toFixed(2)}:${p.scaleLayer.toFixed(2)}`;if(seen.has(id))continue;seen.add(id);refined.push(p);
    const image=o.gaussian[p.layer],orientation=orientationHistogram(image,o.w,o.h,p);
    for(const angle of orientation.angles){
      const point={...p,angle,imageX:p.x*2**p.octave,imageY:p.y*2**p.octave,imageSigma:p.sigma*2**p.octave,histogram:orientation.histogram};
      point.descriptor=siftDescriptor(image,o.w,o.h,point);
      if(Math.hypot(...point.descriptor)>0)keypoints.push(point);
    }
    if(keypoints.length>=maxFeatures)break;
  }
  return {pyramid,candidates,refined,keypoints:keypoints.slice(0,maxFeatures)};
}
