import {openRealLab} from './real/entry.mjs';
import {draw} from './render.mjs';
import {normalizeParams,toPortable} from './runtime.mjs';
const $=id=>document.getElementById(id),chapterId=location.pathname.match(/chapter-(00[4-8])/ )?.[1];
let scenes,chapter,scene,params,worker,task=0,result,baseline,comparing=false,stageIndex=0,timer,timeout,debounce,input=null,inputName='',rotations=[{yaw:.65,pitch:.7},{yaw:.65,pitch:.7},{yaw:.65,pitch:.7}],teacher=new URLSearchParams(location.search).get('teacher')==='1';
const setText=(id,text)=>{$(id).textContent=text??'';};
function setState(state,text){document.body.dataset.state=state;setText('status',text);$('export-png').disabled=$('export-json').disabled=state!=='ready';}
function stopPlay(){clearInterval(timer);timer=null;$('play').textContent='播放阶段';$('play').setAttribute('aria-pressed','false');}
function stopWorker(){clearTimeout(timeout);worker?.terminate();worker=null;}
function updateTeacher(){ $('teacher').setAttribute('aria-pressed',String(teacher));$('teacher-panel').hidden=!teacher;const url=new URL(location.href);if(teacher)url.searchParams.set('teacher','1');else url.searchParams.delete('teacher');history.replaceState({},'',url);}
function listText(id,items){$(id).replaceChildren(...(items??[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
function selectScene(id){
 stopPlay();stopWorker();task++;scene=scenes.find(s=>s.id===id)??scenes[0];input=null;inputName='';result=null;baseline=null;comparing=false;$('compare').disabled=true;$('compare').setAttribute('aria-pressed','false');params=normalizeParams(scene.controls,{});$('seed').value='2026';$('upload').value='';setText('input-note','');
 document.title=`${scene.title} · ${chapter.title} · Vision Hub`;
 setText('chapter-name',`${chapterId} · ${chapter.title}`);setText('eyebrow',`EXPERIMENT ${scene.id} / ${String(scenes.length).padStart(2,'0')}`);setText('title',scene.title);setText('goal',scene.goal);setText('source',`课件：${scene.source?.file??''} · 第 ${scene.source?.pages??''} 页`);setText('principle',scene.principle);setText('failure',scene.failure);setText('teacher-notes',scene.teacherNotes??scene.questions?.join('；'));listText('steps',scene.steps);listText('questions',scene.questions);
 const url=new URL(location.href);url.searchParams.set('scene',scene.id);history.replaceState({},'',url);
 $('scene-nav').replaceChildren(...scenes.map(s=>{const a=document.createElement('a');a.href=`?scene=${s.id}${teacher?'&teacher=1':''}`;a.textContent=`${s.id} ${s.title}`;if(s.id===scene.id)a.setAttribute('aria-current','page');a.onclick=e=>{e.preventDefault();selectScene(s.id);};return a;}));
 $('controls').replaceChildren(...scene.controls.map(c=>{const label=document.createElement('label');label.textContent=c.label;const output=document.createElement('output');output.id=`value-${c.key}`;output.textContent=params[c.key];const slider=document.createElement('input');slider.type='range';slider.id=`param-${c.key}`;slider.min=c.min;slider.max=c.max;slider.step=c.step;slider.value=params[c.key];slider.setAttribute('aria-label',c.label);slider.oninput=()=>{params[c.key]=Number(slider.value);output.textContent=slider.value;clearTimeout(debounce);debounce=setTimeout(compute,100);};label.append(output,slider);if(c.help){const small=document.createElement('small');small.textContent=c.help;label.append(small);}return label;}));
 $('upload-wrap').hidden=!scene.supportsInput;
 openRealLab(chapterId,scene.id);
 compute();
}
function compute(){
 clearTimeout(debounce);stopPlay();stopWorker();comparing=false;$('compare').setAttribute('aria-pressed','false');const seed=Number($('seed').value);
 if(!Number.isInteger(seed)||seed<0||seed>4294967295){setState('error','随机种子需要是 0 到 4294967295 的整数');return;}
 const id=++task;setState('computing','正在本机计算…');worker=new Worker(new URL('./compute.worker.mjs',import.meta.url),{type:'module'});
 timeout=setTimeout(()=>{if(id===task){stopWorker();setState('error','计算超过 30 秒，已停止。请降低迭代次数后重试。');}},30000);
 worker.onmessage=({data})=>{if(data.id!==task)return;clearTimeout(timeout);if(data.error){setState('error',data.error);return;}result=data.result;result.run={chapter:chapterId,scene:scene.id,params:data.params,seed,input:input?{...input,name:inputName}:null,version:'1.0.0',timeMs:data.time};stageIndex=result.stages.length-1;$('stage').replaceChildren(...result.stages.map((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}. ${s.label}`;return o;}));$('stage').value=stageIndex;setState('ready',`计算完成 · ${data.time.toFixed(1)} ms · ${result.stages.length} 个真实阶段 · ${input?'自选图像，无参考真值':'内置合成教学样例'}`);show();};
 worker.onerror=()=>{if(id===task){stopWorker();setState('error','计算模块加载失败，请确认通过 HTTP 服务打开，并检查静态资源。');}};
 worker.postMessage({id,chapter:chapterId,scene:scene.id,params,seed,input});
}
function activeViews(){const r=comparing?baseline:result;return r?.stages[stageIndex]?.views??r?.views;}
function show(){
 const r=comparing?baseline:result;if(!r)return;const views=activeViews();views?.forEach((v,i)=>{draw($(`view-${i}`),v,rotations[i]);setText(`caption-${i}`,v.title);});
 $('metrics').replaceChildren(...r.metrics.map(m=>{const d=document.createElement('div');d.className='metric';const label=document.createElement('span');label.textContent=m.label;const val=document.createElement('strong');val.textContent=typeof m.value==='number'?Number(m.value.toPrecision(5)).toString():m.value;const unit=document.createElement('small');unit.textContent=m.unit??'';d.append(label,val,unit);return d;}));setText('message',r.message);$('previous').disabled=stageIndex<=0;$('next').disabled=stageIndex>=r.stages.length-1;
}
function changeStage(index){const r=comparing?baseline:result;if(!r)return;stageIndex=Math.max(0,Math.min(r.stages.length-1,index));$('stage').value=stageIndex;show();}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
async function upload(file){
 const uploadTask=task;
 if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setState('error','请选择 PNG、JPEG 或 WebP 图像。');return;}if(file.size>16*1024*1024){setState('error','图像文件超过 16 MiB，请先缩小。');return;}
 try{const bitmap=await createImageBitmap(file);if(task!==uploadTask){bitmap.close();return;}if(bitmap.width*bitmap.height>24000000){bitmap.close();throw new Error('图像超过 2400 万像素，请先缩小。');}
 const scale=Math.min(1,64/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),c=new OffscreenCanvas(w,h),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();const rgba=ctx.getImageData(0,0,w,h).data,data=new Float32Array(w*h);for(let i=0;i<data.length;i++)data[i]=(rgba[i*4]*.2126+rgba[i*4+1]*.7152+rgba[i*4+2]*.0722)/255;input={width:w,height:h,data};inputName=file.name;setText('input-note',`${file.name} · 分析 ${w} × ${h} · 无参考真值`);compute();
 }catch(e){setState('error',`图像无法读取：${e.message}`);}
}
function renderSections(){
 $('sections').replaceChildren(...(chapter.sections??[]).map(s=>{const d=document.createElement('div');d.className='section-overview';const h=document.createElement('h3');h.textContent=s.title;const p=document.createElement('p');p.textContent=s.overview??s.description??'';const c=document.createElement('p');c.textContent=s.conditions?`适用条件：${s.conditions}`:'';const a=document.createElement('a');a.textContent=`关联实验 ${s.relatedScene??'01'}${s.pages?` · 课件第 ${s.pages} 页`:''}`;a.href=`?scene=${s.relatedScene??'01'}`;a.onclick=e=>{e.preventDefault();selectScene(s.relatedScene??'01');};d.append(h,p,c,a);return d;}));
}
try{
 if(!chapterId)throw new Error('章节路径不正确');({chapter,scenes}=await import(`./chapters/ch${chapterId}.mjs`));renderSections();updateTeacher();selectScene(new URLSearchParams(location.search).get('scene')??'01');
 $('teacher').onclick=()=>{teacher=!teacher;updateTeacher();};$('seed').onchange=compute;$('reset').onclick=()=>selectScene(scene.id);$('cancel').onclick=()=>{clearTimeout(debounce);task++;stopPlay();stopWorker();setState('cancelled','已取消，可调整参数或复位重新运行。');};
 $('stage').onchange=()=>{stopPlay();changeStage(Number($('stage').value));};$('next').onclick=()=>{stopPlay();changeStage(stageIndex+1);};$('previous').onclick=()=>{stopPlay();changeStage(stageIndex-1);};
 $('play').onclick=()=>{if(timer){stopPlay();return;}if(!result)return;if(stageIndex>=result.stages.length-1)changeStage(0);$('play').textContent='暂停播放';$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>{const r=comparing?baseline:result;if(stageIndex>=r.stages.length-1)stopPlay();else changeStage(stageIndex+1);},900);};
 $('baseline').onclick=()=>{if(!result||document.body.dataset.state!=='ready')return;baseline=structuredClone(result);$('compare').disabled=false;setText('status','当前计算已保存为对照；可修改参数后查看差异。');};
 $('compare').onclick=()=>{if(!baseline||!result)return;stopPlay();comparing=!comparing;$('compare').setAttribute('aria-pressed',String(comparing));$('compare').textContent=comparing?'返回当前':'查看对照';const r=comparing?baseline:result;$('stage').replaceChildren(...r.stages.map((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}. ${s.label}`;return o;}));changeStage(r.stages.length-1);setText('status',comparing?`对照结果 · 种子 ${baseline.run.seed} · 参数 ${JSON.stringify(baseline.run.params)}`:'当前计算结果');};
 $('upload').onchange=()=>upload($('upload').files[0]);$('clear-input').onclick=()=>{input=null;inputName='';$('upload').value='';setText('input-note','');compute();};
 $('export-json').onclick=()=>{const r=comparing?baseline:result;if(!r)return;download(new Blob([JSON.stringify(toPortable({schema:'vision-course-lab.v1',source:scene.source,stage:stageIndex,comparison:comparing,...r}),null,2)],{type:'application/json'}),`chapter-${chapterId}-scene-${scene.id}.json`);};
 $('export-png').onclick=()=>{const r=comparing?baseline:result;if(!r)return;const c=document.createElement('canvas');c.width=1920;c.height=660;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#24466c';ctx.font='28px "Microsoft YaHei",sans-serif';ctx.fillText(`${chapter.title} · ${scene.title}${comparing?' · 对照':''}`,30,45);for(let i=0;i<3;i++){ctx.drawImage($(`view-${i}`),i*640,75);ctx.font='20px "Microsoft YaHei",sans-serif';ctx.fillText($(`caption-${i}`).textContent.slice(0,30),i*640+20,570);}ctx.font='16px "Microsoft YaHei",sans-serif';ctx.fillText(`种子 ${r.run.seed} · 参数 ${JSON.stringify(r.run.params)} · 阶段 ${r.stages[stageIndex]?.label??''}`,30,620);c.toBlob(b=>download(b,`chapter-${chapterId}-scene-${scene.id}.png`));};
 $('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);setText('status','实验链接已复制。');}catch{setText('status',`实验链接：${location.href}`);}};
 for(let i=0;i<3;i++){const canvas=$(`view-${i}`);let drag=null;canvas.onpointerdown=e=>{if(canvas.dataset.kind!=='surface')return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;rotations[i].yaw+=(e.clientX-drag[0])*.012;rotations[i].pitch=Math.max(.15,Math.min(1.45,rotations[i].pitch+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];show();};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onkeydown=e=>{if(canvas.dataset.kind!=='surface')return;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();rotations[i].yaw+=(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0);rotations[i].pitch=Math.max(.15,Math.min(1.45,rotations[i].pitch+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0)));show();};}
 addEventListener('popstate',()=>{teacher=new URLSearchParams(location.search).get('teacher')==='1';updateTeacher();selectScene(new URLSearchParams(location.search).get('scene')??'01');});
}catch(e){setState('error',e.message);}
