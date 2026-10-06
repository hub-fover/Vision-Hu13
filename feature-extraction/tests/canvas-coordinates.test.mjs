import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasCoordinates} from '../web/algorithms/canvas-coordinates.mjs';

test('contained image coordinates exclude vertical and horizontal letterboxing',()=>{
  const rect={left:10,top:20,width:100,height:100};
  assert.deepEqual(canvasCoordinates(60,45,rect,200,100),[100,0]);
  assert.deepEqual(canvasCoordinates(60,95,rect,200,100),[100,99]);
  assert.deepEqual(canvasCoordinates(35,70,rect,100,200),[0,100]);
  assert.deepEqual(canvasCoordinates(85,70,rect,100,200),[99,100]);
});

test('zoom and pan inversion use image pixels after contain scaling',()=>{
  assert.deepEqual(canvasCoordinates(60,70,{left:10,top:20,width:100,height:100},200,100,{zoom:2,x:20,y:-10}),[90,55]);
});
