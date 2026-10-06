import {geometricScenes,orderedSceneEntries} from './scenes/geometric.mjs';
import {resampleContour} from './algorithms/contour.mjs';
import {canvasCoordinates} from './algorithms/canvas-coordinates.mjs';
import {sourceMapping} from './algorithms/source-mapping.mjs';
import {selectHoughCell} from './algorithms/localization.mjs';
const $=id=>document.getElementById(id);
const scenes={
  '01':{title:'边缘从哪里来',question:'求导为什么会放大噪声？平滑又会损失什么？',presets:[['step','阶跃边缘'],['line','亮线'],['roof','屋顶边缘'],['photo','真实山景']],defaultPreset:'step'},
  '02':{title:'一步步运行 Canny',question:'弱边缘为什么有些保留、有些被删除？',presets:[['weak','强弱边界与孤立弱线'],['step','清晰阶跃'],['photo','真实山景']],defaultPreset:'weak'}
};
Object.assign(scenes,geometricScenes);
for(const [value,info]of orderedSceneEntries(geometricScenes))$('scene').add(new Option(`${value} ${info.title}`,value));
const defaults={sigma:1.2,noise:0,row:150,method:'sobel',low:10,high:25,quality:'640'};
let scene=new URL(location.href).searchParams.get('scene')||'01';
if(!scenes[scene]) scene='01';
let worker=null,serial=0,latest=null,upload=null,uploadSecond=null,photo=null,photoSecond=null,stageIndex=0,playTimer=null;
let edits={};
let drawingContour=false;
const view={zoom:1,x:0,y:0};
const canvases=['input','process','result'];
function setState(state,message){document.body.dataset.state=state;if(message)$('status').textContent=message;}
function makeWorker(){worker?.terminate();worker=new Worker(new URL('./compute.worker.mjs',import.meta.url),{type:'module'});worker.onmessage=receive;worker.onerror=e=>setState('error',`后台计算失败：${e.message}`);}
function options(){const result={sigma:Number($('sigma').value),noise:Number($('noise').value),row:Number($('row').value),method:$('method').value,low:Number($('low').value),high:Number($('high').value),preset:$('preset').value};for(const control of scenes[scene].controls||[])result[control.id]=control.choices?$(control.id).value:Number($(control.id).value);return result;}
function outputs(){for(const id of ['sigma','noise','row','low','high']) $(id+'-value').textContent=$(id).value;}
function pause(){clearInterval(playTimer);playTimer=null;$('play').textContent='播放阶段';}
function theory(){
  const geometricTheory={
    '09':'两图独立提取实际SIFT浮点描述子，以欧氏距离找最近/次近邻。严格 d1/d2<门限后，再检查B→A最近邻是否回到原点。RANSAC固定种子42，120次四点单应性假设，重投影误差判内点，再用内点拟合。蓝：几何内点；橙：外点。内点比例只描述当前模型一致性，不等于匹配正确率。默认山景是同一实拍视频5.64s与8.48s的两帧，没有对应真值，不显示正确率；轻度人工变换、重复纹理、模糊和大视角对照是独立预设，仅已知人工变换下计算3px正确率。重复纹理为固定种子教学样例。没有拼接与融合功能，两图横向压缩放入同尺寸画布，误差仍按分析图坐标计算。重复结构、过度模糊和大视角变化可能导致歧义或匹配不足。',
    '08':'实际 JavaScript SIFT，不调用ORB。L(x,y,σ)=Gσ*I，D=L(kσ)−L(σ)，每个候选比较26个时空尺度邻居。三维Taylor/Hessian细化后剔除低对比和边缘曲率响应；主方向为高斯加权36-bin梯度直方图，保留80%次峰；描述子4×4空间单元×8方向三线性投票，L2归一化、0.2截断、再次归一化。右图点击选择最近关键点，阶段末尾查看对应方向和128维统计。蓝：尺度圆与方向；橙：所选点。Gaussian/DoG为同次实际计算，octave放大显示，DoG固定128+8D。与OpenCV区别：不初始2倍上采样，输入σ假设0.5，基础σ1.6，3σ核截断，单位L2浮点描述子，最多200个有方向特征。亮度饱和、模糊及采样会改变稳定性，不承诺关键点完全不变。现有OpenCV.js实际检查没有SIFT接口，源码和能力记录见docs/sift-capability.md。',
    '06':'离散贪心 Snake（教学简化）：闭合轮廓 E=αΣ‖vi−vi−1‖²+βΣ‖vi−1−2vi+vi+1‖²+γΣP(vi)。图像势能 P=−G5*‖∇(G1.5*I)‖²/10000，双线性采样。逐点尝试8邻域，只接受降低同一总能量的移动；每轮记录实际坐标与能量。它不是经典连续变分方程的完整求解器，不使用GVF、气球力、拓扑改变或全局优化。张力可能导致收缩，弱边缘捕获范围小，凹陷与不合适初始化可陷入局部最小；能量降低不等于轮廓正确。蓝色为初始/实际轮廓控制点，拖动输入控制点后松手重算。阶段播放回放本次真实迭代，不生成预设动画。',
    '03':'结构张量 M=Gσ*[Ix²,IxIy;IxIy,Iy²]。特征值反映两个正交方向的局部变化。Harris R=det(M)−0.04 trace(M)²，Shi–Tomasi 使用较小特征值。正响应按本次最大值做阈值筛选，再按响应排序、以5px圆形邻域抑制。橙色窗口可点击或拖动，松手后重算；SSD 图直接对 ±5px 位移计算13×13窗口灰度差平方和，横轴Δx、纵轴Δy；熱图仅显示归一化，指标保留真实数值。边缘沿切向移动误差小，角点两个方向都有约束。右图中心旋转/缩放后保持检测尺度不变，重新计算角点。蓝点是重新检测结果，绿点是原角点的已知坐标映射；一对一5px门限比较只统计远离填充与边界的有效点，不代表算法普遍精度。固定窗口通常有旋转稳定性，但不具备尺度不变性，观察变化不应预设点数相等。',
    '04':'直线：正交总最小二乘；圆：代数最小二乘；椭圆：归一化二次曲线代数最小二乘（固定 x² 系数）。它们的内部目标函数不同。统一比较使用点到模型的最短几何距离：直线为 |ax+by+c|，圆为 |‖p−c‖−r|，椭圆在参数曲线上搜索最近点。RANSAC 每次随机抽取最小点集并用同一几何阈值判内点，最后对内点重新拟合。蓝色：内点/模型；橙色：外点；黄色：本次抽样点。点击添加、拖动修改点后真值指标移除。',
    '05':'光斑模型 I(x)=b+A exp[−(x−μ)²/(2σ²)]；阶跃模型 I(x)=b+A[1+erf((x−μ)/(√2σ))]/2。两者分别定位中心与拐点。联合拟合 μ、σ、A、b，使用阻尼高斯牛顿最小化采样残差。蓝：模型/拟合，橙：像素采样，绿：已知真值位置，红：估计位置。重复试验统计实测偏差和样本标准差；宽度没有固定最优值。上传时分析中间行并重采样到64点，没有真值误差。',
    '07':'直线：ρ=x cosθ+y sinθ；累加器横轴 θ∈[0,π)，纵轴 ρ∈[−对角线,对角线]。圆模式半径由参数指定，圆心累加器横轴 cx、纵轴 cy。梯度约束仅沿 ±∇I 方向产生圆心候选，全方向模式每点72票。热图按本次最大票数显示，不修改原始累加器。点击累加器可回投影。合成圆使用已知径向梯度，上传使用真实图像梯度。手工点没有梯度时改用全方向投票。',
    '10':'刚体：旋转和平移；仿射：6自由度；投影：8自由度。单应性使用坐标中心化/RMS尺度归一化后最小二乘求解。齐次投影先计算 [u,v,w]ᵀ=H[x,y,1]ᵀ，再除以w。目标点可拖动；源点可拖动。病态、奇异、投影极点穿过图像时明确拒绝。输出采用逆映射双线性重采样，不扩展无界画布。仿射/刚体不能精确解释所有投影对应点，显示实际重投影误差。'
  };
  if(geometricTheory[scene]){$('theory').replaceChildren();const p=document.createElement('p');p.textContent=geometricTheory[scene];$('theory').append(p);return;}
  $('theory').innerHTML=scene==='01'?
    '<p>对应：边缘类型、一阶导数、二阶导数。中央差分：I′(x)=[I(x+1)−I(x−1)]/2；I″(x)=I(x+1)−2I(x)+I(x−1)。边界使用 reflect-101；像素间距为 1px。高斯核截断在 ±3σ，并归一化。</p><p>Sobel 核除以 8，Scharr 核除以 32，保证单位斜坡响应为 1。LoG 在同一平滑图上使用四邻域离散拉普拉斯。图像显示：梯度按固定 0–128 灰度/px 映射，LoG 按 −128 至 128 的蓝白红映射；图下曲线保留真实单位。蓝线：灰度；橙色标记：梯度峰值；青色标记：二阶零交叉候选。零交叉不是已验证的真实边界。</p>':
    '<p>对应：高斯平滑 → 归一化 Sobel 梯度 → 四方向非极大值抑制 → 双阈值 → 8 邻域连接。G=√(Gx²+Gy²)，θ=atan2(Gy,Gx)。非极大值抑制沿梯度方向比较相邻像素，平台使用非对称平局规则保留单像素响应。</p><p>阈值以灰度/px 表示，并非 OpenCV 未归一化 Sobel 的默认阈值。黄色为强边缘，青色为弱边缘。弱边缘只有经 8 邻域路径连接强边缘才保留。此实现展示算法的真实离散阶段；方向量化为四方向，最外层 NMS 置零。它不是调用 OpenCV Canny 后虚构中间图。</p>';
}
function configure(reset=true){
  pause();latest=null;scene=$('scene').value=scene;
  const config=scenes[scene];$('title').textContent=config.title;$('question').textContent=config.question;
  $('second-upload-label').hidden=scene!=='09';
  $('draw-contour').hidden=scene!=='06';drawingContour=false;
  $('chapter').textContent=scene==='03'?'局部特征与结构张量':['01','02'].includes(scene)?'边缘检测':['04','05','10'].includes(scene)?'边界检测与定位':'参数空间与几何模型';
  $('preset').replaceChildren(...config.presets.map(([value,text])=>new Option(text,value)));
  $('preset').value=config.defaultPreset;
  $('edge-controls').hidden=scene!=='01';$('canny-controls').hidden=scene!=='02';$('profile-panel').hidden=scene!=='01';
  const geometric=!!geometricScenes[scene];$('sigma').parentElement.hidden=geometric;$('noise').parentElement.hidden=geometric;
  $('custom-controls').hidden=!geometric;$('custom-controls').replaceChildren();
  for(const c of scenes[scene].controls||[]){
    const label=document.createElement('label');label.textContent=c.label;
    let control;
    if(c.choices){control=document.createElement('select');for(const [v,t]of c.choices)control.add(new Option(t,v));}
    else{const output=document.createElement('output');output.id=c.id+'-value';output.textContent=c.value;label.append(output);control=document.createElement('input');control.type='range';control.min=c.min;control.max=c.max;control.step=c.step;}
    control.id=c.id;control.value=c.value;control.addEventListener(c.choices?'change':'input',()=>{if($(c.id+'-value'))$(c.id+'-value').textContent=control.value;if(['fit-noise','outliers','gap','point-noise'].includes(c.id))edits={};compute();});label.append(control);
    if(c.note){const note=document.createElement('small');note.textContent=c.note;label.append(note);}$('custom-controls').append(label);
  }
  edits={};
  if(reset){upload=null;uploadSecond=null;photo=null;photoSecond=null;$('upload-second').value='';for(const [id,value] of Object.entries(defaults))$(id).value=value;$('row').max=299;$('upload').value='';}
  stageIndex=0;view.zoom=1;view.x=view.y=0;$('zoom').value=1;$('compare').value=0;$('original').checked=false;
  const url=new URL(location.href);url.searchParams.set('scene',scene);history.replaceState(null,'',url);
  theory();outputs();compute();
}
async function decodeFile(file,max=Number($('quality').value)){
  if(file.size>32*1024*1024) throw new Error('图像文件超过 32MiB，请压缩后上传');
  let bitmap;
  try {bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});} catch {throw new Error('图像解码失败，请选择浏览器支持的 JPEG、PNG 或 WebP');}
  try {
    if(bitmap.width*bitmap.height>24e6) throw new Error('原图超过 24MP，请先缩小图像');
    const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const w=Math.max(3,Math.round(bitmap.width*scale)),h=Math.max(3,Math.round(bitmap.height*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);
    const rgba=ctx.getImageData(0,0,w,h).data,pixels=new Float32Array(w*h);
    for(let i=0;i<pixels.length;i++){const a=rgba[i*4+3]/255;pixels[i]=(.299*rgba[4*i]+.587*rgba[4*i+1]+.114*rgba[4*i+2])*a+255*(1-a);}
    return {w,h,pixels,originalWidth:bitmap.width,originalHeight:bitmap.height,scale};
  } finally {bitmap.close();}
}
async function compute(){
  pause();const id=++serial;setState('computing','正在本机计算…');outputs();
  let source=upload;
  try {
    if(!source&&($('preset').value==='photo'||scene==='09'&&['realpair','large','blur'].includes($('preset').value))) {
      if(!photo){const response=await fetch('./assets/mountains.jpg');if(!response.ok)throw new Error('内置照片加载失败');photo=await decodeFile(await response.blob());}
      source=photo;
    }
    let second=uploadSecond;
    if(scene==='09'&&$('preset').value==='realpair'&&!second){if(!photoSecond){const response=await fetch('./assets/mountains-02.jpg');if(!response.ok)throw new Error('第二帧加载失败');photoSecond=await decodeFile(await response.blob());}second=photoSecond;}
    if(id!==serial)return;
    const w=source?.w||480,h=source?.h||300;
    $('row').max=h-1;if(Number($('row').value)>=h)$('row').value=Math.floor(h/2);outputs();
    // Termination gives real cancellation rather than waiting behind stale heavy tasks.
    makeWorker();worker.postMessage({id,scene,w,h,input:source?.pixels,input2:scene==='09'?second?.pixels:undefined,input2Width:second?.w,input2Height:second?.h,sourceMappings:{first:source?sourceMapping(source):null,second:scene==='09'&&second?sourceMapping(second,{width:w,height:h}):null},options:options(),seed:42,...edits});
  } catch(error){if(id===serial)setState('error',error.message);}
}
function receive({data}){
  if(data.id!==serial)return;
  if(data.error){latest=null;setState('error',data.error);return;}
  latest=data;stageIndex=Math.min(stageIndex,data.result.stages.length-1);
  $('stage').replaceChildren(...data.result.stages.map((s,i)=>new Option(s.name,i)));$('stage').value=stageIndex;
  const source=upload?'本地上传':$('preset').value==='photo'||scene==='09'&&['large','blur'].includes($('preset').value)?'真实视频抽帧':'合成教学数据';
  $('source-kind').textContent=source;
  $('source-note').textContent=upload?`本地上传 · ${upload.originalWidth}×${upload.originalHeight} → ${data.w}×${data.h} · 坐标比例 ${upload.scale.toFixed(4)}`:
    source==='真实视频抽帧'?`cottonbro studio · Pexels 9943097 · 原视频 5.64s 抽帧 · Pexels License${scene==='09'?' · 第二图为人工变换对照，不是现场拍摄双图':''}；来源见素材台账`:'合成教学数据 · 固定随机种子 42 · 非实拍图像';
  const r=data.result;
  if(scene==='09'&&($('preset').value==='realpair'||uploadSecond)){$('source-kind').textContent=upload||uploadSecond?'本地双图':'真实视频双帧';$('source-note').textContent=uploadSecond?'本地双图 · 均仅在本机处理 · 没有对应真值':`cottonbro studio · Pexels 9943097 · 5.64s / 8.48s 两个独立拍摄时刻 · Pexels License · 没有对应真值${upload?' · 第一图已替换为本地图片':''}`;}
  if(geometricScenes[scene]){setState('ready',r.observation);$('metrics').textContent=`${r.metrics} · 实际计算 ${data.timing.toFixed(1)} ms`;}
  else if(scene==='02'){
    setState('ready',`弱边缘 ${r.weak} 个：${r.retainedWeak} 个连接到强边缘而保留，${r.removedWeak} 个未连通而删除。`);
    $('metrics').textContent=`强边缘 ${r.strong} · 最终边缘 ${r.edgeCount} · ${data.w}×${data.h} · 实际计算 ${data.timing.toFixed(1)} ms`;
  }else{
    setState('ready',`采样线 y=${r.row}：梯度峰值 ${r.profile.peaks.length} 个，二阶零交叉候选 ${r.profile.zeroCrossings.length} 个。`);
    $('metrics').textContent=`σ=${data.options.sigma} px · 噪声 σ=${data.options.noise} · ${data.w}×${data.h} · 实际计算 ${data.timing.toFixed(1)} ms`;
  }
  render();
}
function fieldCanvas(stage,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),rgba=ctx.createImageData(w,h);
  for(let i=0;i<w*h;i++){
    const fw=stage.fieldWidth||w,fh=stage.fieldHeight||h,index=stage.fieldWidth?Math.min(fh-1,Math.floor(Math.floor(i/w)*fh/h))*fw+Math.min(fw-1,Math.floor(i%w*fw/w)):i;
    const v=stage.data[index];let color;
    if(stage.kind==='labels')color=v===2?[255,190,30]:v===1?[28,195,215]:[12,22,38];
    else if(stage.kind==='signed'){const t=Math.max(-1,Math.min(1,v/128));color=t<0?[255*(1+t),255*(1+t),255]:[255,255*(1-t),255*(1-t)];}
    else if(stage.kind==='direction'){
      if(stage.mask[i]<1)color=[12,22,38];else{const angle=(v+Math.PI)/(2*Math.PI)*6,k=Math.floor(angle),f=angle-k;const colors=[[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255],[255,0,0]];color=colors[k].map((a,j)=>a*(1-f)+colors[k+1][j]*f);}
    } else {const gray=Math.max(0,Math.min(255,stage.kind==='dog'?128+v*8:stage.kind==='magnitude'?v*255/128:v));color=[gray,gray,gray];}
    rgba.data.set([...color,255],i*4);
  }
  ctx.putImageData(rgba,0,0);return c;
}
function drawOverlays(image,overlays=[]){
  const ctx=image.getContext('2d');
  for(const overlay of overlays){
    ctx.strokeStyle=overlay.color||'#173f79';ctx.lineWidth=2;
    if(overlay.type==='path'){ctx.beginPath();for(let i=0;i<overlay.points.length;i++){const [x,y]=overlay.points[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
    else if(overlay.type==='text'){ctx.fillStyle=overlay.color||'#173f79';ctx.font='13px Microsoft YaHei';ctx.fillText(overlay.text,...overlay.at);}
    else if(overlay.type==='points'){overlay.points.forEach(([x,y],i)=>{ctx.fillStyle=overlay.colors?.[i]||'#173f79';ctx.beginPath();ctx.arc(x,y,overlay.radius||3,0,Math.PI*2);ctx.fill();});}
  }
  return image;
}
function drawPane(id,image,source){
  const canvas=$(id),ctx=canvas.getContext('2d');canvas.width=image.width;canvas.height=image.height;
  ctx.fillStyle='#eef2f7';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(canvas.width/2+view.x,canvas.height/2+view.y);ctx.scale(view.zoom,view.zoom);ctx.translate(-canvas.width/2,-canvas.height/2);
  ctx.drawImage(image,0,0);
  if(id==='result'&&source){const t=$('original').checked?1:Number($('compare').value)/100;ctx.save();ctx.beginPath();ctx.rect(0,0,canvas.width*t,canvas.height);ctx.clip();ctx.drawImage(source,0,0);ctx.restore();if(t>0&&t<1){ctx.strokeStyle='#edaa3c';ctx.beginPath();ctx.moveTo(canvas.width*t,0);ctx.lineTo(canvas.width*t,canvas.height);ctx.stroke();}}
  if(id==='input'&&scene==='01'){ctx.strokeStyle='#00cee2';ctx.lineWidth=1.5/view.zoom;ctx.beginPath();ctx.moveTo(0,latest.result.row);ctx.lineTo(canvas.width,latest.result.row);ctx.stroke();}
  ctx.restore();
}
function plot(id,values,color,markers=[],range){
  const c=$(id),ctx=c.getContext('2d'),w=c.width,h=c.height,margin=28;
  ctx.clearRect(0,0,w,h);let min,max;
  if(range)[min,max]=range;else{let bound=1;for(const v of values)bound=Math.max(bound,Math.abs(v));min=-bound;max=bound;}
  const py=v=>h-margin-(v-min)/(max-min)*(h-2*margin),px=x=>margin+x/(values.length-1)*(w-2*margin);
  ctx.strokeStyle='#dce4ef';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,py(0));ctx.lineTo(w-margin,py(0));ctx.stroke();
  ctx.fillStyle='#62738b';ctx.font='11px Microsoft YaHei';ctx.fillText(max.toFixed(1),1,margin);ctx.fillText(min.toFixed(1),1,h-margin);ctx.fillText('0',margin,h-7);ctx.fillText(`${values.length-1} px`,w-65,h-7);
  ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();for(let x=0;x<values.length;x++){if(x===0)ctx.moveTo(px(x),py(values[x]));else ctx.lineTo(px(x),py(values[x]));}ctx.stroke();
  ctx.fillStyle=id==='first-plot'?'#df8b19':'#0f9cae';for(const x of markers){ctx.beginPath();ctx.arc(px(x),py(values[Math.round(x)]),3,0,Math.PI*2);ctx.fill();}
}
function render(){
  if(!latest)return;const {w,h,input,result:r}=latest;
  const original=drawOverlays(fieldCanvas({data:input,kind:'gray'},w,h),r.inputOverlays),stage=r.stages[stageIndex];
  const output=r.resultStage||(scene==='02'?{data:r.edges,kind:'gray'}:$('method').value==='log'?{data:r.log,kind:'signed'}:{data:r.magnitude,kind:'magnitude'});
  drawPane('input',original);drawPane('process',drawOverlays(fieldCanvas(stage,w,h),stage.overlays));drawPane('result',drawOverlays(fieldCanvas(output,w,h),output.overlays),original);
  $('stage-name').textContent=stage.name;$('stage').value=stageIndex;$('result-name').textContent=r.resultStage?.name||(scene==='02'?'连通边缘':$('method').selectedOptions[0].text);
  $('legend').textContent=stage.kind==='labels'?'黄：强边缘；青：弱边缘；黑：非边缘':stage.kind==='direction'?'色相：梯度方向 −π 至 π；低于 1 的梯度置黑':stage.kind==='signed'?'蓝：负响应；白：零；红：正响应（固定 ±128）':'灰度：响应强度；梯度幅值按固定 0–128 显示';
  if(scene==='01'){plot('gray-plot',r.profile.gray,'#173f79',[],[0,255]);plot('first-plot',r.profile.first,'#173f79',r.profile.peaks);plot('second-plot',r.profile.second,'#173f79',r.profile.zeroCrossings);}
  if(geometricScenes[scene])$('legend').textContent=latest.result.legend||(scene==='06'?'蓝：实际轮廓与控制点；势能图越亮吸引越强；阶段标签为真实总能量':scene==='03'?'橙：当前窗口 / 阈值候选；蓝：保留角点；SSD 热图越亮误差越大':scene==='04'?'蓝：内点 / 模型；橙：外点；黄：本次抽样点':scene==='05'?'绿：合成真值；红：估计位置；采样点为离散观测':scene==='07'?'累加器：亮表示票数多；点选参数空间回投影':'蓝：对应点与变换网格；灰色空区：未映射到有效输入');
}
function step(){if(latest){stageIndex=(stageIndex+1)%latest.result.stages.length;render();}}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('scene').onchange=()=>{serial++;scene=$('scene').value;configure();};
$('preset').onchange=()=>{drawingContour=false;upload=null;uploadSecond=null;edits={};$('upload').value='';$('upload-second').value='';compute();};
for(const id of ['sigma','noise','row','low','high'])$(id).oninput=()=>{
  if(id==='low'&&Number($('low').value)>Number($('high').value))$('high').value=$('low').value;
  if(id==='high'&&Number($('high').value)<Number($('low').value))$('low').value=$('high').value;
  compute();
};
$('method').onchange=compute;
$('quality').onchange=async()=>{
  const id=++serial;worker?.terminate();pause();photo=null;photoSecond=null;
  setState('computing','正在本机重新采样…');
  try{
    const max=Number($('quality').value);
    const [first,second]=await Promise.all([
      upload?decodeFile($('upload').files[0],max):null,
      uploadSecond?decodeFile($('upload-second').files[0],max):null
    ]);
    if(id!==serial)return;
    upload=first;uploadSecond=second;edits={};drawingContour=false;
    view.zoom=1;view.x=view.y=0;$('zoom').value=1;compute();
  }catch(error){if(id===serial)setState('error',error.message);}
};
$('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;const id=++serial;setState('computing','正在本机解码…');try{const decoded=await decodeFile(file);if(id!==serial)return;upload=decoded;compute();}catch(error){if(id===serial)setState('error',error.message);}};
$('upload-second').onchange=async()=>{const file=$('upload-second').files[0];if(!file)return;const id=++serial;setState('computing','正在本机解码第二张图…');try{const decoded=await decodeFile(file);if(id!==serial)return;uploadSecond=decoded;compute();}catch(error){if(id===serial)setState('error',error.message);}};
$('reset').onclick=()=>{serial++;configure();};$('step').onclick=()=>{pause();step();};
$('draw-contour').onclick=()=>{if(!latest)return;pause();drawingContour=true;setState('drawing','在输入图按住并沿目标外缘画一圈，松手闭合并开始迭代。');};
$('play').onclick=()=>{if(playTimer){pause();return;}if(!latest)return;$('play').textContent='暂停';playTimer=setInterval(step,650);};
$('stage').onchange=()=>{pause();stageIndex=Number($('stage').value);render();};
$('cancel').onclick=()=>{serial++;worker?.terminate();pause();setState('cancelled','计算已取消；改变参数或复位即可重新开始。');};
$('zoom').oninput=()=>{view.zoom=Number($('zoom').value);render();};$('home-view').onclick=()=>{view.zoom=1;view.x=view.y=0;$('zoom').value=1;render();};
$('original').onchange=render;$('compare').oninput=render;
$('teacher').onclick=()=>{const value=!document.body.classList.contains('teacher');document.body.classList.toggle('teacher',value);$('teacher').setAttribute('aria-pressed',value);const url=new URL(location.href);if(value)url.searchParams.set('teacher','1');else url.searchParams.delete('teacher');history.replaceState(null,'',url);};
$('export-png').onclick=()=>{if(!latest||document.body.dataset.state!=='ready')return;$('result').toBlob(blob=>blob&&save(blob,`feature-lab-${scene}.png`));};
$('export-json').onclick=()=>{if(!latest||document.body.dataset.state!=='ready')return;save(new Blob([JSON.stringify({schemaVersion:1,scene,options:latest.options,seed:latest.seed,dimensions:{width:latest.w,height:latest.h},source:upload?'local-upload':$('preset').value,sourceMappings:latest.sourceMappings,edits,computeMs:latest.timing},null,2)],{type:'application/json'}),`feature-lab-${scene}.json`);};
$('link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('link').textContent='链接已复制';setTimeout(()=>$('link').textContent='复制场景链接',1500);}catch{setState('error','请从浏览器地址栏复制当前场景链接');}};
for(const id of canvases){
  let drag=null;
  $(id).onpointerdown=e=>{if(!latest)return;$(id).setPointerCapture(e.pointerId);
    if(scene==='06'&&id==='input'&&drawingContour&&!e.shiftKey){drag={kind:'drawContour',points:[canvasPoint(e,id)]};return;}
    if(scene==='08'&&id==='result'&&!e.shiftKey){const p=canvasPoint(e,id);let index=-1,distance=Infinity;latest.result.keypoints.forEach((q,i)=>{const d=Math.hypot(q.imageX-p[0],q.imageY-p[1]);if(d<distance){distance=d;index=i;}});if(index>=0){edits.selectedKeypoint=index;compute();}return;}
    if(scene==='06'&&id==='input'&&!e.shiftKey){const p=canvasPoint(e,id);edits.contour=(edits.contour||latest.result.contour).map(p=>[...p]);const index=edits.contour.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<14);if(index>=0){drag={kind:'contour',index};return;}}
    if(scene==='03'&&id==='input'&&!e.shiftKey){edits.center=canvasPoint(e,id);drag={kind:'window'};return;}
    if(!e.shiftKey&&['04','07','10'].includes(scene)){
      const p=canvasPoint(e,id);const r=latest.result;
      if(scene==='07'&&id==='process'){selectVote(p);return;}
      if((scene==='04'||scene==='07')&&id==='input'){
        edits.points=(edits.points||r.points).map(p=>[...p]);let index=edits.points.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<12);
        if(index<0){if(edits.points.length>=200)return;index=edits.points.length;edits.points.push(p);}drag={kind:'points',index};return;
      }
      if(scene==='10'&&(id==='input'||id==='result')){const key=id==='input'?'from':'to';edits[key]=(edits[key]||r[key]).map(p=>[...p]);const index=edits[key].findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<16);if(index>=0){drag={kind:key,index};return;}}
    }
    drag={x:e.clientX,y:e.clientY,pan:id!=='input'||scene!=='01'||e.shiftKey};if(!drag.pan)sample(e);};
  $(id).onpointermove=e=>{if(!drag)return;if(drag.kind==='drawContour'){const p=canvasPoint(e,id),last=drag.points.at(-1);if(drag.points.length<2000&&Math.hypot(p[0]-last[0],p[1]-last[1])>=1)drag.points.push(p);const image=drawOverlays(fieldCanvas({data:latest.input,kind:'gray'},latest.w,latest.h),[{type:'path',points:drag.points,color:'#cf613e'}]);drawPane('input',image);return;}if(drag.kind==='window'){edits.center=canvasPoint(e,id);return;}if(drag.kind){const key=drag.kind;edits[key][drag.index]=canvasPoint(e,id);return;}if(!drag.pan){sample(e);return;}const canvas=$(id),scale=Math.min(canvas.clientWidth/canvas.width,canvas.clientHeight/canvas.height);view.x+=(e.clientX-drag.x)/scale;view.y+=(e.clientY-drag.y)/scale;drag.x=e.clientX;drag.y=e.clientY;render();};
  $(id).onpointerup=()=>{if(drag?.kind==='drawContour'){try{edits.contour=resampleContour(drag.points);drawingContour=false;compute();}catch(error){setState('error',error.message+'；点击绘制按钮重试。');render();}}else if(drag?.kind)compute();drag=null;};$(id).onpointercancel=()=>{if(drag?.kind==='drawContour'){drawingContour=false;render();setState('ready','绘制已取消，保留原轮廓。');}drag=null;};
}
function canvasPoint(e,id){const c=$(id),rect=c.getBoundingClientRect();return canvasCoordinates(e.clientX,e.clientY,{left:rect.left+c.clientLeft,top:rect.top+c.clientTop,width:c.clientWidth,height:c.clientHeight},c.width,c.height,view);}
function selectVote([x,y]){
  const r=latest.result.hough;
  Object.assign(edits,selectHoughCell(r,latest.w,latest.h,[x,y]));
  compute();
}
function sample(e){$('row').value=Math.round(canvasPoint(e,'input')[1]);compute();}
if(new URL(location.href).searchParams.get('teacher')==='1'){document.body.classList.add('teacher');$('teacher').setAttribute('aria-pressed','true');}
configure();
