import {openRealLab} from './real/entry.mjs';
import {chapters,resolveScene} from './real/catalog.mjs';
const $=id=>document.getElementById(id),chapterId=location.pathname.match(/chapter-(00[4-8])/ )?.[1];
let selection=0,teacher=new URLSearchParams(location.search).get('teacher')==='1';
function updateTeacher(){ $('teacher').setAttribute('aria-pressed',String(teacher));$('teacher-panel').hidden=!teacher;const url=new URL(location.href);if(teacher)url.searchParams.set('teacher','1');else url.searchParams.delete('teacher');history.replaceState({},'',url);}
async function selectScene(requested){
const ticket=++selection,chapter=chapters[chapterId],scene=resolveScene(chapterId,requested);
const url=new URL(location.href);url.searchParams.set('scene',scene.id);history.replaceState({},'',url);
document.title=`${scene.title} · ${chapter.title} · Vision Hub`;
$('chapter-name').textContent=`${chapterId} · ${chapter.title}`;$('title').textContent=scene.title;$('goal').textContent=scene.goal;$('source').textContent=`课程关联：第 ${scene.pages} 页`;$('observation').textContent=scene.task;
$('eyebrow').textContent='REAL IMAGE EXPERIMENT';document.body.dataset.state='loading';
$('scene-nav').replaceChildren(...chapter.scenes.map(s=>{const a=document.createElement('a');a.href=`?scene=${s.id}${teacher?'&teacher=1':''}`;a.textContent=`${s.id} ${s.title}`;if(s.id===scene.id)a.setAttribute('aria-current','page');a.onclick=e=>{e.preventDefault();selectScene(s.id);};return a;}));
const ok=await openRealLab(chapterId,scene.id);if(ticket===selection)document.body.dataset.state=ok?'ready':'error';
}
try{updateTeacher();await selectScene(new URLSearchParams(location.search).get('scene'));$('teacher').onclick=()=>{teacher=!teacher;updateTeacher();};addEventListener('popstate',()=>{teacher=new URLSearchParams(location.search).get('teacher')==='1';updateTeacher();selectScene(new URLSearchParams(location.search).get('scene'));});}catch(e){document.body.dataset.state='error';$('title').textContent=e.message;}
