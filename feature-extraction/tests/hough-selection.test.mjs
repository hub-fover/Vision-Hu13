import test from 'node:test';
import assert from 'node:assert/strict';
import {runGeometric} from '../web/scenes/geometric.mjs';

test('霍夫选中零票格子时，提示描述选中模型而非最高峰',()=>{
  for(const preset of ['line','circle']){
    const {result}=runGeometric({scene:'07',w:100,h:80,points:[[10,10],[10,20],[20,10]],selectedPeak:{theta:0,rho:0},selectedCenter:[0,0],options:{preset,gap:0,'point-noise':0,resolution:1,'theta-bins':180,radius:30,'gradient-constraint':'no'}});
    assert.match(result.observation,/选中/);
    assert.match(result.observation,/0 票/);
    if(preset==='line')assert.match(result.observation,/ρ=0\.0/);
    else assert.match(result.observation,/\(0, 0\)/);
  }
});
