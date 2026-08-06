import { createState, reducer, MODES } from './state.js';
import { SAMPLE_MANIFEST, requestRearCamera } from './capture.js';
import { QuadEditor, validateQuad } from './quad-editor.js';
import { describeError } from './errors.js';
import { FrustumView } from './frustum-view.js';
import { WorkerClient } from './worker-client.js';
import { drawOverlay } from './overlay.js';

const $ = id => document.getElementById(id);
let state = createState();
let workerClient;
let stream;
const canvas = $('overlayCanvas');
const image = $('photoImage');
const editor = new QuadEditor(canvas);
const frustum = new FrustumView($('frustum'));
const dispatch = action => { state = reducer(state, action); render(); };
editor.onChange = quad => dispatch({ type: 'SET_QUAD', quad });

function render() {
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  $('photoPanel').classList.toggle('hidden', state.mode !== MODES.PHOTO);
  $('livePanel').classList.toggle('hidden', state.mode !== MODES.LIVE);
  $('calibrationPanel').classList.toggle('hidden', state.mode !== MODES.CALIBRATION);
  $('estimateButton').disabled = !(state.image && state.quad && state.target.widthM > 0 && state.target.heightM > 0) || state.status === 'running';
  $('status').textContent = state.lastError ? describeError(state.lastError) : '加载样例或照片后，用四角点标记目标。';
  $('acceptedCount').textContent = state.calibration.views.length;
  if (!state.result) { $('metrics').replaceChildren(); $('shareResult').disabled=true; return; }
  const interval=state.result.distanceInterval;
  const items = [['垂直距离', state.result.perpendicularDistanceM], ['中心距离', state.result.targetCenterDistanceM], ['水平偏移', state.result.horizontalOffsetM], ['垂直偏移', state.result.verticalOffsetM], ['中央 90% 区间',interval?`${interval.lowerM.toFixed(3)}–${interval.upperM.toFixed(3)} m`:'—'], ['质量', state.result.quality], ['重投影 RMS', `${state.result.reprojectionRmsPx} px`], ['内参来源',state.result.calibrationSource]];
  $('metrics').innerHTML = items.map(([key, value]) => `<div class="metric"><small>${key}</small><br><strong>${typeof value === 'number' ? value.toFixed(3) : value}</strong></div>`).join('');
  frustum.render(state.result);
  drawOverlay(canvas.getContext('2d'),state.quad,state.result);
  $('shareResult').disabled=false;
}

async function loadFile(file) {
  const url = URL.createObjectURL(file);
  image.src = url;
  await image.decode();
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const w = canvas.width, h = canvas.height, margin = .12;
  const quad = [[w*margin,h*margin],[w*(1-margin),h*margin],[w*(1-margin),h*(1-margin)],[w*margin,h*(1-margin)]];
  editor.setPoints(quad);
  dispatch({ type: 'IMAGE_LOADED', image: { url, width:w, height:h }, quad });
}

$('sampleButton').onclick = async () => {
  try {
    const response = await fetch(SAMPLE_MANIFEST.url);
    if (!response.ok) throw new Error('sample');
    $('widthInput').value = 800; $('heightInput').value = 600;
    dispatch({ type:'SET_TARGET', target:{widthM:.8,heightM:.6,unit:'mm'} });
    await loadFile(await response.blob());
  } catch { $('status').textContent = '样例不可用，请选择照片。'; }
};
$('fileInput').onchange = event => event.target.files[0] && loadFile(event.target.files[0]);
$('galleryInput').onchange = event => event.target.files[0] && loadFile(event.target.files[0]);
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => dispatch({ type:'SET_MODE', mode:button.dataset.mode }));
for (const id of ['widthInput','heightInput','unitInput']) $(id).oninput = event => {
  const divisor = {mm:1000,cm:100,m:1}[$('unitInput').value];
  const target = id === 'widthInput' ? {widthM:Number(event.target.value)/divisor} : id === 'heightInput' ? {heightM:Number(event.target.value)/divisor} : {unit:event.target.value};
  dispatch({ type:'SET_TARGET', target });
};
$('estimateButton').onclick = async () => {
  dispatch({ type:'RUNNING' });
  $('cancelButton').disabled=false;
  try {
    workerClient ??= new WorkerClient();
    await workerClient.request('load');
    const quad = validateQuad(state.quad, canvas.width, canvas.height);
    const result=await workerClient.request('estimate', {quad,imageSizePx:[canvas.width,canvas.height],target:state.target});
    dispatch({ type:'RESULT', result });
  } catch (error) { dispatch({ type:'ERROR', error }); }
  finally {$('cancelButton').disabled=true;}
};
$('cancelButton').onclick=()=>{workerClient?.terminate();workerClient=null;dispatch({type:'ERROR',error:Object.assign(new Error('CANCELLED'),{code:'CANCELLED'})});};
$('startCamera').onclick = async () => { try { stream=await requestRearCamera(); $('cameraVideo').srcObject=stream; $('liveStatus').textContent='相机已启动。请冻结画面以初始化。'; $('freezeCamera').disabled=false; } catch(error) { $('liveStatus').textContent=describeError(error); } };
$('freezeCamera').onclick = () => { $('liveStatus').textContent='画面已冻结。'; $('resumeCamera').disabled=false; };
$('resumeCamera').onclick = () => { $('liveStatus').textContent='实时画面已恢复。'; };
$('reinitializeTrack').onclick=()=>{$('liveStatus').textContent='请冻结一个新画面并重新标记四角。';$('reinitializeTrack').disabled=true;};
$('quickPath').onclick=()=>{$('quickPath').setAttribute('aria-pressed','true');$('enhancedPath').setAttribute('aria-pressed','false');};
$('enhancedPath').onclick=()=>{$('quickPath').setAttribute('aria-pressed','false');$('enhancedPath').setAttribute('aria-pressed','true');};
$('acceptView').onclick = () => { if (state.quad) dispatch({type:'CAL_ACCEPT',view:{quad:state.quad,imageSizePx:[canvas.width,canvas.height],coverage:.5,tilt:state.calibration.views.length*.1}}); $('calibrationStatus').textContent=state.calibration.views.length>=8?'已达到最少八个视角。':'请改变距离、位置和倾斜后继续。'; };
$('exportCalibration').onclick = () => { const blob=new Blob([JSON.stringify({schema:'lab004.camera-intrinsics.v1',version:1,views:state.calibration.views})],{type:'application/json'}); const anchor=document.createElement('a'); anchor.href=URL.createObjectURL(blob);anchor.download='camera-intrinsics.json';anchor.click(); };
$('importCalibration').onchange = async event => { try { const value=JSON.parse(await event.target.files[0].text()); if(value.schema!=='lab004.camera-intrinsics.v1') throw new Error(); $('calibrationStatus').textContent='标定文件已导入（仅内存）。'; } catch { $('calibrationStatus').textContent='标定文件格式无效。'; } };
$('shareResult').onclick=async()=>{const text=JSON.stringify(state.result,null,2);if(navigator.share)try{await navigator.share({title:'LAB004 相机姿态结果',text});return;}catch{}const blob=new Blob([text],{type:'application/json'});const anchor=document.createElement('a');anchor.href=URL.createObjectURL(blob);anchor.download='camera-pose-result.json';anchor.click();};
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(track=>track.stop());workerClient?.terminate();frustum.dispose();});
render();
