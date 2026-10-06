import {seededRandom} from './numerics.mjs';
import {solve} from './geometry.mjs';
function erf(x){
  const sign=x<0?-1:1,t=1/(1+.3275911*Math.abs(x));
  return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));
}
export function profileValue(x,type,center,sigma,amplitude,background){
  const z=(x-center)/sigma;
  return background+amplitude*(type==='edge'?.5*(1+erf(z/Math.SQRT2)):Math.exp(-.5*z*z));
}
export function simulateProfile({type='spot',center=31.4,sigma=2,amplitude=160,background=30,noise=0,seed=42,count=64}={}){
  if(sigma<=0||sigma>30||count<8||count>2048)throw new Error('局部模型尺寸或宽度超出范围');
  const random=seededRandom(seed),values=new Float64Array(count);
  for(let i=0;i<count;i++){
    const n=Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
    values[i]=profileValue(i,type,center,sigma,amplitude,background)+noise*n;
  }
  return {values,truth:center,type,sigma,amplitude,background};
}
export function fitProfile(values,type='spot'){
  if(values.length<8||!['spot','edge'].includes(type))throw new Error('局部模型输入无效');
  let minimum=Infinity,maximum=-Infinity,peak=0;
  for(let i=0;i<values.length;i++){minimum=Math.min(minimum,values[i]);if(values[i]>maximum){maximum=values[i];peak=i;}}
  if(maximum-minimum<1e-5)throw new Error('平坦剖面没有足够对比度');
  let center=peak;
  if(type==='edge') {let closest=Infinity;const half=(minimum+maximum)/2;for(let i=0;i<values.length;i++)if(Math.abs(values[i]-half)<closest){closest=Math.abs(values[i]-half);center=i;}}
  const side=Math.max(2,Math.floor(values.length*.1));
  const mean=(start,end)=>values.slice(start,end).reduce((a,b)=>a+b,0)/(end-start);
  const bg=type==='edge'?mean(0,side):.5*(mean(0,side)+mean(values.length-side,values.length));
  let p=[center,2,Math.max(1,maximum-bg),bg],lambda=1e-3,iterations=0;
  const error=q=>values.reduce((sum,v,i)=>sum+(v-profileValue(i,type,...q))**2,0);
  let current=error(p);
  for(iterations=0;iterations<50;iterations++){
    const A=Array.from({length:4},()=>Array(4).fill(0)),b=Array(4).fill(0);
    for(let i=0;i<values.length;i++){
      const predicted=profileValue(i,type,...p),r=values[i]-predicted,J=[];
      for(let j=0;j<4;j++){const delta=1e-4*Math.max(1,Math.abs(p[j])),shift=[...p];shift[j]+=delta;J[j]=(profileValue(i,type,...shift)-predicted)/delta;}
      for(let j=0;j<4;j++){b[j]+=J[j]*r;for(let k=0;k<4;k++)A[j][k]+=J[j]*J[k];}
    }
    for(let j=0;j<4;j++)A[j][j]+=lambda*Math.max(1,A[j][j]);
    let change;try{change=solve(A,b);}catch{throw new Error('局部拟合病态：参数无法稳定估计');}
    const next=p.map((v,j)=>v+change[j]);
    next[0]=Math.max(0,Math.min(values.length-1,next[0]));next[1]=Math.max(.25,Math.min(values.length/2,next[1]));next[2]=Math.max(.001,next[2]);
    const nextError=error(next);
    if(nextError<current){const improvement=current-nextError;p=next;current=nextError;lambda=Math.max(1e-8,lambda/3);if(improvement<1e-10)break;}
    else{lambda*=8;if(lambda>1e9)break;}
  }
  if(p[0]<1||p[0]>values.length-2||p[1]>=values.length/2-.01)throw new Error('目标靠近采样边界或过宽，定位不可靠');
  return {center:p[0],sigma:p[1],amplitude:p[2],background:p[3],rmse:Math.sqrt(current/values.length),iterations,
    fitted:Float64Array.from({length:values.length},(_,i)=>profileValue(i,type,...p))};
}
export function repeatLocalization(options){
  const trials=options.trials||32,errors=[],estimates=[];
  for(let i=0;i<trials;i++){
    const data=simulateProfile({...options,seed:(options.seed||42)+i*7919});
    try{const fit=fitProfile(data.values,options.type);errors.push(fit.center-data.truth);estimates.push(fit.center);}catch{}
  }
  if(!errors.length)return {success:0,failed:trials,bias:null,std:null,errors,estimates};
  const bias=errors.reduce((a,b)=>a+b,0)/errors.length;
  const variance=errors.reduce((s,e)=>s+(e-bias)**2,0)/Math.max(1,errors.length-1);
  return {success:errors.length,failed:trials-errors.length,bias,std:Math.sqrt(variance),errors,estimates};
}
export function selectHoughCell(result,w,h,[x,y]){
  const cols=result.thetaBins||result.cols,rows=result.rhoBins||result.rows;
  const col=Math.max(0,Math.min(cols-1,Math.floor(x/w*cols)));
  const row=Math.max(0,Math.min(rows-1,Math.floor(y/h*rows)));
  return result.thetaBins
    ?{selectedPeak:{theta:col*Math.PI/cols,rho:row*result.rhoStep-result.extent}}
    :{selectedCenter:[col*result.step,row*result.step]};
}

export function houghLines(points,w,h,{thetaBins=180,rhoStep=2}={}){
  if(thetaBins<18||thetaBins>360||rhoStep<1||points.length>5000)throw new Error('霍夫工作集超出预算');
  const extent=Math.ceil(Math.hypot(w,h)),rhoBins=Math.ceil(2*extent/rhoStep)+1,accumulator=new Uint32Array(thetaBins*rhoBins);
  const cos=Float64Array.from({length:thetaBins},(_,i)=>Math.cos(i*Math.PI/thetaBins)),sin=Float64Array.from({length:thetaBins},(_,i)=>Math.sin(i*Math.PI/thetaBins));
  for(const [x,y]of points)for(let t=0;t<thetaBins;t++){const r=Math.round((x*cos[t]+y*sin[t]+extent)/rhoStep);if(r>=0&&r<rhoBins)accumulator[r*thetaBins+t]++;}
  const candidates=[];
  for(let r=0;r<rhoBins;r++)for(let t=0;t<thetaBins;t++){const votes=accumulator[r*thetaBins+t];if(votes>0)candidates.push({theta:t*Math.PI/thetaBins,rho:r*rhoStep-extent,votes,t,r});}
  candidates.sort((a,b)=>b.votes-a.votes);const peaks=[];
  for(const p of candidates){if(peaks.every(q=>Math.abs(p.r-q.r)>4||Math.abs(p.t-q.t)>4))peaks.push(p);if(peaks.length===8)break;}
  return {accumulator,thetaBins,rhoBins,rhoStep,extent,peaks,candidateVotes:points.length*thetaBins};
}
export function houghCircles(points,angles,w,h,{radius=50,step=4,gradientConstraint=true}={}){
  if(radius<2||radius>Math.max(w,h)||step<1||points.length>5000)throw new Error('圆霍夫参数超出预算');
  const cols=Math.ceil(w/step),rows=Math.ceil(h/step),accumulator=new Uint32Array(cols*rows);let candidateVotes=0;
  const vote=(cx,cy)=>{candidateVotes++;const x=Math.round(cx/step),y=Math.round(cy/step);if(x>=0&&x<cols&&y>=0&&y<rows)accumulator[y*cols+x]++;};
  points.forEach(([x,y],i)=>{
    if(gradientConstraint){const a=angles[i];vote(x-radius*Math.cos(a),y-radius*Math.sin(a));vote(x+radius*Math.cos(a),y+radius*Math.sin(a));}
    else for(let k=0;k<72;k++){const a=k*Math.PI/36;vote(x-radius*Math.cos(a),y-radius*Math.sin(a));}
  });
  let best=0;for(let i=1;i<accumulator.length;i++)if(accumulator[i]>accumulator[best])best=i;
  return {accumulator,cols,rows,center:[best%cols*step,Math.floor(best/cols)*step],radius,votes:accumulator[best],candidateVotes,step};
}
