export function normalizeParams(controls,params={}) {
 const output={};
 for(const c of controls){const v=Number(params[c.key]??c.value);if(!Number.isFinite(v))throw new Error('参数必须为有限数值');output[c.key]=Math.max(c.min,Math.min(c.max,v));}
 return output;
}
export function validateInput(input){
 if(!input)return null;
 const {width,height,data}=input;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>96||height>96||!data||data.length!==width*height)throw new Error('图像分析尺寸不正确');
 for(const x of data)if(!Number.isFinite(x)||x<0||x>1)throw new Error('图像像素必须在 0 到 1 之间');
 return input;
}
function finiteTree(value,seen=new Set()){
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('计算结果含非有限数值，请调整参数');
 if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const v of Object.values(value))finiteTree(v,seen);}
}
export function checkResult(result){
 if(!result?.views||result.views.length!==3)throw new Error('实验必须输出三个视图');
 if(!result.stages?.length)throw new Error('实验未输出实际计算阶段');
 for(const stage of result.stages)if(stage.views?.length!==3)throw new Error('阶段必须输出三个视图');
 finiteTree(result);return result;
}
export function toPortable(value){
 if(ArrayBuffer.isView(value))return Array.from(value);
 if(Array.isArray(value))return value.map(toPortable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,toPortable(v)]));
 return value;
}
