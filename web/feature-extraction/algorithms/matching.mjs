import {estimateTransform,project} from './geometry.mjs';
import {seededRandom} from './numerics.mjs';
export function matchDescriptors(a,b,{ratio=.75}={}){
  if(!Number.isFinite(ratio)||ratio<=0||ratio>1||a.length>500||b.length>500)throw new RangeError('匹配参数或特征数量超出预算');
  const nearest=[],reverse=Array(b.length).fill(-1),reverseDistance=Array(b.length).fill(Infinity);
  for(let i=0;i<a.length;i++){
    let first=Infinity,second=Infinity,index=-1;
    for(let j=0;j<b.length;j++){
      if(a[i].length!==b[j].length)throw new Error('描述子维数不一致');
      let distance=0;for(let k=0;k<a[i].length;k++)distance+=(a[i][k]-b[j][k])**2;
      if(distance<reverseDistance[j]){reverseDistance[j]=distance;reverse[j]=i;}
      if(distance<first){second=first;first=distance;index=j;}else if(distance<second)second=distance;
    }
    if(index>=0)nearest.push({query:i,train:index,distance:Math.sqrt(first),secondDistance:Math.sqrt(second),ratio:second>0&&Number.isFinite(second)?Math.sqrt(first/second):1});
  }
  const filtered=nearest.filter(m=>m.ratio<ratio&&Number.isFinite(m.secondDistance));
  return {nearest,ratio:filtered,mutual:filtered.filter(m=>reverse[m.train]===m.query)};
}
export function verifyMatches(a,b,matches,{threshold=3,iterations=100,seed=42}={}){
  if(matches.length<4)throw new Error('几何验证匹配不足：至少需要4对非共线对应点');
  if(threshold<=0||iterations<1||iterations>500)throw new RangeError('RANSAC 参数无效');
  const random=seededRandom(seed),from=matches.map(m=>a[m.query]),to=matches.map(m=>b[m.train]);
  const errors=H=>from.map((p,i)=>{try{const q=project(H,p);return Math.hypot(q[0]-to[i][0],q[1]-to[i][1]);}catch{return Infinity;}});
  let best=null,trace=[];
  for(let iteration=0;iteration<iterations;iteration++){
    const sample=[];while(sample.length<4){const i=Math.floor(random()*matches.length);if(!sample.includes(i))sample.push(i);}
    let H;try{H=estimateTransform(sample.map(i=>from[i]),sample.map(i=>to[i]),'projective');}catch{continue;}
    const residuals=errors(H),inliers=residuals.flatMap((v,i)=>v<=threshold?[i]:[]),sum=inliers.reduce((s,i)=>s+residuals[i],0);
    if(!best||inliers.length>best.inliers.length||(inliers.length===best.inliers.length&&sum<best.sum)){best={H,inliers,sum};trace.push({iteration:iteration+1,sample,inliers:[...inliers]});}
  }
  if(!best||best.inliers.length<4)throw new Error('几何验证失败：对应点退化或缺少一致模型');
  try{best.H=estimateTransform(best.inliers.map(i=>from[i]),best.inliers.map(i=>to[i]),'projective');}catch{}
  const residuals=errors(best.H),inliers=residuals.flatMap((v,i)=>v<=threshold?[i]:[]);
  if(inliers.length<4)throw new Error('几何验证失败：重拟合后内点不足');
  const ordered=inliers.map(i=>residuals[i]).sort((a,b)=>a-b),n=ordered.length;
  return {H:best.H,inliers,residuals,medianError:n%2?ordered[n>>1]:(ordered[n/2-1]+ordered[n/2])/2,trace};
}
