export async function requestRearCamera(){if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error('PERMISSION_DENIED'),{code:'PERMISSION_DENIED'});try{return await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},frameRate:{ideal:30,max:30}},audio:false});}catch(error){throw Object.assign(new Error(error.name==='NotAllowedError'?'PERMISSION_DENIED':'UNSUPPORTED_FORMAT'),{code:error.name==='NotAllowedError'?'PERMISSION_DENIED':'UNSUPPORTED_FORMAT'});}}
export function fileToUrl(file){return URL.createObjectURL(file);}
export function sortImageFiles(files){return [...files].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}));}
export async function loadImageFile(file){const url=fileToUrl(file),image=new Image();image.src=url;try{await image.decode();return {url,image,width:image.naturalWidth,height:image.naturalHeight};}catch(error){URL.revokeObjectURL(url);throw error;}}

function drawContain(source,width=640,height=360){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#10252d';ctx.fillRect(0,0,width,height);const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height,scale=Math.min(width/sw,height/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(source,(width-dw)/2,(height-dh)/2,dw,dh);return canvas;}
export async function imageFrame(file,width=640,height=360){const loaded=await loadImageFile(file);return {canvas:drawContain(loaded.image,width,height),url:loaded.url,source:file.name};}
function waitFor(element,event){return new Promise((resolve,reject)=>{const onEvent=()=>{cleanup();resolve();},onError=()=>{cleanup();reject(new Error('DECODE_FAILED'));},cleanup=()=>{element.removeEventListener(event,onEvent);element.removeEventListener('error',onError);};element.addEventListener(event,onEvent,{once:true});element.addEventListener('error',onError,{once:true});});}
export async function videoFrames(file,{maxFrames=150,width=640,height=360,onProgress=()=>{},shouldCancel=()=>false}={}){const url=fileToUrl(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;try{const metadata=waitFor(video,'loadedmetadata');video.src=url;await metadata;if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('DECODE_FAILED');const sourceFps=30;const expectedCount=Math.max(2,Math.round(video.duration*sourceFps)||2);const count=Math.min(maxFrames,expectedCount),frames=[];for(let index=0;index<count;index++){if(shouldCancel())throw Object.assign(new Error('CANCELLED'),{code:'CANCELLED'});const timeS=video.duration*(index/(count-1));const seek=waitFor(video,'seeked');video.currentTime=timeS;await seek;frames.push({canvas:drawContain(video,width,height),source:file.name,timeS});onProgress((index+1)/count);}return {frames,fps:(count-1)/video.duration||30,url,sourceDurationS:video.duration,sampled:count<expectedCount};}catch(error){URL.revokeObjectURL(url);if(error?.code==='CANCELLED')throw error;throw Object.assign(new Error('DECODE_FAILED'),{code:'DECODE_FAILED'});}}
export async function captureLiveFrames(video,{durationMs=4000,maxFrames=150,width=640,height=360,onProgress=()=>{},onFrame=()=>{},shouldCancel=()=>false}={}){if(!video||video.readyState<2||!video.videoWidth)throw Object.assign(new Error('INVALID_FRAME'),{code:'INVALID_FRAME'});const frames=[];const start=performance.now();let lastCapture=-Infinity;return new Promise((resolve,reject)=>{const tick=(now)=>{if(shouldCancel()){reject(Object.assign(new Error('CANCELLED'),{code:'CANCELLED'}));return;}if(now-lastCapture>=1000/30||!frames.length){const frame={canvas:drawContain(video,width,height),source:'camera',timeS:(now-start)/1000};frames.push(frame);lastCapture=now;onProgress(Math.min(1,(now-start)/durationMs));onFrame(frame,{index:frames.length-1,elapsedS:frame.timeS});}if(now-start>=durationMs||frames.length>=maxFrames){const elapsed=Math.max((now-start)/1000,1/30);resolve({frames,fps:(frames.length-1)/elapsed||30});return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);});}
function gray(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height).data,output=new Float32Array(canvas.width*canvas.height);for(let i=0,p=0;i<output.length;i++,p+=4)output[i]=.299*data[p]+.587*data[p+1]+.114*data[p+2];return output;}
function patchError(a,b,width,height,dx,dy,roi,step=3){let total=0,count=0;const x0=Math.max(4,Math.floor(roi.x)+4),x1=Math.min(width-4,Math.ceil(roi.x+roi.width)-4),y0=Math.max(4,Math.floor(roi.y)+4),y1=Math.min(height-4,Math.ceil(roi.y+roi.height)-4);for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){const bx=Math.max(0,Math.min(width-1,x+dx)),by=Math.max(0,Math.min(height-1,y+dy));total+=Math.abs(a[y*width+x]-b[by*width+bx]);count++;}return count?total/count:Infinity;}
function findPatchOffset(previous,current,width,height,roi){let best={error:Infinity,dx:0,dy:0};for(let dy=-12;dy<=12;dy+=3)for(let dx=-12;dx<=12;dx+=3){const error=patchError(previous,current,width,height,dx,dy,roi,6);if(error<best.error)best={error,dx,dy};}const coarse=best;for(let dy=coarse.dy-2;dy<=coarse.dy+2;dy++)for(let dx=coarse.dx-2;dx<=coarse.dx+2;dx++){const error=patchError(previous,current,width,height,dx,dy,roi,3);if(error<best.error)best={error,dx,dy};}return best;}
function backgroundAnchors(width,height,roi){const size=56, candidates=[[12,12],[width-size-12,12],[12,height-size-12],[width-size-12,height-size-12]];return candidates.filter(([x,y])=>x+size<roi.x||x>roi.x+roi.width||y+size<roi.y||y>roi.y+roi.height).map(([x,y])=>({x,y,width:size,height:size}));}
function estimateBackgroundShift(previous,current,width,height,roi){const anchors=backgroundAnchors(width,height,roi);if(anchors.length<2)return {trackable:false,drift:Infinity};const shifts=[];for(const anchor of anchors){const values=[];for(let y=anchor.y;y<anchor.y+anchor.height;y+=2)for(let x=anchor.x;x<anchor.x+anchor.width;x+=2)values.push(previous[y*width+x]);const mean=values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/Math.max(1,values.length);if(variance<12)continue;let best={error:Infinity,dx:0,dy:0};for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const error=patchError(previous,current,width,height,dx,dy,anchor);if(error<best.error)best={error,dx,dy};}if(Number.isFinite(best.error))shifts.push([best.dx,best.dy]);}if(shifts.length<2)return {trackable:false,drift:Infinity};const median=(values)=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];return {trackable:true,drift:Math.hypot(median(shifts.map((shift)=>shift[0])),median(shifts.map((shift)=>shift[1])))};}
export function motionFromFrames(frames,roi,fps=30,{detectCameraDrift=false}={}){if(!Array.isArray(frames)||frames.length<2)throw Object.assign(new Error('INVALID_FRAME'),{code:'INVALID_FRAME'});const width=frames[0].canvas.width,height=frames[0].canvas.height,scaleX=width/640,scaleY=height/360,scaled={x:roi.x*scaleX,y:roi.y*scaleY,width:roi.width*scaleX,height:roi.height*scaleY};const referenceGray=gray(frames[0].canvas);let previous=referenceGray,offsetX=0,offsetY=0;const motions=[{offsetX:0,offsetY:0,score:1,timeS:Number.isFinite(frames[0].timeS)?frames[0].timeS:0,cameraStable:true,backgroundTrackable:true}];for(let i=1;i<frames.length;i++){const current=gray(frames[i].canvas);const best=findPatchOffset(previous,current,width,height,scaled);offsetX+=best.dx/scaleX;offsetY+=best.dy/scaleY;const background=detectCameraDrift?estimateBackgroundShift(referenceGray,current,width,height,scaled):{trackable:true,drift:0};const cameraStable=background.trackable&&background.drift<=1.5;motions.push({offsetX,offsetY,score:cameraStable?Math.max(0,1-best.error/80):0,timeS:Number.isFinite(frames[i].timeS)?frames[i].timeS:i/fps,cameraStable,backgroundTrackable:background.trackable,cameraDriftPx:background.drift,errorCode:!background.trackable?'BACKGROUND_UNTRACKABLE':cameraStable?null:'CAMERA_MOVED'});previous=current;}return motions;}

function featurePoints(grayPixels, width, height, maxFeatures = 120) {
  const candidates = [];
  for (let y = 6; y < height - 6; y += 5) for (let x = 6; x < width - 6; x += 5) {
    const index = y * width + x;
    const gx = grayPixels[index + 2] - grayPixels[index - 2];
    const gy = grayPixels[index + width * 2] - grayPixels[index - width * 2];
    const score = gx * gx + gy * gy;
    if (score > 180) candidates.push({ x, y, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= 10)) {
      selected.push(candidate);
      if (selected.length >= maxFeatures) break;
    }
  }
  return selected;
}

function pointPatchError(previous, current, width, height, point, dx, dy, radius = 3) {
  let total = 0;
  let count = 0;
  for (let oy = -radius; oy <= radius; oy += 1) for (let ox = -radius; ox <= radius; ox += 1) {
    const x = Math.round(point.x + ox);
    const y = Math.round(point.y + oy);
    const tx = Math.round(x + dx);
    const ty = Math.round(y + dy);
    if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1 || tx < 1 || tx >= width - 1 || ty < 1 || ty >= height - 1) continue;
    total += Math.abs(previous[y * width + x] - current[ty * width + tx]);
    count += 1;
  }
  return count ? total / count : Infinity;
}

function trackPoint(previous, current, width, height, point) {
  let best = { error: Infinity, dx: 0, dy: 0 };
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const error = pointPatchError(previous, current, width, height, point, dx, dy);
    if (error < best.error) best = { error, dx, dy };
  }
  const coarse = best;
  for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy += 1) for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx += 1) {
    const error = pointPatchError(previous, current, width, height, point, dx, dy);
    if (error < best.error) best = { error, dx, dy };
  }
  return best;
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-9) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j += 1) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map((row) => row[n]);
}

function affineFromPairs(pairs) {
  if (pairs.length < 3) return null;
  const matrix = [];
  const vector = [];
  pairs.forEach(([from, to]) => {
    matrix.push([from.x, from.y, 1, 0, 0, 0]); vector.push(to.x);
    matrix.push([0, 0, 0, from.x, from.y, 1]); vector.push(to.y);
  });
  const normal = Array.from({ length: 6 }, () => Array(6).fill(0));
  const rhs = Array(6).fill(0);
  for (let row = 0; row < matrix.length; row += 1) for (let column = 0; column < 6; column += 1) {
    rhs[column] += matrix[row][column] * vector[row];
    for (let other = 0; other < 6; other += 1) normal[column][other] += matrix[row][column] * matrix[row][other];
  }
  const values = solveLinear(normal, rhs);
  return values ? { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] } : null;
}

function applyAffine(model, point) {
  return { x: model.a * point.x + model.b * point.y + model.c, y: model.d * point.x + model.e * point.y + model.f };
}

function fitRansac(pairs, threshold = 2) {
  if (pairs.length < 6) return null;
  let seed = 0x12345678;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
  let best = null;
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const picked = [];
    while (picked.length < 3) { const index = Math.floor(random() * pairs.length); if (!picked.includes(index)) picked.push(index); }
    const candidate = affineFromPairs(picked.map((index) => pairs[index]));
    if (!candidate) continue;
    const inliers = pairs.filter(([from, to]) => { const mapped = applyAffine(candidate, from); return Math.hypot(mapped.x - to.x, mapped.y - to.y) <= threshold; });
    if (!best || inliers.length > best.inliers.length) best = { candidate, inliers };
  }
  if (!best || best.inliers.length < 6) return null;
  const refined = affineFromPairs(best.inliers) || best.candidate;
  const errors = best.inliers.map(([from, to]) => { const mapped = applyAffine(refined, from); return Math.hypot(mapped.x - to.x, mapped.y - to.y); });
  return { model: refined, inlierCount: best.inliers.length, inlierRatio: best.inliers.length / pairs.length, medianError: errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)] };
}

/** Moving-phone path: static-scene LK tracks plus deterministic RANSAC affine fit. */
export function motionFromFramesFlowRansac(frames, roi, fps = 30, { maxFeatures = 120, minInlierRatio = 0.6 } = {}) {
  if (!Array.isArray(frames) || frames.length < 2) throw Object.assign(new Error('INVALID_FRAME'), { code: 'INVALID_FRAME' });
  const width = frames[0].canvas.width;
  const height = frames[0].canvas.height;
  const center = { x: roi.x + roi.width / 2, y: roi.y + roi.height / 2 };
  const firstGray = gray(frames[0].canvas);
  let previous = firstGray;
  let cumulative = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 };
  const motions = [{ offsetX: 0, offsetY: 0, score: 1, timeS: Number.isFinite(frames[0].timeS) ? frames[0].timeS : 0, cameraStable: true, backgroundTrackable: true, motionModel: 'lk-ransac-affine', inlierCount: maxFeatures, inlierRatio: 1, medianReprojectionErrorPx: 0 }];
  for (let index = 1; index < frames.length; index += 1) {
    const current = gray(frames[index].canvas);
    const points = featurePoints(previous, width, height, maxFeatures);
    const pairs = [];
    for (const point of points) {
      const forward = trackPoint(previous, current, width, height, point);
      if (!Number.isFinite(forward.error) || forward.error > 45) continue;
      const next = { x: point.x + forward.dx, y: point.y + forward.dy };
      const backward = trackPoint(current, previous, width, height, next);
      if (!Number.isFinite(backward.error) || backward.error > 45 || Math.hypot(backward.dx + forward.dx, backward.dy + forward.dy) > 1.5) continue;
      pairs.push([{ x: point.x, y: point.y }, next]);
    }
    const fitted = fitRansac(pairs, 2);
    if (!fitted || fitted.inlierRatio < minInlierRatio) {
      motions.push({ offsetX: 0, offsetY: 0, score: 0, timeS: Number.isFinite(frames[index].timeS) ? frames[index].timeS : index / fps, cameraStable: true, backgroundTrackable: pairs.length >= 6, motionModel: 'lk-ransac-affine', inlierCount: fitted?.inlierCount || 0, inlierRatio: fitted?.inlierRatio || 0, medianReprojectionErrorPx: fitted?.medianError || 0, errorCode: 'TEMPLATE_LOST' });
      previous = current;
      continue;
    }
    const step = fitted.model;
    cumulative = {
      a: step.a * cumulative.a + step.b * cumulative.d,
      b: step.a * cumulative.b + step.b * cumulative.e,
      c: step.a * cumulative.c + step.b * cumulative.f + step.c,
      d: step.d * cumulative.a + step.e * cumulative.d,
      e: step.d * cumulative.b + step.e * cumulative.e,
      f: step.d * cumulative.c + step.e * cumulative.f + step.f,
    };
    const mapped = applyAffine(cumulative, center);
    const score = Math.max(0, Math.min(1, fitted.inlierRatio * Math.exp(-fitted.medianError / 2)));
    motions.push({ offsetX: mapped.x - center.x, offsetY: mapped.y - center.y, score, timeS: Number.isFinite(frames[index].timeS) ? frames[index].timeS : index / fps, cameraStable: true, backgroundTrackable: true, motionModel: 'lk-ransac-affine', inlierCount: fitted.inlierCount, inlierRatio: fitted.inlierRatio, medianReprojectionErrorPx: fitted.medianError });
    previous = current;
  }
  return motions;
}
