import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const d=await import('../lib/habitat/domain.ts');
const l=await import('../lib/habitat/lighting.ts');
const {reachableSwitch}=await import('../lib/habitat/light-interaction.ts');
const {makeModel,disposeObject}=await import('../lib/habitat/models.ts');
const THREE=await import('three');

test('installation is idempotent and preserves existing projects, openings and per-floor circuits',()=>{
  for(const original of [d.createHouse(),d.createBuilding(2)]){
    const before=JSON.stringify(original),p=l.installRoomLighting(original),rooms=p.entities.filter(l.isLitRoom);
    assert.equal(JSON.stringify(original),before);assert.equal(d.ProjectSchema.safeParse(p).success,true);
    assert.equal(p.entities.filter(e=>e.kind==='ceilingLight').length,rooms.length);
    assert.equal(p.entities.filter(e=>e.kind==='lightSwitch').length,rooms.length);
    assert.equal(l.installRoomLighting(p),p);
    for(const wall of original.entities.filter(e=>e.kind==='wall'))assert.deepEqual(d.wallSections(wall,original.entities),d.wallSections(wall,p.entities));
    for(const sw of p.entities.filter(e=>e.kind==='lightSwitch')){assert.equal(sw.floorId,p.entities.find(e=>e.id===sw.roomId).floorId);const wall=p.entities.find(e=>e.id===sw.switchWallId),local=d.localPoint(wall,sw.x,sw.z);assert.ok(Math.abs(Math.abs(local.z)-(wall.d/2+.027))<1e-6);}
    assert.deepEqual(d.ProjectSchema.parse(JSON.parse(JSON.stringify(p))),p);
  }
});
test('switches change only their room, keep walking geometry, and control ceiling and floor lights',()=>{
  const p=l.installRoomLighting(d.createHouse()),sw=p.entities.find(e=>e.kind==='lightSwitch'),room=p.entities.find(e=>e.id===sw.roomId),other=p.entities.find(e=>l.isLitRoom(e)&&e.id!==room.id);
  p.entities.push(d.entity('lamp',room.floorId,room.x+1,room.z,{roomId:room.id}));
  const off=l.toggleLight(p,sw.id);assert.equal(l.lightSettings(off.entities.find(e=>e.id===room.id)).on,false);assert.equal(l.lightSettings(other).on,true);assert.equal(l.sameWalkGeometry(p,off),true);
  assert.ok(l.lightSources(off,room.floorId).filter(e=>e.roomId===room.id).every(e=>!e.on));
  assert.ok(l.lightSources(off,room.floorId).some(e=>e.roomId===other.id&&e.on));
  assert.ok(l.lightSources(l.toggleLight(off,sw.id),room.floorId).filter(e=>e.roomId===room.id).every(e=>e.on));
  const settings=d.updateEntity(off,room.id,{light:{on:true,intensity:.65,color:'#fff0dd'}});
  assert.ok(l.lightSources(settings,room.floorId).filter(e=>e.roomId===room.id).every(e=>e.intensity===.65&&e.color==='#fff0dd'));
  assert.equal(l.sameWalkGeometry(p,d.updateEntity(p,room.id,{x:room.x+1})),false);
  const lamp=off.entities.find(e=>e.kind==='lamp'&&e.roomId===room.id),model=makeModel(lamp,off.entities);assert.ok(model.children.filter(o=>o instanceof THREE.Mesh).every(o=>o.material.emissive.getHex()===0||o.material.emissiveIntensity===0));disposeObject(model);
});
test('duplicated floors remap switches and fixtures, wall transforms preserve attachment, deletion cleans references',()=>{
  const p=l.installRoomLighting(d.createBuilding(1)),sw=p.entities.find(e=>e.kind==='lightSwitch'),wall=p.entities.find(e=>e.id===sw.switchWallId),offset=d.localPoint(wall,sw.x,sw.z);
  const moved=d.updateEntity(p,wall.id,{x:wall.x+1,z:wall.z+2,rotation:wall.rotation+90}),newWall=moved.entities.find(e=>e.id===wall.id),newSwitch=moved.entities.find(e=>e.id===sw.id),local=d.localPoint(newWall,newSwitch.x,newSwitch.z);
  assert.ok(Math.abs(local.x-offset.x)<1e-6&&Math.abs(local.z-offset.z)<1e-6);assert.equal(d.ProjectSchema.safeParse(moved).success,true);
  const copy=d.duplicateFloor(p,p.floors[0].id).project;assert.equal(d.ProjectSchema.safeParse(copy).success,true);
  for(const item of copy.entities.filter(e=>e.floorId!==p.floors[0].id&&e.roomId))assert.equal(copy.entities.find(e=>e.id===item.roomId).floorId,item.floorId);
  assert.equal(d.ProjectSchema.safeParse(d.removeEntity(p,sw.roomId)).success,true);assert.equal(d.removeEntity(p,wall.id).entities.some(e=>e.id===sw.id),false);
  assert.equal(d.ProjectSchema.safeParse(d.updateEntity(p,sw.id,{roomId:'missing'})).success,false);
  assert.equal(d.ProjectSchema.safeParse(d.updateEntity(p,sw.roomId,{light:{on:true,intensity:3,color:'#fff000'}})).success,false);
});
test('physical switch targeting requires a clear line of sight and a distance of at most 2.5 meters',()=>{
  const p=d.emptyProject(),room=d.entity('room',p.floors[0].id,0,0),sw=d.entity('lightSwitch',room.floorId,0,0,{roomId:room.id,y:1.1});p.entities.push(room,sw);
  const model=makeModel(sw,p.entities);model.position.set(0,1.1,0);model.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(45,1,.05,100);camera.position.set(0,1.165,2);camera.lookAt(0,1.165,0);camera.updateMatrixWorld(true);
  assert.equal(reachableSwitch(p,[model],camera)?.id,sw.id);
  camera.position.z=3;camera.updateMatrixWorld(true);assert.equal(reachableSwitch(p,[model],camera),null);
  camera.position.z=2;camera.updateMatrixWorld(true);
  const wall=d.entity('wall',room.floorId,0,1,{w:2,h:2.8}),obstacle=makeModel(wall,[wall]);obstacle.position.set(0,0,1);obstacle.updateMatrixWorld(true);assert.equal(reachableSwitch(p,[obstacle,model],camera),null);
  const unlinked={...p,entities:p.entities.map(e=>e.id===sw.id?{...e,roomId:undefined}:e)};assert.equal(reachableSwitch(unlinked,[model],camera),null);
  disposeObject(model);disposeObject(obstacle);
});
