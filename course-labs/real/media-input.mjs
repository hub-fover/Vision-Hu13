export const orderedFiles=files=>[...files].sort((a,b)=>new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare(a.name,b.name));
export function pixels(source,time=0){
 const originalWidth=source.videoWidth||source.naturalWidth,originalHeight=source.videoHeight||source.naturalHeight;
 if(!originalWidth||!originalHeight)throw Error('媒体尚未解码');if(originalWidth*originalHeight>24000000)throw Error('图像超过 2400 万像素');
 const scale=Math.min(1,384/originalWidth,288/originalHeight),width=Math.round(originalWidth*scale),height=Math.round(originalHeight*scale);
 if(width<64||height<64)throw Error('图像短边须至少 64 像素');const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,width,height);
 return {width,height,originalWidth,originalHeight,time,data:ctx.getImageData(0,0,width,height).data};
}
function event(target,name,signal,timeout=15000){return new Promise((resolve,reject)=>{
 const clean=()=>{clearTimeout(timer);target.removeEventListener(name,ok);target.removeEventListener('error',bad);signal?.removeEventListener('abort',abort)};
 const ok=()=>{clean();resolve()},bad=()=>{clean();reject(Error('媒体解码失败；请换用浏览器支持的 MP4(H.264) 或 WebM'))},abort=()=>{clean();reject(new DOMException('已取消','AbortError'))};
 const timer=setTimeout(()=>{clean();reject(Error('媒体加载超时'))},timeout);target.addEventListener(name,ok,{once:true});target.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
});}
export async function imageFrame(url,time,signal){const img=new Image();const ready=event(img,'load',signal);img.src=url;await ready;return pixels(img,time);}
export async function imageSequence(files,{fps=5,limit=80,signal,progress=()=>{}}={}){
 const sorted=orderedFiles(files);if(sorted.length<2||sorted.length>120)throw Error('请选择 2–120 张连续图片');if(sorted.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>16*1024*1024))throw Error('图片须为 PNG/JPEG/WebP，每张不超过 16 MiB');
 const frames=[];for(const [i,file] of sorted.slice(0,limit).entries()){if(signal?.aborted)throw new DOMException('已取消','AbortError');const url=URL.createObjectURL(file);try{const f=await imageFrame(url,i/fps,signal);if(frames[0]&&(f.originalWidth!==frames[0].originalWidth||f.originalHeight!==frames[0].originalHeight))throw Error('连续图片原始尺寸必须一致');frames.push(f)}finally{URL.revokeObjectURL(url)}progress(frames.length,Math.min(limit,sorted.length));}
 return {frames,names:sorted.slice(0,limit).map(f=>f.name),kind:'images',fps,timeBasis:'按用户设置的图片帧率'};
}
export async function videoSequence(file,{fps=5,limit=80,signal,progress=()=>{}}={}){
 if(file.size>150*1024*1024)throw Error('视频不能超过 150 MiB');const url=URL.createObjectURL(file),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';
 try{const ready=event(v,'loadeddata',signal);v.src=url;v.load();await ready;if(!Number.isFinite(v.duration)||v.duration<=0)throw Error('视频时长不可读取');const frames=[],count=Math.min(limit,Math.ceil(v.duration*fps));if(count<2)throw Error('视频过短，请提高采样帧率');
  for(let i=0;i<count;i++){const time=i/fps;if(signal?.aborted)throw new DOMException('已取消','AbortError');if(Math.abs(v.currentTime-time)>.00001){const seek=event(v,'seeked',signal);v.currentTime=time;await seek}frames.push(pixels(v,time));progress(i+1,count)}
  return {frames,names:[file.name],kind:'video',fps,duration:v.duration,timeBasis:'视频时间戳',truncated:count===limit&&v.duration*fps>limit};
 }finally{v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url)}
}
export async function cameraStream(facing='environment'){
 if(!window.isSecureContext)throw Error('相机需要 HTTPS 页面');if(!navigator.mediaDevices?.getUserMedia)throw Error('当前浏览器不支持相机，请用系统 Chrome / Safari 打开');
 try{return await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}}})}
 catch(e){throw Error(e.name==='NotAllowedError'?'未获得相机权限；请在浏览器设置中允许此网站使用相机':e.name==='NotFoundError'?'未找到摄像头':e.name==='NotReadableError'?'相机被其他应用占用':`相机启动失败：${e.message}`)}
}
