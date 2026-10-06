import {extractSIFT} from '../algorithms/sift.mjs';
import {matchDescriptors,verifyMatches} from '../algorithms/matching.mjs';
import {estimateTransform,inverse,project} from '../algorithms/geometry.mjs';
import {blur} from '../algorithms/edges.mjs';
import {seededRandom} from '../algorithms/numerics.mjs';
import {fitPairImage} from '../algorithms/pair-input.mjs';
export const matchingScene={title:'相似的点就一定匹配正确吗',question:'匹配数量最多时，几何对应一定最好吗？',presets:[['realpair','真实山景连续拍摄双帧'],['photo','真实山景 + 已知轻度变换'],['repeat','重复纹理'],['large','真实山景 + 大视角变换'],['blur','真实山景 + 模糊'],['texture','已知随机纹理']],defaultPreset:'realpair',controls:[
  {id:'match-ratio',label:'最近邻 / 次近邻比值门限',min:.3,max:1,step:.05,value:.75},
  {id:'match-threshold',label:'RANSAC 重投影门限 / px',min:.5,max:10,step:.5,value:3,note:'内点比例是几何一致性，不等于正确率。人工变换仅用于有真值对照，不是现场双图。'}]};
function synthetic(w,h,repeated){
  const random=seededRandom(42),points=Array.from({length:45},()=>[10+random()*(w-20),10+random()*(h-20),1.5+random()*3,80+random()*140]);
  return Float32Array.from({length:w*h},(_,i)=>{
    const x=i%w,y=Math.floor(i/w);if(repeated)return 25+190*Math.exp(-(((x%28)-14)**2+((y%28)-14)**2)/18);
    let v=20;for(const [cx,cy,sigma,a]of points)v+=a*Math.exp(-((x-cx)**2+(y-cy)**2)/(2*sigma*sigma));return Math.min(255,v);
  });
}
function warp(input,w,h,H){
  const inv=inverse(H),output=new Float32Array(w*h).fill(20);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let q;try{q=project(inv,[x,y]);}catch{continue;}const [u,v]=q,ix=Math.floor(u),iy=Math.floor(v),dx=u-ix,dy=v-iy;
    if(ix<0||iy<0||ix>=w-1||iy>=h-1)continue;
    output[y*w+x]=(1-dy)*((1-dx)*input[iy*w+ix]+dx*input[iy*w+ix+1])+dy*((1-dx)*input[(iy+1)*w+ix]+dx*input[(iy+1)*w+ix+1]);
  }return output;
}
export function runMatchingScene(job){
  const {w,h,options:o}=job,inputA=job.input?Float32Array.from(job.input):synthetic(w,h,o.preset==='repeat');
  const from=[[0,0],[w-1,0],[w-1,h-1],[0,h-1]],to=o.preset==='large'?[[w*.18,h*.1],[w*.83,h*.02],[w*.99,h*.85],[w*.08,h*.95]]:[[w*.04,h*.03],[w*.98,h*.08],[w*.93,h*.98],[w*.01,h*.9]];
  const truth=job.input2?null:estimateTransform(from,to,'projective');
  const secondMapping=job.input2?fitPairImage(job.input2,job.input2Width||w,job.input2Height||h,w,h):null;
  let inputB=secondMapping?secondMapping.pixels:warp(inputA,w,h,truth);
  if(o.preset==='blur')inputB=blur(inputB,w,h,3);
  const featuresA=extractSIFT(inputA,w,h,{maxFeatures:200}),featuresB=extractSIFT(inputB,w,h,{maxFeatures:200});
  const matches=matchDescriptors(featuresA.keypoints.map(p=>p.descriptor),featuresB.keypoints.map(p=>p.descriptor),{ratio:o['match-ratio']});
  const a=featuresA.keypoints.map(p=>[p.imageX,p.imageY]),b=featuresB.keypoints.map(p=>[p.imageX,p.imageY]);
  let geometry=null,failure='';try{geometry=verifyMatches(a,b,matches.mutual,{threshold:o['match-threshold'],seed:42,iterations:120});}catch(error){failure=error.message;}
  const paired=Float32Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w),right=x>=w/2,u=Math.min(w-1,Math.floor((right?x-w/2:x)*2));return(right?inputB:inputA)[y*w+u];});
  const overlays=(items,inlierSet)=>items.slice(0,200).map((m,i)=>({type:'path',color:inlierSet?(inlierSet.has(i)?'#1c79b8':'#cf613e'):'#1c79b8',points:[[a[m.query][0]/2,a[m.query][1]],[w/2+b[m.train][0]/2,b[m.train][1]]]}));
  const stage=(name,items,inlierSet)=>({name,data:paired,kind:'gray',overlays:overlays(items,inlierSet)});
  const stages=[stage('原始最近邻候选',matches.nearest),stage('比值检验后',matches.ratio),stage('双向一致性后',matches.mutual),stage('RANSAC 几何内点 / 外点',matches.mutual, new Set(geometry?.inliers||[]))];
  const correct=truth?matches.mutual.filter(m=>{const p=project(truth,a[m.query]),q=b[m.train];return Math.hypot(p[0]-q[0],p[1]-q[1])<=3;}).length:null;
  const truthRate=truth&&matches.mutual.length?correct/matches.mutual.length:null;
  return {input:paired,result:{stages,resultStage:stages.at(-1),matches,geometry,truth,truthRate,keypointCounts:[a.length,b.length],
    legend:'候选、比值和双向阶段：蓝线为保留匹配；RANSAC阶段：蓝为几何内点，橙为外点；内点比例不等于正确率。',
    observation:`特征 ${a.length}/${b.length}；候选 ${matches.nearest.length} → 比值 ${matches.ratio.length} → 双向 ${matches.mutual.length} → 几何内点 ${geometry?.inliers.length||0}。${failure}`,
    metrics:`${geometry?`内点比例 ${(geometry.inliers.length/matches.mutual.length*100).toFixed(1)}% · 中位重投影 ${geometry.medianError.toFixed(2)}px`:'无法估计稳定单应性'}${!truth?' · 没有对应真值':truthRate===null?' · 有人工变换真值，但无匹配可计算正确率':` · 已知人工变换3px正确率 ${(truthRate*100).toFixed(1)}%`} · 两图横向压缩显示，误差用原分析坐标`}};
}
