import { CONTRACTS, cameraPoseError } from './contracts.js';
export function acceptCalibrationView(view,history=[]){if(!view?.quad||!view?.imageSizePx)return {accepted:false,reason:'INVALID_QUAD'}; if(history.length&&Math.abs((view.tilt||0)-(history.at(-1).tilt||0))<.03&&Math.abs((view.coverage||0)-(history.at(-1).coverage||0))<.05)return {accepted:false,reason:'INSUFFICIENT_VIEW_DIVERSITY'};return {accepted:true,view};}
export function calibrationReady(views){return Array.isArray(views)&&views.length>=8;}
export function exportCalibration(result){return JSON.stringify({...result,schema:CONTRACTS.calibrationSchema,version:1});}
export function importCalibration(text){try{const v=JSON.parse(text);if(v.schema!==CONTRACTS.calibrationSchema||v.version!==1)throw 0;return v;}catch{throw cameraPoseError('INVALID_CALIBRATION_FILE');}}
