import test from 'node:test';
import assert from 'node:assert/strict';
import {snakeEnergy,evolveSnake} from '../web/algorithms/snake.mjs';
import {runGeometric} from '../web/scenes/geometric.mjs';

test('closed discrete snake energy agrees with hand calculated square',()=>{
  const points=[[3,3],[5,3],[5,5],[3,5]],field=new Float32Array(100);
  assert.equal(snakeEnergy(points,field,10,10,{alpha:1,beta:1,gamma:0}),48);
});
test('coordinate descent follows a real attractive image potential with nonincreasing energy',()=>{
  const w=80,h=80,field=Float32Array.from({length:w*h},(_,i)=>(Math.hypot(i%w-40,Math.floor(i/w)-40)-20)**2);
  const points=Array.from({length:24},(_,i)=>[40+25*Math.cos(i*Math.PI/12),40+25*Math.sin(i*Math.PI/12)]);
  const result=evolveSnake(points,field,w,h,{alpha:.01,beta:.05,gamma:2,step:1,iterations:40});
  const error=p=>p.reduce((s,[x,y])=>s+Math.abs(Math.hypot(x-40,y-40)-20),0)/p.length;
  assert.ok(error(result.points)<error(points));
  assert.ok(result.trace.length>1);
  for(let i=1;i<result.trace.length;i++)assert.ok(result.trace[i].energy<=result.trace[i-1].energy+1e-8);
  assert.deepEqual(result,evolveSnake(points,field,w,h,{alpha:.01,beta:.05,gamma:2,step:1,iterations:40}));
});
test('flat potential and zero internal weights stop without fictional movement',()=>{
  const points=[[10,10],[20,10],[20,20],[10,20]];
  const result=evolveSnake(points,new Float32Array(900),30,30,{alpha:0,beta:0,gamma:1});
  assert.deepEqual(result.points,points);assert.match(result.reason,/局部/);
  assert.throws(()=>evolveSnake(points,new Float32Array(900),30,30,{step:0}),/步长/);
});
test('scene exposes genuine image-derived force, contour iterations and measured energy',()=>{
  const result=runGeometric({scene:'06',w:160,h:120,options:{preset:'clear','snake-alpha':.02,'snake-beta':.2,'snake-force':400,'snake-step':1,'snake-iterations':60,'snake-offset':0}}).result;
  assert.ok(result.snake.trace.length>2);
  assert.ok(result.snake.trace.at(-1).energy<result.snake.trace[0].energy);
  assert.notDeepEqual(result.contour,result.snake.points);
  assert.equal(result.stages.length,result.snake.trace.length+1);
});
