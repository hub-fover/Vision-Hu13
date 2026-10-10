import {stereoMatch,pointCosts} from './geometry-core.mjs';
const base=new URL('../assets/geometry/',import.meta.url);
let library;
function jsfeat(){return library??=new Promise((resolve,reject)=>{if(globalThis.jsfeat)return resolve(globalThis.jsfeat);const script=document.createElement('script');script.src=new URL('jsfeat-min.js',base);script.onload=()=>resolve(globalThis.jsfeat);script.onerror=()=>{library=null;reject(Error('JSFeat 本地库加载失败'));};document.head.append(script);});}
function image(name){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('立体照片加载失败'));img.src=new URL(name,base);});}
export function available(chapter,scene){return chapter==='005'&&scene==='02';}
export async function mount(host){
 let disposed=false;
 host.innerHTML=`<h3>真实双目照片：OpenCV Aloe × JSFeat</h3>
 <p>照片中的叶片、盆栽、重复壁纸和遮挡会真实参与匹配。拖动参数，再点击左图或视差图，检查同一极线上的候选、代价及歧义。</p>
 <div class="real-controls">
 <label>最大视差 <output data-value="max">48</output> px<input aria-label="最大视差" data-param="max" type="range" min="8" max="80" step="4" value="48"></label>
 <label>匹配窗口 <output data-value="block">7</output> px<input aria-label="匹配窗口" data-param="block" type="range" min="3" max="19" step="2" value="7"></label>
 <label>唯一性阈值 <output data-value="unique">10</output>%<input aria-label="唯一性阈值" data-param="unique" type="range" min="0" max="60" step="5" value="10"></label>
 <label><input data-param="features" type="checkbox">显示 JSFeat FAST 角点</label>
 <button data-action="save">下载计算视差 PNG</button><button data-action="json">下载实验 JSON</button><button data-action="reset">恢复默认参数</button><button data-action="cancel">取消待运行更新</button></div>
 <div class="real-views">${['左相机照片 / 点击选点','右相机照片 / 同一极线','SAD 视差（黑色=不可信）','匹配置信度（亮=唯一）'].map((s,i)=>`<figure><canvas data-view="${i}" width="384" height="332" aria-label="${s}"></canvas><figcaption>${s}</figcaption></figure>`).join('')}</div>
 <figure><canvas data-view="cost" width="768" height="200" aria-label="所选像素各视差 SAD 代价"></canvas><figcaption>所选像素的候选视差代价（越低越好）</figcaption></figure>
 <p class="real-status" aria-live="polite">正在加载本地真实照片及 JSFeat…</p><pre data-inspect></pre>
 <p>观察任务：先选叶片纹理，再选平滑叶面、重复壁纸和叶片边缘；增大窗口能减少噪声，却会把不同深度混入一个窗口。遮挡与反光会破坏匹配；低唯一性区域不应当作可靠三维结构。</p>
 <p class="real-source">实际调用：<a href="https://github.com/inspirit/jsfeat" target="_blank" rel="noreferrer">JSFeat（MIT）</a> 的 grayscale 与 fast_corners.detect。真实照片：<a href="https://github.com/opencv/opencv/tree/4.12.0/samples/data" target="_blank" rel="noreferrer">OpenCV 4.12.0 samples/data Aloe 双目对（Apache-2.0 仓库样例）</a>。SAD 视差与唯一性由本项目教学实现计算，并非调用 OpenCV StereoBM；未调用 scikit-image。<a href="${new URL('PROVENANCE.json',base)}" target="_blank">来源与文件校验</a>。</p>
 <p class="real-source">两张照片已配准；这里演示水平极线匹配，没有估计一般基础矩阵、相机标定或 RANSAC。无本样例可靠相机内参，结果只有相对视差，不输出米制深度。照片缩小后，所有参数单位都是当前计算图像像素。</p>`;
 const views=[0,1,2,3].map(i=>host.querySelector(`[data-view="${i}"]`)),costCanvas=host.querySelector('[data-view="cost"]'),status=host.querySelector('.real-status'),inspect=host.querySelector('[data-inspect]');
 const [lib,leftImage,rightImage]=await Promise.all([jsfeat(),image('aloeL.jpg'),image('aloeR.jpg')]);
 if(disposed||!status.isConnected)return ()=>{disposed=true;};
 const w=384,h=Math.round(leftImage.height*w/leftImage.width),sources=[leftImage,rightImage].map(img=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return c;});
 for(const c of views){c.width=w;c.height=h;}
 const gray=sources.map(c=>{const m=new lib.matrix_t(w,h,lib.U8_t|lib.C1_t);lib.imgproc.grayscale(c.getContext('2d').getImageData(0,0,w,h).data,w,h,m);return m;});
 const corners=gray.map(m=>{const out=Array.from({length:w*h},()=>new lib.keypoint_t(0,0,0,0));lib.fast_corners.set_threshold(25);const count=lib.fast_corners.detect(m,out,4);return out.slice(0,count);});
 let selected={x:225,y:Math.round(h*.53)},result,timer,parameters,lastStatus;
 function input(name){return host.querySelector(`[data-param="${name}"]`);}
 function photo(i){const ctx=views[i].getContext('2d');ctx.drawImage(sources[i],0,0);if(input('features').checked){ctx.fillStyle='#35f4b3';for(const p of corners[i])ctx.fillRect(p.x-1,p.y-1,2,2);}ctx.strokeStyle='#ffda36';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,selected.y+.5);ctx.lineTo(w,selected.y+.5);ctx.stroke();const d=result?.disparity[selected.y*w+selected.x]??0,x=selected.x-(i?d:0);ctx.strokeStyle='#ff2a59';ctx.lineWidth=2;ctx.strokeRect(x-(parameters?.block??7)/2,selected.y-(parameters?.block??7)/2,parameters?.block??7,parameters?.block??7);}
 function inspectPoint(){
 const {x,y}=selected,{maxDisparity,block}=parameters,values=pointCosts(gray[0].data,gray[1].data,w,h,x,y,maxDisparity,block),i=y*w+x,d=result.disparity[i],ctx=costCanvas.getContext('2d'),cw=costCanvas.width,ch=costCanvas.height,pad=35,finite=Array.from(values).filter(Number.isFinite),lo=Math.min(...finite),hi=Math.max(...finite,lo+1);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.strokeStyle='#3c75b1';ctx.lineWidth=2;ctx.beginPath();let drawing=false;values.forEach((v,k)=>{if(Number.isFinite(v)){const px=pad+k/maxDisparity*(cw-pad*2),py=ch-pad-(v-lo)/(hi-lo)*(ch-pad*2);if(!drawing)ctx.moveTo(px,py);else ctx.lineTo(px,py);drawing=true;}else drawing=false;});ctx.stroke();ctx.fillStyle='#253950';ctx.font='14px sans-serif';ctx.fillText(`平均绝对亮度差 ${lo.toFixed(1)} … ${hi.toFixed(1)}`,pad,18);ctx.fillText('0',pad,ch-9);ctx.fillText(`${maxDisparity} px`,cw-pad-25,ch-9);ctx.strokeStyle='#ed345c';ctx.beginPath();ctx.moveTo(pad+d/maxDisparity*(cw-pad*2),pad);ctx.lineTo(pad+d/maxDisparity*(cw-pad*2),ch-pad);ctx.stroke();
 inspect.textContent=`左图坐标 (${x}, ${y}) → 右图候选 (${x-d}, ${y})\n最佳整数视差 ${d} px；窗口 ${block}×${block}；平均 SAD ${result.cost[i].toFixed(2)}\n唯一性置信度 ${(result.confidence[i]*100).toFixed(1)}%；当前判定：${result.valid[i]?'可信候选':'不可信 / 遮挡、弱纹理或重复纹理可能'}\n置信度 = (次小代价 − 最小代价) / 次小代价；不是统计概率。\nJSFeat FAST：左图 ${corners[0].length} 个角点，右图 ${corners[1].length} 个；角点仅显示纹理位置，不充当立体对应。`;
 photo(0);photo(1);
 }
 function run(){clearTimeout(timer);timer=null;if(disposed)return;const start=performance.now();parameters={maxDisparity:+input('max').value,block:+input('block').value,uniqueness:+input('unique').value/100};for(const key of ['max','block','unique'])host.querySelector(`[data-value="${key}"]`).textContent=input(key).value;result=stereoMatch(gray[0].data,gray[1].data,w,h,parameters);
 for(const index of [2,3]){const ctx=views[index].getContext('2d'),im=ctx.createImageData(w,h);for(let i=0;i<w*h;i++){const t=index===3?result.confidence[i]:result.disparity[i]/parameters.maxDisparity,o=i*4;if(index===3){im.data[o]=im.data[o+1]=im.data[o+2]=Math.round(t*255);}else if(result.valid[i]){im.data[o]=Math.round(255*t);im.data[o+1]=Math.round(255*(1-Math.abs(t-.5)*2));im.data[o+2]=Math.round(255*(1-t));}im.data[o+3]=255;}ctx.putImageData(im,0,0);}
 const valid=result.valid.reduce((a,b)=>a+b,0);status.textContent=`已计算 ${w}×${h} 真实像素；可信候选 ${(100*valid/(w*h)).toFixed(1)}%；耗时 ${(performance.now()-start).toFixed(0)} ms。颜色：蓝=较小视差，红=较大视差。`;lastStatus=status.textContent;inspectPoint();}
 function change(){clearTimeout(timer);status.textContent='正在更新真实照片匹配…';timer=setTimeout(run,20);}
 const controls=host.querySelectorAll('input');for(const el of controls)el.addEventListener('input',change);
 function select(event){const box=event.currentTarget.getBoundingClientRect(),r=parameters.block>>1;selected={x:Math.max(r,Math.min(w-r-1,Math.floor((event.clientX-box.left)*w/box.width))),y:Math.max(r,Math.min(h-r-1,Math.floor((event.clientY-box.top)*h/box.height)))};inspectPoint();}
 views[0].addEventListener('click',select);views[2].addEventListener('click',select);
 const save=host.querySelector('[data-action="save"]');const download=()=>{const a=document.createElement('a');a.download=`aloe-SAD-d${parameters.maxDisparity}-b${parameters.block}.png`;a.href=views[2].toDataURL('image/png');a.click();};save.addEventListener('click',download);
 const exportButton=host.querySelector('[data-action="json"]'),resetButton=host.querySelector('[data-action="reset"]'),cancelButton=host.querySelector('[data-action="cancel"]');
 let exportURL,revokeTimer;
 const exportJSON=()=>{const payload={schemaVersion:1,experiment:'real-stereo-SAD',algorithmVersion:'integral-SAD-v1',parameters:{...parameters},inputs:{width:w,height:h,originalWidth:leftImage.width,originalHeight:leftImage.height,sourceURLs:['https://raw.githubusercontent.com/opencv/opencv/4.12.0/samples/data/aloeL.jpg','https://raw.githubusercontent.com/opencv/opencv/4.12.0/samples/data/aloeR.jpg'],preprocessing:'browser bilinear scaling to384px width; JSFeat grayscale'},arrayLayout:'row-major y*width+x',units:'disparity in resized-image pixels; confidence uniqueness gap, not probability',disparity:Array.from(result.disparity),confidence:Array.from(result.confidence),valid:Array.from(result.valid)};if(exportURL)URL.revokeObjectURL(exportURL);clearTimeout(revokeTimer);exportURL=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=document.createElement('a');a.download='aloe-stereo-experiment.json';a.href=exportURL;a.click();revokeTimer=setTimeout(()=>{URL.revokeObjectURL(exportURL);exportURL=null;},1000);};
 const reset=()=>{clearTimeout(timer);input('max').value=48;input('block').value=7;input('unique').value=10;input('features').checked=false;selected={x:225,y:Math.round(h*.53)};run();};
 const cancel=()=>{clearTimeout(timer);timer=null;input('max').value=parameters.maxDisparity;input('block').value=parameters.block;input('unique').value=Math.round(parameters.uniqueness*100);for(const key of ['max','block','unique'])host.querySelector(`[data-value="${key}"]`).textContent=input(key).value;status.textContent=lastStatus+'（已取消等待中的参数更新；同步计算开始后不会中途终止）';};
 exportButton.addEventListener('click',exportJSON);resetButton.addEventListener('click',reset);cancelButton.addEventListener('click',cancel);run();
 return ()=>{disposed=true;clearTimeout(timer);for(const el of controls)el.removeEventListener('input',change);views[0].removeEventListener('click',select);views[2].removeEventListener('click',select);save.removeEventListener('click',download);exportButton.removeEventListener('click',exportJSON);resetButton.removeEventListener('click',reset);cancelButton.removeEventListener('click',cancel);clearTimeout(revokeTimer);if(exportURL)URL.revokeObjectURL(exportURL);};
}

