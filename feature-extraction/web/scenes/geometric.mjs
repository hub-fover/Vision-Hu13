import {seededRandom} from '../algorithms/numerics.mjs';
import {fitModel,residual,ransac,estimateTransform,project,inverse} from '../algorithms/geometry.mjs';
import {simulateProfile,fitProfile,repeatLocalization,profileValue,houghLines,houghCircles} from '../algorithms/localization.mjs';
import {canny,blur,gradient} from '../algorithms/edges.mjs';
import {evolveSnake} from '../algorithms/snake.mjs';
import {structureTensor,detectCorners,windowSSD,transformImage} from '../algorithms/corners.mjs';
import {siftScene,runSiftScene} from './sift.mjs';
import {matchingScene,runMatchingScene} from './matching.mjs';

export const geometricScenes={
  '08':siftScene,
  '09':matchingScene,
  '03':{title:'什么位置适合当特征点',question:'为什么边缘难以约束沿边缘方向的运动？',presets:[['corner','角点窗口'],['edge','直线边缘'],['flat','平坦区域'],['photo','真实山景']],defaultPreset:'corner',controls:[
    {id:'tensor-sigma',label:'张量积分尺度 σ',min:1,max:6,step:.5,value:2,note:'先以 σ=0.8 平滑，再计算 Sobel 梯度与高斯加权乘积。'},
    {id:'corner-threshold',label:'相对最大响应阈值',min:.01,max:.8,step:.01,value:.05},
    {id:'corner-method',label:'角点响应',choices:[['shi','Shi–Tomasi 最小特征值'],['harris','Harris 响应']],value:'shi'},
    {id:'corner-angle',label:'图像旋转 / 度',min:-90,max:90,step:5,value:0},
    {id:'corner-scale',label:'图像缩放',min:.4,max:2,step:.1,value:1,note:'保持张量窗口尺度不变，比较重新检测的点；绿色为原角点的已知变换位置。'}]},
  '04':{title:'噪声点如何变成几何模型',question:'少量离群点为什么能把拟合结果拖偏？',presets:[['line','直线与离群点'],['circle','圆与离群点'],['ellipse','椭圆与离群点']],defaultPreset:'line',controls:[
    {id:'fit-noise',label:'点噪声标准差',min:0,max:15,step:.5,value:2,note:'像素；固定随机种子 42。'},
    {id:'outliers',label:'离群点比例',min:0,max:.5,step:.05,value:.2},
    {id:'threshold',label:'内点几何距离阈值',min:.5,max:15,step:.5,value:4},
    {id:'iterations',label:'RANSAC 迭代数',min:10,max:150,step:10,value:80},
    {id:'solver',label:'最终结果',choices:[['ransac','RANSAC'],['ls','最小二乘']],value:'ransac'}]},
  '05':{title:'突破一个像素的定位',question:'亚像素精度来自哪里？为什么目标越宽不一定越准确？',presets:[['spot','高斯光斑中心'],['edge','模糊阶跃拐点'],['flat','失效：无信号剖面（振幅/噪声固定为0）']],defaultPreset:'spot',controls:[
    {id:'phase',label:'目标位置 / 采样相位',min:25,max:38,step:.05,value:31.4,note:'连续位置，整数坐标为采样点。'},
    {id:'width',label:'目标宽度 σ',min:.4,max:12,step:.2,value:2},
    {id:'sample-noise',label:'采样噪声标准差',min:0,max:40,step:1,value:5},
    {id:'background',label:'背景偏置',min:0,max:90,step:5,value:30},
    {id:'trials',label:'重复试验次数',min:8,max:64,step:8,value:32}]},
  '06':{title:'让轮廓自己贴近目标',question:'为什么初始轮廓换个位置，结果就可能不同？',presets:[['clear','清晰圆形边界'],['weak','弱边界'],['concave','凹陷目标']],defaultPreset:'clear',controls:[
    {id:'snake-alpha',label:'张力 α',min:0,max:.2,step:.01,value:.02},
    {id:'snake-beta',label:'曲率约束 β',min:0,max:1,step:.05,value:.2},
    {id:'snake-force',label:'图像能量权重 γ',min:0,max:1000,step:50,value:400},
    {id:'snake-step',label:'离散移动步长 / px',min:.25,max:3,step:.25,value:1},
    {id:'snake-iterations',label:'迭代上限',min:10,max:150,step:10,value:80},
    {id:'snake-offset',label:'初始轮廓水平偏移 / px',min:-80,max:80,step:5,value:0,note:'拖动输入图中的蓝色控制点可更改初始轮廓。'}]},
  '07':{title:'霍夫空间里的投票',question:'轮廓有缺口时，为什么仍可能检测出完整形状？',presets:[['line','直线霍夫'],['circle','圆与梯度约束']],defaultPreset:'line',controls:[
    {id:'gap',label:'轮廓缺口比例',min:0,max:.8,step:.05,value:.2},
    {id:'point-noise',label:'随机噪声点数量',min:0,max:200,step:10,value:30},
    {id:'resolution',label:'ρ / 圆心累加器步长',min:1,max:8,step:1,value:2},
    {id:'theta-bins',label:'直线角度格数',min:36,max:360,step:18,value:180},
    {id:'radius',label:'待检圆半径',min:30,max:110,step:2,value:70},
    {id:'gradient-constraint',label:'圆心候选',choices:[['yes','沿梯度双向投票'],['no','全方向投票']],value:'yes'}]},
  '10':{title:'四个点如何决定图像变换',question:'为什么有四对点，也不一定能可靠估计单应性？',presets:[['valid','有效对应点'],['collinear','近共线退化配置']],defaultPreset:'valid',controls:[
    {id:'transform',label:'变换模型',choices:[['projective','投影 / 单应性'],['affine','仿射'],['rigid','刚体']],value:'projective'}]}
};

export function orderedSceneEntries(scenes){
  return Object.entries(scenes).sort(([a],[b])=>Number(a)-Number(b));
}

export function makePoints(type,w,h,noise,outliers,seed=42){
  const random=seededRandom(seed),points=[],angles=[],truth=type==='line'?{type,a:-.4/Math.hypot(1,.4),b:1/Math.hypot(1,.4),c:-h*.27/Math.hypot(1,.4)}:
    type==='circle'?{type,cx:w*.5,cy:h*.5,radius:70}:{type:'ellipse',cx:w*.5,cy:h*.5,a:135,b:65,angle:.35};
  for(let i=0;i<60;i++){
    const t=i/60*Math.PI*2;
    let x,y;
    if(type==='line'){x=35+i/59*(w-70);y=.4*x+h*.27;}
    else if(type==='circle'){x=truth.cx+truth.radius*Math.cos(t);y=truth.cy+truth.radius*Math.sin(t);}
    else{const u=truth.a*Math.cos(t),v=truth.b*Math.sin(t);x=truth.cx+u*Math.cos(truth.angle)-v*Math.sin(truth.angle);y=truth.cy+u*Math.sin(truth.angle)+v*Math.cos(truth.angle);}
    const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-10,random())))*Math.cos(2*Math.PI*random());
    points.push([x+noise*gaussian(),y+noise*gaussian()]);angles.push(t);
  }
  const count=Math.round(60*outliers/Math.max(.01,1-outliers));
  for(let i=0;i<count;i++){points.push([15+random()*(w-30),15+random()*(h-30)]);angles.push(random()*Math.PI*2);}
  return {points,angles,truth};
}
function blank(w,h,value=247){return new Float32Array(w*h).fill(value);}
function modelOverlay(model,w,h,color='#1c79b8'){
  if(model.type==='line'){
    const points=[];if(Math.abs(model.b)>.01)for(let x=0;x<=w;x+=5)points.push([x,(-model.c-model.a*x)/model.b]);
    else for(let y=0;y<=h;y+=5)points.push([(-model.c-model.b*y)/model.a,y]);
    return {type:'path',points,color};
  }
  const points=[];for(let k=0;k<=150;k++){const t=k*Math.PI/75,u=(model.radius||model.a)*Math.cos(t),v=(model.radius||model.b)*Math.sin(t),a=model.angle||0;points.push([model.cx+u*Math.cos(a)-v*Math.sin(a),model.cy+u*Math.sin(a)+v*Math.cos(a)]);}
  return {type:'path',points,color};
}
function pointOverlay(points,inliers){return {type:'points',points,colors:points.map((p,i)=>inliers?(inliers.includes(i)?'#1c79b8':'#cf613e'):'#173f79')};}
function linePlot(values,w,h,color='#173f79',low=0,high=255){return {type:'path',color,points:[...values].map((v,i)=>[20+i/(values.length-1)*(w-40),h-30-(v-low)/(high-low)*(h-60)])};}
function heatmap(data,cols,rows,w,h){
  let max=1;for(const v of data)max=Math.max(max,v);
  const image=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)image[y*w+x]=255*data[Math.min(rows-1,Math.floor(y/h*rows))*cols+Math.min(cols-1,Math.floor(x/w*cols))]/max;
  return image;
}
export function runGeometric(job){
  if(job.scene==='08')return runSiftScene(job);
  if(job.scene==='09')return runMatchingScene(job);
  const {scene,w,h,options:o,seed=42}=job,base=blank(w,h),stages=[];
  let input=base,inputOverlays=[],resultStage,observation,metrics,data={};
  const stage=(name,overlays=[],field=base)=>({name,data:field,kind:'gray',overlays});
  let uploadedPoints=null,uploadedAngles=null;
  if(scene==='06'){
    const radius=Math.min(w,h)*.27,cx=w/2,cy=h/2;
    input=job.input?Float32Array.from(job.input):Float32Array.from({length:w*h},(_,i)=>{
      const x=i%w-cx,y=Math.floor(i/w)-cy,theta=Math.atan2(y,x);
      const boundary=o.preset==='concave'?radius*(1-.4*Math.exp(-((theta/.5)**2))):radius;
      const inside=Math.hypot(x,y)<boundary;
      return o.preset==='weak'?(inside?110:85):(inside?220:35);
    });
    const g=gradient(blur(input,w,h,1.5),w,h),potential=blur(Float32Array.from(g.magnitude,v=>-v*v/10000),w,h,5);
    const contour=job.contour||Array.from({length:40},(_,i)=>{const a=i*Math.PI/20;return[cx+(o['snake-offset']||0)+(radius+6)*Math.cos(a),cy+(radius+6)*Math.sin(a)];});
    const snake=evolveSnake(contour,potential,w,h,{alpha:o['snake-alpha'],beta:o['snake-beta'],gamma:o['snake-force'],step:o['snake-step'],iterations:o['snake-iterations']});
    const overlay=p=>[{type:'path',color:'#1c79b8',points:[...p,p[0]]},{type:'points',color:'#1c79b8',points:p,radius:3}];
    inputOverlays=overlay(contour);
    stages.push(stage('图像势能 · 亮区更吸引轮廓',[],Float32Array.from(potential,v=>Math.min(255,-v*2000))));
    for(const item of snake.trace)stages.push(stage(`迭代 ${item.iteration} · E=${item.energy.toFixed(2)}`,overlay(item.points),input));
    resultStage=stage('最终轮廓',overlay(snake.points),input);
    observation=`${snake.reason}；真实迭代 ${snake.trace.length-1} 次。`;
    metrics=`能量 ${snake.trace[0].energy.toFixed(2)} → ${snake.trace.at(-1).energy.toFixed(2)} · 局部最小不保证正确边界，弱边界/凹陷可能失败`;
    data={contour,snake,potential};
  }
  if(scene==='03'){
    input=job.input?Float32Array.from(job.input):Float32Array.from({length:w*h},(_,i)=>{
      const x=i%w,y=Math.floor(i/w);return o.preset==='flat'?80:o.preset==='edge'?(x>=w/2?220:35):(x>=w/2&&y>=h/2?220:35);
    });
    const tensor=structureTensor(input,w,h,{sigma:o['tensor-sigma']});
    const detection=detectCorners(tensor,w,h,{method:o['corner-method'],threshold:o['corner-threshold'],radius:5});
    const center=(job.center||[w/2,h/2]).map((v,j)=>Math.round(Math.max(12,Math.min((j?h:w)-13,v))));
    const surface=windowSSD(input,w,h,center,6,5),[x,y]=center,index=y*w+x;
    inputOverlays=[{type:'path',color:'#cf613e',points:[[x-6,y-6],[x+6,y-6],[x+6,y+6],[x-6,y+6],[x-6,y-6]]}];
    stages.push(stage('真实窗口移动 SSD · 横轴 Δx / 纵轴 Δy',[],heatmap(surface.values,surface.size,surface.size,w,h)),
      stage('响应热图 · 本次正最大值归一化',[],heatmap(Float32Array.from(detection.response,v=>Math.max(0,v)),w,h,w,h)),
      stage('阈值候选 · 尚未非极大值抑制',[{type:'points',points:detection.candidates,color:'#cf613e'}],input));
    stages.push(stage('原图非极大值抑制后的角点',[{type:'points',points:detection.points,color:'#1c79b8',radius:4}],input));
    const transformed=transformImage(input,w,h,{angle:o['corner-angle']||0,scale:o['corner-scale']||1});
    const margin=Math.ceil(3*o['tensor-sigma'])+6;
    const valid=([x,y])=>{x=Math.round(x);y=Math.round(y);if(x<margin||y<margin||x>=w-margin||y>=h-margin)return false;for(const [dx,dy]of [[-margin,-margin],[margin,-margin],[-margin,margin],[margin,margin]])if(!transformed.mask[(y+dy)*w+x+dx])return false;return true;};
    const changed=detectCorners(structureTensor(transformed.pixels,w,h,{sigma:o['tensor-sigma']}),w,h,{method:o['corner-method'],threshold:o['corner-threshold'],radius:5});
    const expected=detection.points.map(transformed.map).filter(valid),detected=changed.points.filter(valid),distances=[];
    const used=new Set();for(const p of expected){let distance=Infinity,index=-1;detected.forEach((q,i)=>{const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!used.has(i)&&d<distance){distance=d;index=i;}});if(distance<=5){used.add(index);distances.push(distance);}}
    const comparison={expected,detected,matched:distances.length,meanDistance:distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:null};
    resultStage=stage('变换图重新检测 · 绿为已知映射位置',[{type:'points',points:detected,color:'#1c79b8',radius:4},{type:'points',points:expected,color:'#319877',radius:2}],transformed.pixels);
    const small=tensor.small[index],large=tensor.large[index];
    observation=`窗口特征值 λ₁=${large.toFixed(2)}，λ₂=${small.toFixed(2)}；${detection.candidates.length} 个候选保留 ${detection.points.length} 个角点。`;
    metrics=`Harris R=${tensor.harris[index].toFixed(2)} · 有效原角点 ${expected.length}，5px内对应 ${comparison.matched}，平均距离 ${comparison.meanDistance===null?'无对应':comparison.meanDistance.toFixed(2)+'px'} · 边界填充区不参与比较`;
    data={tensor,detection,center,surface,comparison};
  }
  if(job.input&&(scene==='04'||scene==='07')){
    input=Float32Array.from(job.input);const edges=canny(input,w,h,{sigma:1.2,low:10,high:25});
    const indices=[];for(let i=0;i<edges.edges.length;i++)if(edges.edges[i])indices.push(i);
    if(indices.length<5)throw new Error('上传图像没有足够边缘点；请选择有清晰几何轮廓的图像');
    const stride=Math.max(1,Math.ceil(indices.length/150));uploadedPoints=[];uploadedAngles=[];
    for(let k=0;k<indices.length;k+=stride){const i=indices[k];uploadedPoints.push([i%w,Math.floor(i/w)]);uploadedAngles.push(edges.direction[i]);}
  }
  if(scene==='04'){
    const sample=makePoints(o.preset,w,h,o['fit-noise'],o.outliers,seed),points=job.points||uploadedPoints||sample.points;
    if(points.length>200)throw new Error('教学点集最多 200 个点');
    const ls=fitModel(points,o.preset),robust=ransac(points,o.preset,{seed,threshold:o.threshold,iterations:o.iterations});
    inputOverlays=[pointOverlay(points)];
    stages.push(stage('最小二乘拟合',[pointOverlay(points),modelOverlay(ls,w,h,'#cf613e')]));
    for(const item of robust.trace)stages.push(stage(`RANSAC 第 ${item.iteration} 次 · 最佳 ${item.bestCount} 内点`,[pointOverlay(points,item.inliers),...(item.model?[modelOverlay(item.model,w,h)]:[]),{type:'points',points:item.sample.map(i=>points[i]),colors:item.sample.map(()=>'#e2a22e'),radius:6}]));
    const selected=o.solver==='ls'?ls:robust.model;
    resultStage=stage('最终模型',[pointOverlay(points,robust.inliers),modelOverlay(selected,w,h)]);
    const rms=model=>Math.sqrt(points.reduce((s,p)=>s+residual(p,model)**2,0)/points.length);
    observation=`${robust.inliers.length}/${points.length} 个几何内点；两种模型均使用到曲线的最短距离比较。`;
    metrics=`全部点几何 RMS：LS ${rms(ls).toFixed(2)} px / RANSAC ${rms(robust.model).toFixed(2)} px`;
    if(!job.points&&!uploadedPoints){const truthPoints=makePoints(o.preset,w,h,0,0,seed).points;const truthRMS=Math.sqrt(truthPoints.reduce((s,p)=>s+residual(p,selected)**2,0)/truthPoints.length);metrics+=` · 对真值曲线 RMS ${truthRMS.toFixed(2)} px`;}
    data={points,truth:job.points||uploadedPoints?null:sample.truth,ls,robust};
  } else if(scene==='05'){
    let simulated=simulateProfile({type:o.preset==='flat'?'spot':o.preset,center:o.phase,sigma:o.width,amplitude:o.preset==='flat'?0:160,noise:o.preset==='flat'?0:o['sample-noise'],background:o.background,seed});
    if(job.input){const row=Math.floor(h/2);simulated={values:Float64Array.from({length:64},(_,i)=>job.input[row*w+Math.round(i/63*(w-1))]),truth:null};}
    const fit=fitProfile(simulated.values,o.preset==='flat'?'spot':o.preset);
    const continuous=job.input?simulated.values:Float64Array.from({length:512},(_,i)=>profileValue(i/511*63,o.preset,o.phase,o.width,160,o.background));
    inputOverlays=[linePlot(continuous,w,h,'#173f79'),{type:'points',points:[...simulated.values].map((v,i)=>[20+i/63*(w-40),h-30-v/255*(h-60)]),colors:Array(64).fill('#cf613e'),radius:2}];
    stages.push(stage('真实像素采样',inputOverlays),stage('非线性最小二乘拟合',[linePlot(fit.fitted,w,h,'#1c79b8'),...inputOverlays.slice(1)]));
    const repeats=repeatLocalization({type:o.preset,center:o.phase,sigma:o.width,noise:o['sample-noise'],background:o.background,seed,trials:o.trials});
    resultStage=stage('真值 / 拟合位置',[...inputOverlays,linePlot(fit.fitted,w,h,'#1c79b8'),{type:'path',color:'#24a698',points:[[20+o.phase/63*(w-40),25],[20+o.phase/63*(w-40),h-25]]},{type:'path',color:'#cf613e',points:[[20+fit.center/63*(w-40),25],[20+fit.center/63*(w-40),h-25]]}]);
    observation=`${o.preset==='spot'?'光斑中心':'阶跃拐点'}：真值 ${o.phase.toFixed(3)}，估计 ${fit.center.toFixed(3)}，误差 ${(fit.center-o.phase).toFixed(4)} px。`;
    metrics=`${repeats.success}/${o.trials} 次拟合成功 · 偏差 ${repeats.bias?.toFixed(4)??'—'} px · 标准差 ${repeats.std?.toFixed(4)??'—'} px · 残差 RMS ${fit.rmse.toFixed(2)}`;
    data={simulated,fit,repeats};
    if(job.input){inputOverlays=[linePlot(simulated.values,w,h),...inputOverlays.slice(1)];resultStage=stage('上传剖面拟合（无真值）',[linePlot(simulated.values,w,h),linePlot(fit.fitted,w,h,'#cf613e')]);observation=`图像中间行局部拟合：估计位置 ${fit.center.toFixed(3)} / 64 点坐标，无真值，不显示定位误差。`;metrics=`原图位置约 ${(fit.center/63*(w-1)).toFixed(2)} px · 残差 RMS ${fit.rmse.toFixed(2)}；宽度/相位/重复试验参数仅作用于合成示例`;data.repeats=null;}
  } else if(scene==='07'){
    const sample=makePoints(o.preset,w,h,0,0,seed),points=[],angles=[],random=seededRandom(seed);
    sample.points.forEach((p,i)=>{if(i/60>=o.gap){points.push(p);angles.push(sample.angles[i]);}});
    for(let i=0;i<o['point-noise'];i++){points.push([random()*w,random()*h]);angles.push(random()*Math.PI*2);}
    if(job.points){points.splice(0,points.length,...job.points);angles.splice(0,angles.length,...job.points.map(()=>0));}
    else if(uploadedPoints){points.splice(0,points.length,...uploadedPoints);angles.splice(0,angles.length,...uploadedAngles);}
    inputOverlays=[pointOverlay(points)];
    const result=o.preset==='circle'?houghCircles(points,angles,w,h,{radius:o.radius,step:o.resolution,gradientConstraint:!job.points&&o['gradient-constraint']==='yes'}):houghLines(points,w,h,{thetaBins:o['theta-bins'],rhoStep:o.resolution});
    const accumulator=heatmap(result.accumulator,result.thetaBins||result.cols,result.rhoBins||result.rows,w,h);
    const partial=o.preset==='circle'?houghCircles(points.slice(0,10),angles.slice(0,10),w,h,{radius:o.radius,step:o.resolution,gradientConstraint:!job.points&&o['gradient-constraint']==='yes'}):houghLines(points.slice(0,10),w,h,{thetaBins:o['theta-bins'],rhoStep:o.resolution});
    stages.push(stage('前 10 点的真实投票',[],heatmap(partial.accumulator,partial.thetaBins||partial.cols,partial.rhoBins||partial.rows,w,h)));
    stages.push(stage('全部点累加器 / 最大票数归一化',[],accumulator));
    let chosen;
    if(o.preset==='circle')chosen={type:'circle',cx:(job.selectedCenter||result.center)[0],cy:(job.selectedCenter||result.center)[1],radius:o.radius};
    else {const p=job.selectedPeak||result.peaks[0];chosen={type:'line',a:Math.cos(p.theta),b:Math.sin(p.theta),c:-p.rho};}
    resultStage=stage('峰值回投影',[pointOverlay(points),modelOverlay(chosen,w,h)]);
    if(o.preset==='circle'){
      const col=Math.round(chosen.cx/result.step),row=Math.round(chosen.cy/result.step);
      const votes=col>=0&&col<result.cols&&row>=0&&row<result.rows?result.accumulator[row*result.cols+col]:0;
      observation=`${job.selectedCenter?'选中':'最高票'}圆心 (${chosen.cx.toFixed(0)}, ${chosen.cy.toFixed(0)})，${votes} 票。`;
    }else{
      const theta=Math.atan2(chosen.b,chosen.a),rho=-chosen.c;
      const t=Math.round(theta/Math.PI*result.thetaBins),r=Math.round((rho+result.extent)/result.rhoStep);
      const votes=t>=0&&t<result.thetaBins&&r>=0&&r<result.rhoBins?result.accumulator[r*result.thetaBins+t]:0;
      observation=`${job.selectedPeak?'选中格子':'最高峰'}：θ=${(theta*180/Math.PI).toFixed(1)}°，ρ=${rho.toFixed(1)} px；${votes} 票。`;
    }
    metrics=`${points.length} 个边缘点 · 实际投票 ${result.candidateVotes} 次；点击累加器可观察对应几何模型`;
    data={points,angles,hough:result};
  } else if(scene==='10'){
    input=job.input?Float32Array.from(job.input):Float32Array.from({length:w*h},(_,i)=>((Math.floor(i%w/30)+Math.floor(i/w/30))%2?220:75));
    const from=job.from||[[60,45],[w-60,45],[w-60,h-45],[60,h-45]];
    const to=job.to||(o.preset==='collinear'?[[60,130],[170,130.00001],[280,130.00002],[390,130.00003]]:[[85,35],[w-40,65],[w-85,h-25],[40,h-65]]);
    inputOverlays=[{...pointOverlay(from),radius:7},...from.map((p,i)=>({type:'text',text:String(i+1),at:[p[0]+10,p[1]-7]}))];
    const H=estimateTransform(from,to,o.transform),inv=inverse(H),warped=blank(w,h,235);
    // Reject poles crossing the source rectangle, even if control points look valid.
    const denominators=[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>H[6]*x+H[7]*y+H[8]);
    if(Math.min(...denominators)<=0&&Math.max(...denominators)>=0)throw new Error('投影极点穿过图像，变换不稳定');
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let p;try{p=project(inv,[x,y]);}catch{continue;}
      const [u,v]=p,ix=Math.floor(u),iy=Math.floor(v);
      if(ix>=0&&ix<w-1&&iy>=0&&iy<h-1){const a=u-ix,b=v-iy;warped[y*w+x]=(1-b)*((1-a)*input[iy*w+ix]+a*input[iy*w+ix+1])+b*((1-a)*input[(iy+1)*w+ix]+a*input[(iy+1)*w+ix+1]);}
    }
    const grid=[];for(let x=0;x<=w;x+=30)grid.push({type:'path',color:'#4b91c4',points:[[x,0],[x,h]].map(p=>project(H,p))});for(let y=0;y<=h;y+=30)grid.push({type:'path',color:'#4b91c4',points:[[0,y],[w,y]].map(p=>project(H,p))});
    const originalGrid=[];for(let x=0;x<=w;x+=30)originalGrid.push({type:'path',color:'#4b91c4',points:[[x,0],[x,h]]});for(let y=0;y<=h;y+=30)originalGrid.push({type:'path',color:'#4b91c4',points:[[0,y],[w,y]]});
    stages.push(stage('原始规则网格',originalGrid),stage('变换后网格',grid));resultStage=stage('逆映射重采样',[{...pointOverlay(to),radius:7},...to.map((p,i)=>({type:'text',text:String(i+1),at:[p[0]+10,p[1]-7]}))],warped);
    const errors=from.map((p,i)=>{const q=project(H,p);return Math.hypot(q[0]-to[i][0],q[1]-to[i][1]);});
    const [x,y]=from[0],z=H[6]*x+H[7]*y+H[8];
    observation=`${o.transform==='projective'?'投影':o.transform==='affine'?'仿射':'刚体'}变换：平均重投影误差 ${(errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(3)} px。`;
    metrics=`第一点齐次分母 w=${z.toFixed(4)}，归一化得 (${project(H,from[0]).map(v=>v.toFixed(2)).join(', ')})`;
    data={from,to,H,errors};
  }
  return {input,result:{stages,inputOverlays,resultStage,observation,metrics,...data}};
}
