import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSIFT} from '../web/algorithms/sift.mjs';
import {transformImage} from '../web/algorithms/corners.mjs';
import {matchDescriptors} from '../web/algorithms/matching.mjs';
import {seededRandom} from '../web/algorithms/numerics.mjs';

test('end to end SIFT matches independently predicted rotated and scaled feature coordinates',()=>{
  // Numerical fixture only: explicit synthetic data, not a public photograph.
  const random=seededRandom(19),spots=Array.from({length:50},()=>[50+random()*156,50+random()*156,1.5+random()*3,50+random()*130]);
  const input=Float32Array.from({length:256*256},(_,i)=>{
    const x=i%256,y=Math.floor(i/256);let value=20;
    for(const [cx,cy,sigma,amplitude]of spots)value+=amplitude*Math.exp(-((x-cx)**2+(y-cy)**2)/(2*sigma*sigma));
    return Math.min(255,value);
  });
  const original=extractSIFT(input,256,256,{contrast:2,maxFeatures:500});
  for(const change of [{angle:30,scale:1},{angle:0,scale:1.3},{angle:30,scale:1.3}]){
    const image=transformImage(input,256,256,change);
    const changed=extractSIFT(image.pixels,256,256,{contrast:2,maxFeatures:500});
    const pairs=matchDescriptors(original.keypoints.map(p=>p.descriptor),changed.keypoints.map(p=>p.descriptor),{ratio:.75}).mutual;
    const angle=change.angle*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    // Prediction uses the independently specified centered similarity, not image.map.
    const errors=pairs.map(pair=>{
      const p=original.keypoints[pair.query],q=changed.keypoints[pair.train],x=p.imageX-127.5,y=p.imageY-127.5;
      const predictedX=127.5+change.scale*(cos*x-sin*y),predictedY=127.5+change.scale*(sin*x+cos*y);
      return Math.hypot(predictedX-q.imageX,predictedY-q.imageY);
    }).sort((a,b)=>a-b);
    assert.ok(pairs.length>=20,`insufficient correspondences for ${JSON.stringify(change)}`);
    assert.ok(errors.filter(error=>error<2).length/pairs.length>=.8,'descriptors must match known geometric locations, not arbitrary features');
    assert.ok(errors[Math.floor(errors.length/2)]<.5,'median known-transform correspondence error must stay subpixel on this fixture');
  }
});
