import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const { MoveGesture, entityMovePosition }=await import('../lib/habitat/object-move.ts');
const { emptyProject, entity, updateEntity, localPoint, worldPoint, ProjectSchema }=await import('../lib/habitat/domain.ts');
const pointer=(patch={})=>({pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:100,clientY:100,altKey:false,ctrlKey:false,shiftKey:false,metaKey:false,...patch});

test('a quick drag navigates while click/jitter can wait for the hold',()=>{
  const g=new MoveGesture();assert.equal(g.begin(pointer()),true);
  assert.equal(g.move(pointer({clientX:104})), 'hold');
  assert.equal(g.move(pointer({clientX:120})), 'navigate');g.end();
  assert.equal(g.activate(1),false);
  g.begin(pointer());g.end(1);assert.equal(g.activate(1),false);
});
test('only an unmodified primary left press owns movement, and cancel resets it',()=>{
  const g=new MoveGesture();
  for(const p of [{button:2},{isPrimary:false},{shiftKey:true},{ctrlKey:true},{metaKey:true},{altKey:true}])assert.equal(g.begin(pointer(p)),false);
  g.begin(pointer());assert.equal(g.activate(2),false);assert.equal(g.activate(1),true);
  assert.equal(g.move(pointer({clientX:900})), 'move');assert.equal(g.move(pointer({pointerId:2})),null);
  assert.equal(g.end(2),false);assert.equal(g.move(pointer({buttons:0})), 'cancel');g.end();
  assert.equal(g.phase,null);assert.equal(g.begin(pointer({clientX:900})),true);
  assert.equal(g.move(pointer({clientX:901})), 'hold');
  g.end();g.begin(pointer({pointerType:'touch',buttons:0}));g.activate(1);
  assert.equal(g.move(pointer({pointerType:'touch',buttons:0,clientX:150})), 'move');
});
test('moves retain sizes/product identity, snap optionally, and keep valid bounds',()=>{
  const p=emptyProject(),f=p.floors[0].id;
  const e=entity('fridge',f,0,0,{w:.622,h:1.847,d:.724,product:{url:'https://shop.example.com/fridge',dimensions:{w:.622,h:1.847,d:.724},measurementSource:'manual',evidence:[]}});p.entities.push(e);
  assert.deepEqual(entityMovePosition(p,e.id,{x:1.13,z:-2.36},true),{x:1.25,z:-2.25});
  assert.deepEqual(entityMovePosition(p,e.id,{x:1.13,z:-2.36},false),{x:1.13,z:-2.36});
  assert.deepEqual(entityMovePosition(p,e.id,{x:900,z:-900},true),{x:150,z:-150});
  assert.equal(entityMovePosition(p,e.id,{x:NaN,z:0},true),null);
  const next=updateEntity(p,e.id,{x:1.25,z:-2.25});assert.equal(ProjectSchema.safeParse(next).success,true);
  assert.deepEqual(next.entities[0].product,e.product);assert.equal(next.entities[0].h,1.847);assert.equal(p.entities[0].x,0);
});
test('doors slide along rotated walls, clamp at edges and refuse overlapping windows',()=>{
  const p=emptyProject(),f=p.floors[0].id,wall=entity('wall',f,4,5,{w:8,rotation:90});
  const door=entity('door',f,4,5,{hostId:wall.id,rotation:90}),pos=worldPoint(wall,2,0),window=entity('window',f,pos.x,pos.z,{w:1,hostId:wall.id,rotation:90});p.entities.push(wall,door,window);
  const point=worldPoint(wall,-1.12,3),next=entityMovePosition(p,door.id,point,true);
  assert.ok(Math.abs(localPoint(wall,next.x,next.z).x+1)<1e-8);assert.ok(Math.abs(localPoint(wall,next.x,next.z).z)<1e-8);
  assert.equal(entityMovePosition(p,door.id,pos,true),null);
  const edge=entityMovePosition(p,door.id,worldPoint(wall,-100,0),true);
  assert.ok(Math.abs(localPoint(wall,edge.x,edge.z).x+3.42)<1e-8);
  const moved=updateEntity(p,wall.id,{x:8,z:9});assert.deepEqual(moved.entities.find(e=>e.id===door.id),{...door,x:8,z:9});
});
