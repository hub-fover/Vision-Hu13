import {extractSIFT} from '../algorithms/sift.mjs';
import {transformImage} from '../algorithms/corners.mjs';
import {blur} from '../algorithms/edges.mjs';
export const siftScene={title:'SIFT 怎样应对尺度和旋转',question:'尺度和方向归一化改变了什么？',presets:[['photo','真实山景'],['blobs','已知高斯光斑'],['flat','无纹理失效案例']],defaultPreset:'photo',controls:[
  {id:'sift-angle',label:'旋转 / 度',min:-90,max:90,step:5,value:0},
  {id:'sift-scale',label:'缩放',min:.5,max:2,step:.1,value:1},
  {id:'sift-brightness',label:'亮度增益',min:.3,max:1.8,step:.1,value:1},
  {id:'sift-blur',label:'额外模糊 σ',min:0,max:5,step:.5,value:0},
  {id:'sift-contrast',label:'DoG 对比度门限',min:.5,max:12,step:.5,value:2,note:'灰度强度单位，不直接等同OpenCV参数。点击右图关键点查看方向与描述子。'}]};
const path=(points,color='#1c79b8')=>({type:'path',points,color});
function keypointOverlays(points,selected){return points.flatMap((p,i)=>{
  const color=i===selected?'#cf613e':'#1c79b8',r=p.imageSigma*2,circle=Array.from({length:25},(_,j)=>[p.imageX+r*Math.cos(j*Math.PI/12),p.imageY+r*Math.sin(j*Math.PI/12)]);
  return [path(circle,color),path([[p.imageX,p.imageY],[p.imageX+r*Math.cos(p.angle),p.imageY+r*Math.sin(p.angle)]],color)];
});}
export function runSiftScene(job){
  const {w,h,options:o}=job;
  const original=job.input?Float32Array.from(job.input):Float32Array.from({length:w*h},(_,i)=>{
    if(o.preset==='flat')return 80;const x=i%w,y=Math.floor(i/w);
    return 20+180*Math.exp(-((x-w*.3)**2+(y-h*.4)**2)/18)+150*Math.exp(-((x-w*.65)**2+(y-h*.65)**2)/50);
  });
  const transformed=transformImage(original,w,h,{angle:o['sift-angle'],scale:o['sift-scale']});
  const input=blur(Float32Array.from(transformed.pixels,v=>Math.max(0,Math.min(255,v*o['sift-brightness']))),w,h,o['sift-blur']);
  const sift=extractSIFT(input,w,h,{contrast:o['sift-contrast'],maxFeatures:200});
  const index=Math.max(0,Math.min(sift.keypoints.length-1,job.selectedKeypoint||0)),selected=sift.keypoints[index];
  const stages=[],stage=(name,data=input,overlays=[])=>({name,data,kind:'gray',overlays});
  for(const octave of sift.pyramid){
    for(let l=0;l<octave.gaussian.length;l++)stages.push({...stage(`Gaussian octave ${octave.octave} · σ=${(octave.sigmas[l]*2**octave.octave).toFixed(2)}px`,octave.gaussian[l]),fieldWidth:octave.w,fieldHeight:octave.h});
    for(let l=0;l<octave.dog.length;l++)stages.push({...stage(`DoG octave ${octave.octave} · 层 ${l} · 128为零`,octave.dog[l]),fieldWidth:octave.w,fieldHeight:octave.h,kind:'dog'});
  }
  stages.push(stage('26邻域极值候选',input,[{type:'points',points:sift.candidates.map(p=>[p.x*2**p.octave,p.y*2**p.octave]),color:'#cf613e'}]));
  stages.push(stage('细化、低对比与边缘剔除',input,keypointOverlays(sift.keypoints,index)));
  if(selected){
    const white=new Float32Array(w*h).fill(247),max=Math.max(...selected.histogram,1e-10),bars=[];
    for(let i=0;i<36;i++){const x=20+(i+.5)/36*(w-40);bars.push(path([[x,h-30],[x,h-30-selected.histogram[i]/max*(h-60)]]));}
    bars.push({type:'text',at:[20,20],text:'36方向统计 · 横轴0–360° · 纵轴归一化显示'});
    stages.push(stage('所选关键点 · 主方向直方图',white,bars));
    const descriptor=[],maxD=Math.max(...selected.descriptor,1e-10),cell=Math.min(w,h-30)/4;
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const cx=(w-4*cell)/2+(col+.5)*cell,cy=25+(row+.5)*cell;
      descriptor.push(path([[cx-cell/2,cy-cell/2],[cx+cell/2,cy-cell/2],[cx+cell/2,cy+cell/2],[cx-cell/2,cy+cell/2],[cx-cell/2,cy-cell/2]],'#b5c6d8'));
      for(let b=0;b<8;b++){const length=selected.descriptor[(row*4+col)*8+b]/maxD*cell*.4,a=b*Math.PI/4;descriptor.push(path([[cx,cy],[cx+length*Math.cos(a),cy+length*Math.sin(a)]]));}
    }
    descriptor.push({type:'text',at:[10,18],text:'4×4×8 = 128 · 归一化坐标统计，非原图网格'});
    stages.push(stage('所选关键点 · 128维描述子',white,descriptor));
  }
  return {input,result:{stages,resultStage:stage('SIFT 尺度 / 方向关键点',input,keypointOverlays(sift.keypoints,index)),keypoints:sift.keypoints,selected,selectedIndex:index,
    legend:'蓝：关键点尺度圆与主方向；橙：选中点 / 极值候选；DoG：128为零，亮为正、暗为负；描述子箭头为归一化方向统计。',
    observation:selected?`实际 SIFT：${sift.candidates.length} 个候选 → ${sift.keypoints.length} 个有方向关键点；选中 ${index+1}，尺度 ${selected.imageSigma.toFixed(2)}px，方向 ${(selected.angle*180/Math.PI).toFixed(1)}°。`:'没有通过筛选的 SIFT 特征；平坦或过度模糊图像缺少稳定尺度极值。',
    metrics:'原分辨率起始的 JavaScript SIFT · 非 ORB · 蓝：关键点；橙：所选点 · DoG显示128+8D · 无真值不显示准确率'}};
}
