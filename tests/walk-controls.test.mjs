import test from 'node:test';
import assert from 'node:assert/strict';
import { WalkLook, normalizeLookSensitivity } from '../lib/habitat/walk-controls.ts';

const pointer = (overrides={}) => ({pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:100,clientY:100,...overrides});

test('hover and movement after release never rotate the walking camera',()=>{
  const look=new WalkLook();
  assert.equal(look.move(pointer({clientX:200,buttons:0}),1),null);
  assert.equal(look.begin(pointer()),true);
  assert.deepEqual(look.move(pointer({clientX:150,clientY:125}),1),{yaw:.1,pitch:.05});
  assert.equal(look.end(1),true);
  assert.equal(look.move(pointer({clientX:300}),1),null);
  assert.equal(look.pointerId,null);
});

test('only the primary left button can start and own a drag',()=>{
  const look=new WalkLook();
  assert.equal(look.begin(pointer({button:2,buttons:2})),false);
  assert.equal(look.begin(pointer({isPrimary:false})),false);
  assert.equal(look.begin(pointer()),true);
  assert.equal(look.begin(pointer({pointerId:2})),false);
  assert.equal(look.move(pointer({pointerId:2,clientX:200}),1),null);
  assert.equal(look.end(2),false);
  assert.equal(look.move(pointer({clientX:200,buttons:0}),1),null);
  assert.deepEqual(look.move(pointer({clientX:150}),1),{yaw:.1,pitch:0});
});

test('cancel/blur reset the drag and the next press establishes a fresh origin',()=>{
  const look=new WalkLook();look.begin(pointer());look.end();
  assert.equal(look.move(pointer({clientX:900}),1),null);
  look.begin(pointer({clientX:900,clientY:800}));
  assert.deepEqual(look.move(pointer({clientX:910,clientY:790}),1),{yaw:.02,pitch:-.02});
});

test('sensitivity changes scale a continuous drag without a jump',()=>{
  const look=new WalkLook();look.begin(pointer());
  assert.deepEqual(look.move(pointer({clientX:150}),.5),{yaw:.05,pitch:0});
  assert.deepEqual(look.move(pointer({clientX:200}),2),{yaw:.2,pitch:0});
  assert.equal(normalizeLookSensitivity(NaN),1);
  assert.equal(normalizeLookSensitivity(Infinity),1);
  assert.equal(normalizeLookSensitivity(0),.25);
  assert.equal(normalizeLookSensitivity(10),2);
});

test('touch look requires an active drag and stops when that finger is lifted',()=>{
  const look=new WalkLook(),touch=pointer({pointerType:'touch',buttons:0});
  assert.equal(look.move(touch,1),null);assert.equal(look.begin(touch),true);
  assert.deepEqual(look.move({...touch,clientX:150},1),{yaw:.2,pitch:0});
  look.end(touch.pointerId);assert.equal(look.move({...touch,clientX:200},1),null);
});
