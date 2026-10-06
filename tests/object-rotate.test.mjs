import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const { RotationDial, normalizeRotation }=await import('../lib/habitat/object-rotate.ts');
const { emptyProject, entity, updateEntity, worldPoint, localPoint, ProjectSchema }=await import('../lib/habitat/domain.ts');
const at=degrees=>({x:64*Math.cos(degrees*Math.PI/180),y:64*Math.sin(degrees*Math.PI/180)});
test('dial preserves a click, ignores its center and supports snapped or free angles',()=>{
  const dial=new RotationDial({x:0,y:0},at(0),17.3);
  assert.equal(dial.move(at(.1),true),17.3);assert.equal(dial.move({x:0,y:0},true),null);
  assert.equal(dial.move({x:NaN,y:0},false),null);
  assert.equal(dial.move(at(28),true),345);assert.equal(dial.move(at(28),false),349.3);
  assert.equal(normalizeRotation(-90),270);assert.equal(normalizeRotation(450),90);
});
test('angle wrap and complete revolutions remain continuous',()=>{
  const dial=new RotationDial({x:0,y:0},at(170),0);
  assert.equal(dial.move(at(-170),false),340);
  assert.equal(dial.move(at(-80),false),250);
  assert.equal(dial.move(at(10),false),160);
  assert.equal(dial.move(at(100),false),70);
  assert.equal(dial.move(at(170),false),0);
});
test('rotating a wall preserves hosted openings and imported product dimensions',()=>{
  const p=emptyProject(),f=p.floors[0].id,wall=entity('wall',f,4,5,{w:8,rotation:30});
  const pos=worldPoint(wall,2,0),door=entity('door',f,pos.x,pos.z,{hostId:wall.id,rotation:30});
  const fridge=entity('fridge',f,8,9,{w:.622,h:1.847,d:.724,product:{url:'https://shop.example.com/fridge',dimensions:{w:.622,h:1.847,d:.724},measurementSource:'manual',evidence:[]}});
  p.entities.push(wall,door,fridge);
  const next=updateEntity(p,wall.id,{rotation:135}),opening=next.entities.find(e=>e.id===door.id);
  assert.equal(ProjectSchema.safeParse(next).success,true);assert.equal(opening.rotation,135);
  const local=localPoint(next.entities[0],opening.x,opening.z);assert.ok(Math.abs(local.x-2)<1e-8);assert.ok(Math.abs(local.z)<1e-8);
  const rotated=updateEntity(next,fridge.id,{rotation:73.2}).entities.find(e=>e.id===fridge.id);
  assert.deepEqual(rotated,{...fridge,rotation:73.2});assert.equal(p.entities[0].rotation,30);
});
