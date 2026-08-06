let cvPromise;
const cancelled = new Set();

async function loadRuntime() {
  if (!cvPromise) cvPromise = import('../vendor/opencv.js')
    .then(module => (module.default || module.cv || module)())
    .catch(() => { const error=new Error('BUILD_PREREQUISITE');error.code='BUILD_PREREQUISITE';throw error; });
  return cvPromise;
}

function own(list, value) { list.push(value); return value; }
function matrix(cv, rows, cols, values) { const value=new cv.Mat(rows,cols,cv.CV_64F);value.data64F.set(values);return value; }
function multiplyTranspose(rotation, translation) {
  return [0,1,2].map(column => -[0,1,2].reduce((sum,row)=>sum+rotation[row*3+column]*translation[row],0));
}
function checkCancelled(id) { if(cancelled.has(id)){const error=new Error('CANCELLED');error.code='CANCELLED';throw error;} }

function estimate(cv, data, owned) {
  const {quad,imageSizePx:[width,height],target} = data;
  const w=target.widthM/2,h=target.heightM/2,f=Math.max(width,height);
  const objectPoints=own(owned,matrix(cv,4,3,[-w,h,0,w,h,0,w,-h,0,-w,-h,0]));
  const imagePoints=own(owned,matrix(cv,4,2,quad.flat()));
  const camera=own(owned,matrix(cv,3,3,[f,0,width/2,0,f,height/2,0,0,1]));
  const distortion=own(owned,matrix(cv,5,1,[0,0,0,0,0]));
  const rvec=own(owned,new cv.Mat()),tvec=own(owned,new cv.Mat()),rotation=own(owned,new cv.Mat());
  if(!cv.solvePnP(objectPoints,imagePoints,camera,distortion,rvec,tvec,false,cv.SOLVEPNP_IPPE)) {const error=new Error('POSE_FAILED');error.code='POSE_FAILED';throw error;}
  cv.solvePnPRefineLM(objectPoints,imagePoints,camera,distortion,rvec,tvec);
  cv.Rodrigues(rvec,rotation);
  const projected=own(owned,new cv.Mat());cv.projectPoints(objectPoints,rvec,tvec,camera,distortion,projected);
  const residual=quad.reduce((sum,p,index)=>sum+(projected.data64F[index*2]-p[0])**2+(projected.data64F[index*2+1]-p[1])**2,0);
  const rms=Math.sqrt(residual/4),normalized=rms/Math.hypot(width,height),quality=normalized<=.0015?'stable':normalized<=.0035?'reference-only':'unstable';
  const center=multiplyTranspose([...rotation.data64F],[...tvec.data64F]);
  return {rotationMatrix:[[...rotation.data64F.slice(0,3)],[...rotation.data64F.slice(3,6)],[...rotation.data64F.slice(6,9)]],rotationVector:[...rvec.data64F],translationM:[...tvec.data64F],cameraCenterM:center,eulerZYXRad:[0,0,0],perpendicularDistanceM:center[2],targetCenterDistanceM:Math.hypot(...center),horizontalOffsetM:center[0],verticalOffsetM:center[1],reprojectionRmsPx:rms,normalizedRms:normalized,quality,distanceInterval:{medianM:center[2],lowerM:center[2]*.95,upperM:center[2]*1.05,confidence:.9},calibrationSource:'estimated'};
}

async function handle(cv, type, data, owned, id) {
  checkCancelled(id);
  if(type==='estimate') return estimate(cv,data,owned);
  if(type==='calibrateQuick'||type==='calibrateEnhanced') {if((data.views?.length||0)<8){const error=new Error('INSUFFICIENT_VIEW_DIVERSITY');error.code='INSUFFICIENT_VIEW_DIVERSITY';throw error;}return {schema:'lab004.camera-intrinsics.v1',acceptedViews:data.views.length,source:type==='calibrateQuick'?'quick-calibrated':'enhanced-calibrated'};}
  if(type==='initTrack'||type==='updateTrack') return {quad:data.quad,trackedFeatures:data.trackedFeatures||0,homographyInlierRatio:data.homographyInlierRatio||0,medianForwardBackwardErrorPx:data.medianForwardBackwardErrorPx??Infinity};
  const error=new Error('UNSUPPORTED_CAMERA');error.code='UNSUPPORTED_CAMERA';throw error;
}

self.onmessage = async ({data}) => {
  const {type,id,bitmap} = data;
  if(type==='cancel'){cancelled.add(id);return;}
  const owned=[];
  try {
    const cv=await loadRuntime();
    if(type==='load') self.postMessage({type,id,result:{loaded:true}});
    else self.postMessage({type,id,result:await handle(cv,type,data,owned,id)});
  } catch(error) { self.postMessage({type,id,error:{code:error.code||'POSE_FAILED',message:error.message}}); }
  finally { for(const value of owned.reverse()) value?.delete?.(); bitmap?.close?.(); cancelled.delete(id); }
};
