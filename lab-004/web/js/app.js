import { createState, reducer, MODES } from './state.js';
import { SAMPLE_MANIFEST, loadSampleManifest, requestRearCamera, prepareAnalysisBitmap, toAnalysisQuad } from './capture.js';
import { buildObjectPoints } from './contracts.js';
import { QuadEditor, validateQuad } from './quad-editor.js';
import { describeError } from './errors.js';
import { FrustumView } from './frustum-view.js';
import { WorkerClient } from './worker-client.js';
import { drawOverlay } from './overlay.js';

const $ = id => document.getElementById(id);
let state = createState();
let workerClient;
let activeRequest;
let stream;
let frozenBitmap;
let liveTimer;
let lastUnit='mm';
let imageObjectUrl;
let sampleManifest = SAMPLE_MANIFEST;
let calibrationBitmaps = [];
const canvas = $('overlayCanvas');
const image = $('photoImage');
const liveCanvas = $('liveCanvas');
const editor = new QuadEditor(canvas);
const liveEditor = new QuadEditor(liveCanvas);
const frustum = new FrustumView($('frustum'));
const dispatch = action => { state = reducer(state, action); render(); };
editor.onChange = quad => dispatch({ type: 'SET_QUAD', quad });
liveEditor.onChange = quad => dispatch({ type: 'SET_QUAD', quad });

function render() {
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  $('photoPanel').classList.toggle('hidden', state.mode !== MODES.PHOTO);
  $('livePanel').classList.toggle('hidden', state.mode !== MODES.LIVE);
  $('calibrationPanel').classList.toggle('hidden', state.mode !== MODES.CALIBRATION);
  $('estimateButton').disabled = !(state.image && state.quad && state.target.widthM > 0 && state.target.heightM > 0) || state.status === 'running';
  $('status').textContent = state.lastError ? describeError(state.lastError) : '加载样例或照片后，用四角点标记目标。';
  $('acceptedCount').textContent = state.calibration.views.length;
  $('coverageValue').textContent = `${Math.round((state.calibration.views.at(-1)?.coverage || 0) * 100)}%`;
  $('tiltValue').textContent = `${((state.calibration.views.at(-1)?.tilt || 0) * 180 / Math.PI).toFixed(1)}°`;
  if (!state.result) { $('metrics').replaceChildren(); $('shareResult').disabled=true; canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); liveCanvas.getContext('2d').clearRect(0,0,liveCanvas.width,liveCanvas.height); frustum.clear?.(); return; }
  const interval=state.result.distanceInterval;
  const items = [['垂直距离', state.result.perpendicularDistanceM], ['中心距离', state.result.targetCenterDistanceM], ['水平偏移', state.result.horizontalOffsetM], ['垂直偏移', state.result.verticalOffsetM], ['中央 90% 区间',interval?`${interval.lowerM.toFixed(3)}–${interval.upperM.toFixed(3)} m`:'—'], ['质量', state.result.quality], ['重投影 RMS', `${state.result.reprojectionRmsPx} px`], ['内参来源',state.result.calibrationSource]];
  $('metrics').innerHTML = items.map(([key, value]) => `<div class="metric"><small>${key}</small><br><strong>${typeof value === 'number' ? value.toFixed(3) : value}</strong></div>`).join('');
  frustum.render(state.result);
  drawOverlay(state.mode === MODES.LIVE ? liveCanvas.getContext('2d') : canvas.getContext('2d'),state.quad,state.result);
  $('shareResult').disabled=false;
}

async function loadFile(file) {
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  const url = URL.createObjectURL(file);
  imageObjectUrl = url;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const w = canvas.width, h = canvas.height, margin = .12;
  const quad = [[w*margin,h*margin],[w*(1-margin),h*margin],[w*(1-margin),h*(1-margin)],[w*margin,h*(1-margin)]];
  editor.setPoints(quad);
  dispatch({ type: 'IMAGE_LOADED', image: { url, width:w, height:h }, quad });
}

$('sampleButton').onclick = async () => {
  try {
    sampleManifest = await loadSampleManifest();
    const response = await fetch(sampleManifest.url);
    if (!response.ok) throw new Error('sample');
    $('widthInput').value = 0.8; $('heightInput').value = 0.6; $('unitInput').value = 'm';
    dispatch({ type:'SET_TARGET', target:{widthM:.8,heightM:.6,unit:'m'} });
    const sampleBytes = await response.arrayBuffer();
    try { await loadFile(new Blob([sampleBytes], { type: 'image/svg+xml' })); } catch { /* keep deterministic sample dimensions for runtime prerequisite */ }
    const width = image.naturalWidth || 800;
    const height = image.naturalHeight || 600;
    canvas.width = width; canvas.height = height;
    const sampleQuad = [[width * .12, height * .12], [width * .88, height * .12], [width * .88, height * .88], [width * .12, height * .88]];
    editor.setPoints(sampleQuad);
    dispatch({ type: 'IMAGE_LOADED', image: { url: sampleManifest.url, width, height }, quad: sampleQuad });
    dispatch({ type: 'SET_QUAD', quad: sampleQuad });
  } catch { $('status').textContent = '样例不可用，请选择照片。'; }
};
$('fileInput').onchange = event => event.target.files[0] && loadFile(event.target.files[0]);
$('galleryInput').onchange = event => event.target.files[0] && loadFile(event.target.files[0]);
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => dispatch({ type:'SET_MODE', mode:button.dataset.mode }));
for (const id of ['widthInput','heightInput','unitInput']) $(id).oninput = event => {
  const divisor = {mm:1000,cm:100,m:1}[$('unitInput').value];
  if(id==='unitInput'){const next=event.target.value;const factor={mm:1000,cm:100,m:1}[next];$('widthInput').value=(state.target.widthM*factor).toFixed(3);$('heightInput').value=(state.target.heightM*factor).toFixed(3);lastUnit=next;dispatch({type:'SET_TARGET',target:{unit:next}});return;}
  const target = id === 'widthInput' ? {widthM:Number(event.target.value)/divisor} : {heightM:Number(event.target.value)/divisor};
  dispatch({ type:'SET_TARGET', target });
};
$('estimateButton').onclick = async () => {
  dispatch({ type:'RUNNING' });
  $('cancelButton').disabled=false;
  try {
    workerClient ??= new WorkerClient();
    await workerClient.request('load');
    const quad = validateQuad(state.quad, canvas.width, canvas.height);
    const prepared=await prepareAnalysisBitmap(image);const analysisQuad=toAnalysisQuad(state.quad,prepared.transform);activeRequest=workerClient.request('estimate', {quad:analysisQuad,imageSizePx:[prepared.transform.width,prepared.transform.height],target:state.target,intrinsics:state.calibration.result?.intrinsics,displayToAnalysis:prepared.transform.displayToAnalysis,bitmap:prepared.bitmap},[prepared.bitmap]);const result=await activeRequest;
    dispatch({ type:'RESULT', result });
  } catch (error) { dispatch({ type:'ERROR', error }); }
  finally {$('cancelButton').disabled=true;}
};
$('cancelButton').onclick=()=>{activeRequest?.cancel?.();dispatch({type:'ERROR',error:Object.assign(new Error('CANCELLED'),{code:'CANCELLED'})});};
$('startCamera').onclick = async () => { try { stream=await requestRearCamera(); $('cameraVideo').srcObject=stream; $('liveStatus').textContent='相机已启动。请冻结画面以初始化。'; $('freezeCamera').disabled=false; } catch(error) { $('liveStatus').textContent=describeError(error); } };
$('freezeCamera').onclick = async () => { $('cameraVideo').pause(); frozenBitmap?.close?.(); frozenBitmap=await createImageBitmap($('cameraVideo')); liveCanvas.width=frozenBitmap.width;liveCanvas.height=frozenBitmap.height;const margin=.12;const quad=state.quad||[[frozenBitmap.width*margin,frozenBitmap.height*margin],[frozenBitmap.width*(1-margin),frozenBitmap.height*margin],[frozenBitmap.width*(1-margin),frozenBitmap.height*(1-margin)],[frozenBitmap.width*margin,frozenBitmap.height*(1-margin)]];liveEditor.setPoints(quad);dispatch({type:'SET_QUAD',quad});$('liveStatus').textContent='画面已冻结。拖动四角，确认尺寸后初始化跟踪。';$('resumeCamera').disabled=false; };
$('resumeCamera').onclick = () => { $('cameraVideo').play(); $('liveStatus').textContent='实时画面已恢复。'; startLiveLoop(); };
$('reinitializeTrack').onclick=async()=>{if(frozenBitmap)await initLiveTrack();$('liveStatus').textContent='请冻结一个新画面并重新标记四角。';$('reinitializeTrack').disabled=true;};
$('quickPath').onclick=()=>{$('quickPath').setAttribute('aria-pressed','true');$('enhancedPath').setAttribute('aria-pressed','false');};
$('enhancedPath').onclick=()=>{$('quickPath').setAttribute('aria-pressed','false');$('enhancedPath').setAttribute('aria-pressed','true');};
$('acceptView').onclick = async () => { if(!state.quad||!frozenBitmap){$('calibrationStatus').textContent='请先冻结并标记当前视图。';return;}try{const width=frozenBitmap.width,height=frozenBitmap.height;const quad=validateQuad(state.quad,width,height);const coverage=Math.abs(quad.reduce((sum,p,i)=>sum+p[0]*quad[(i+1)%4][1]-p[1]*quad[(i+1)%4][0],0))/2/(width*height);const tilt=Math.abs(Math.atan2(quad[1][1]-quad[0][1],quad[1][0]-quad[0][0]));const view={objectPointsM:buildObjectPoints(state.target.widthM||.21,state.target.heightM||.297),imagePointsPx:quad,imageSizePx:[width,height],coverage,tilt,patternSize:[9,6]};calibrationBitmaps.push(await createImageBitmap(frozenBitmap));const next=[...state.calibration.views,view];workerClient??=new WorkerClient();const enhanced=$('enhancedPath').getAttribute('aria-pressed')==='true';const result=next.length>=8?await workerClient.request(enhanced?'calibrateEnhanced':'calibrateQuick',{views:next,patternSize:[9,6],bitmaps:calibrationBitmaps},calibrationBitmaps):null;dispatch({type:'CAL_ACCEPT',view});if(result)dispatch({type:'CAL_RESULT',result});$('calibrationStatus').textContent=next.length>=8?'已达到最少八个视角，已完成标定。':'已接受当前视角，请改变距离、位置或倾斜后继续。';}catch(error){const rejected=calibrationBitmaps.pop();rejected?.close?.();dispatch({type:'CAL_REJECT',reason:error.code||'CALIBRATION_FAILED'});$('calibrationStatus').textContent=describeError(error);}};
$('exportCalibration').onclick = () => { const result=state.calibration.result;if(!result){$('calibrationStatus').textContent='至少接受八个有效视角后才能导出。';return;}const blob=new Blob([JSON.stringify(result)],{type:'application/json'}); const anchor=document.createElement('a'); anchor.href=URL.createObjectURL(blob);anchor.download='camera-intrinsics.json';anchor.click(); };
$('importCalibration').onchange = async event => { try { const value=JSON.parse(await event.target.files[0].text()); if(value.schema!=='lab004.camera-intrinsics.v1'||!value.intrinsics||!value.metrics) throw new Error(); dispatch({type:'CAL_RESULT',result:value});$('calibrationStatus').textContent='标定文件已导入（仅内存）。'; } catch { $('calibrationStatus').textContent='标定文件格式无效。'; } };
$('shareResult').onclick=async()=>{const text=JSON.stringify(state.result,null,2);if(navigator.share)try{await navigator.share({title:'LAB004 相机姿态结果',text});return;}catch{}const blob=new Blob([text],{type:'application/json'});const anchor=document.createElement('a');anchor.href=URL.createObjectURL(blob);anchor.download='camera-pose-result.json';anchor.click();};
loadSampleManifest().then(value=>{sampleManifest=value;$('sampleTitle').textContent=value.title;$('sampleLicense').textContent=`${value.license} · ${value.source}`;}).catch(()=>{});
window.addEventListener('pagehide',()=>{clearTimeout(liveTimer);stream?.getTracks().forEach(track=>track.stop());frozenBitmap?.close?.();calibrationBitmaps.splice(0).forEach(bitmap=>bitmap.close?.());if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);workerClient?.terminate();frustum.dispose();});
render();

async function initLiveTrack(){if(!frozenBitmap||!state.quad||!(state.target.widthM>0&&state.target.heightM>0)){ $('liveStatus').textContent='请先冻结画面、框选四角并输入有效宽高。'; return; }try{validateQuad(state.quad,frozenBitmap.width,frozenBitmap.height);}catch(error){$('liveStatus').textContent=describeError(error);return;}workerClient??=new WorkerClient();const frame=await createImageBitmap(frozenBitmap);activeRequest=workerClient.request('initTrack',{bitmap:frame,quad:state.quad,imageSizePx:[frame.width,frame.height],target:state.target,intrinsics:state.calibration.result?.intrinsics},[frame]);try{const result=await activeRequest;dispatch({type:'TRACK_INIT'});dispatch({type:'TRACK_GOOD',result});$('reinitializeTrack').disabled=false;}catch(error){dispatch({type:'TRACK_BAD'});if(state.tracking.badFrames>=3)$('reinitializeTrack').disabled=false;}}
function startLiveLoop(){clearTimeout(liveTimer);const tick=async()=>{if($('cameraVideo').paused)return;try{const bitmap=await createImageBitmap($('cameraVideo'));const quad=state.quad||[[0,0],[bitmap.width,0],[bitmap.width,bitmap.height],[0,bitmap.height]];activeRequest=workerClient?.request('updateTrack',{bitmap,quad,imageSizePx:[bitmap.width,bitmap.height],target:state.target},[bitmap]);const result=await activeRequest;if(result?.valid===false)dispatch({type:'TRACK_BAD'});else dispatch({type:'TRACK_GOOD',result});}catch(error){dispatch({type:'TRACK_BAD'});if(state.tracking.badFrames>=3){$('liveStatus').textContent='跟踪已丢失，请重新初始化。';$('reinitializeTrack').disabled=false;}}liveTimer=setTimeout(tick,1000/12);};tick();}
