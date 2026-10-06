import test from 'node:test';
import assert from 'node:assert/strict';
import {geometricScenes,runGeometric} from '../web/scenes/geometric.mjs';

test('localization no-signal preset is available and rejects unidentifiable position',()=>{
  assert.ok(geometricScenes['05'].presets.some(([id])=>id==='flat'));
  assert.throws(()=>runGeometric({scene:'05',w:480,h:300,seed:42,options:{preset:'flat',phase:31.4,width:2,'sample-noise':5,background:30,trials:8}}),/平坦剖面.*对比度/);
});
