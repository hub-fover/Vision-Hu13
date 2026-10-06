// Read-only runtime capability probe; never changes the existing LAB build.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import vm from 'node:vm';
const path=resolve(process.argv[2]||'D:/Vision-Hu13/opencv-build/output/opencv.js');
const module={exports:{}},require=createRequire(path);
const context={module,exports:module.exports,require,__filename:path,__dirname:dirname(path),console,process,Buffer,setTimeout,clearTimeout,WebAssembly,TextDecoder,TextEncoder,performance};
vm.runInNewContext(readFileSync(path,'utf8'),context,{filename:path});
const started=Date.now();
while(!module.exports.Mat){if(Date.now()-started>20000)throw new Error('OpenCV initialization exceeded 20s');await new Promise(r=>setTimeout(r,50));}
const cv=module.exports;
console.log(JSON.stringify({build:path,Mat:typeof cv.Mat,SIFT:typeof cv.SIFT,SIFT_create:typeof cv.SIFT_create,ORB:typeof cv.ORB,version:cv.getBuildInformation?.().match(/OpenCV [^\n]+/)?.[0]},null,2));
if(typeof cv.SIFT==='function'||typeof cv.SIFT_create==='function'){
  const sift=cv.SIFT_create?cv.SIFT_create():new cv.SIFT(),image=new cv.Mat(128,128,cv.CV_8UC1),mask=new cv.Mat(),keypoints=new cv.KeyPointVector(),descriptors=new cv.Mat();
  try{
    for(let y=0;y<128;y++)for(let x=0;x<128;x++)image.data[y*128+x]=Math.hypot(x-64,y-64)<15?230:20;
    sift.detectAndCompute(image,mask,keypoints,descriptors);
    console.log(JSON.stringify({keypoints:keypoints.size(),descriptorRows:descriptors.rows,descriptorCols:descriptors.cols}));
  }finally{descriptors.delete();keypoints.delete();mask.delete();image.delete();sift.delete();}
}
