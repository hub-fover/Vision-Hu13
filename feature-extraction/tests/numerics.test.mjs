import test from 'node:test';
import assert from 'node:assert/strict';
import { derivatives, gaussianKernel, integralImage, rectangleSum, seededRandom } from '../web/algorithms/numerics.mjs';

test('constant has zero derivatives, including reflected boundaries', () => {
  const result = derivatives(new Float64Array(9).fill(12));
  assert.ok(result.first.every(x => x === 0));
  assert.ok(result.second.every(x => x === 0));
});
test('central derivatives preserve interior ramp and quadratic curvature', () => {
  const ramp = derivatives(Float64Array.from({length:9}, (_, i) => 3*i+2));
  assert.equal(ramp.first[4], 3);
  assert.equal(ramp.second[4], 0);
  const quadratic = derivatives(Float64Array.from({length:9}, (_, i) => i*i));
  assert.equal(quadratic.second[4], 2);
});
test('Gaussian is normalized, symmetric, and rejects invalid sigma', () => {
  const kernel = gaussianKernel(1.4);
  assert.ok(Math.abs(kernel.reduce((a,b) => a+b, 0)-1) < 1e-12);
  assert.deepEqual([...kernel], [...kernel].reverse());
  assert.throws(() => gaussianKernel(-1), /sigma/);
});
test('integral image agrees with direct sum for every nonempty rectangle', () => {
  const pixels = Float64Array.from({length:20}, (_, i) => i+1);
  const table = integralImage(pixels, 5, 4);
  for(let y0=0;y0<4;y0++) for(let x0=0;x0<5;x0++)
    for(let y1=y0+1;y1<=4;y1++) for(let x1=x0+1;x1<=5;x1++) {
      let expected=0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) expected+=pixels[y*5+x];
      assert.equal(rectangleSum(table,5,4,x0,y0,x1,y1),expected);
    }
  assert.throws(() => rectangleSum(table,5,4,-1,0,2,2), /rectangle/);
});
test('seeded trials repeat and remain in [0,1)', () => {
  const first=seededRandom(42), second=seededRandom(42);
  for(let i=0;i<100;i++) {const a=first(); assert.equal(a,second()); assert.ok(a>=0&&a<1);}
});
