const chapter=document.body.dataset.chapter,scene=document.body.dataset.scene;
import {chapters} from './real/catalog.mjs';
const definition=chapters[chapter].scenes.find(s=>s.id===scene);
document.title=`${definition.title} · 独立实验`;
for(const [id,value] of [['chapter-name',`${chapter} · ${chapters[chapter].title}`],['title',definition.title],['goal',definition.goal],['source',`课程关联：第 ${definition.pages} 页`],['observation',definition.task],['eyebrow','INDEPENDENT REAL EXPERIMENT']])document.getElementById(id).textContent=value;
document.getElementById('scene-nav').remove();
let teacher=new URLSearchParams(location.search).get('teacher')==='1';
function updateTeacher(){document.getElementById('teacher-panel').hidden=!teacher;document.getElementById('teacher').setAttribute('aria-pressed',String(teacher));}
document.getElementById('teacher').onclick=()=>{teacher=!teacher;updateTeacher()};updateTeacher();
const group=chapter==='005'&&scene==='02'?'geometry':chapter==='007'||chapter==='008'?'models':'perception';
document.getElementById('real-panel').hidden=false;
try{const module=await import(`./real/${group}.mjs`);const cleanup=await module.mount(document.getElementById('real-host'),{chapter,scene,example:true});document.body.dataset.state='ready';addEventListener('pagehide',()=>cleanup?.(),{once:true});}
catch(e){document.body.dataset.state='error';const p=document.createElement('p');p.className='real-error';p.textContent=`实验加载失败：${e.message}`;document.getElementById('real-host').append(p);}
