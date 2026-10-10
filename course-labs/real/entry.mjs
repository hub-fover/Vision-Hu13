const groups={ '004':'geometry','005':'geometry','006':'perception','007':'models','008':'models' };
let generation=0,cleanup;
export async function openRealLab(chapter,scene){
 const ticket=++generation;cleanup?.();cleanup=null;
 const panel=document.getElementById('real-panel'),host=document.getElementById('real-host');
 panel.hidden=true;host.replaceChildren();
 try{
  const group=chapter==='004'&&scene==='03'?'depth':chapter==='005'&&scene==='03'?'perception':groups[chapter];
  const module=await import(`./${group}.mjs`);
  if(ticket!==generation||!module.available(chapter,scene))return false;
  panel.hidden=false;
  const instance=document.createElement('div');instance.dataset.realInstance=`${chapter}-${scene}`;host.replaceChildren(instance);
  const dispose=await module.mount(instance,{chapter,scene});
  if(ticket!==generation){dispose?.();return false;}else cleanup=dispose;
  return true;
 }catch(error){
  if(ticket!==generation)return;
  panel.hidden=false;const p=document.createElement('p');p.className='real-error';p.textContent=`真实数据实验加载失败：${error.message}。请刷新重试。`;host.replaceChildren(p);return false;
 }
}
