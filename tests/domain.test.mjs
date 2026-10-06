import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectSchema, attachOpening, collides, createBuilding, duplicateFloor, emptyProject, entity, findSpawn, localPoint, movePlayer, removeEntity, roomFromPoints, supportHeight, updateEntity, wallFromPoints, wallSections, worldPoint } from '../lib/habitat/domain.ts';

test('generated buildings serialize with valid references and unique IDs',()=>{
 for(const count of [1,2,8]){
  const p=createBuilding(count);
  assert.equal(ProjectSchema.safeParse(p).success,true);
  assert.equal(p.floors.length,count);
  assert.equal(new Set(p.entities.map(e=>e.id)).size,p.entities.length);
  assert.equal(p.entities.filter(e=>e.kind==='stairs').length,count-1);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))),p);
 }
});
test('rotated walls block passage but real door openings admit a player',()=>{
 for(const rotation of [0,45,90]){
  let p=emptyProject(),f=p.floors[0];const wall=entity('wall',f.id,2,3,{w:5,rotation});p.entities=[wall];
  assert.equal(collides(p,2,3,0),true);
  const door=attachOpening(p,'door',wall.id,{x:2,z:3});assert.ok(door);p.entities.push(door);
  assert.equal(collides(p,2,3,0),false);
  const edge=worldPoint(wall,2,0);assert.equal(collides(p,edge.x,edge.z,0),true);
  const blocked=movePlayer(p,{...worldPoint(wall,2,-1),feet:0},worldPoint(wall,0,3).x-wall.x,worldPoint(wall,0,3).z-wall.z);
  assert.ok(Math.abs(localPoint(wall,blocked.x,blocked.z).z)<1);
 }
});
test('windows remain collision barriers and door placement prevents overlaps',()=>{
 const p=emptyProject(),f=p.floors[0],wall=entity('wall',f.id,0,0,{w:7});p.entities=[wall];
 const window=attachOpening(p,'window',wall.id,{x:0,z:0});assert.ok(window);p.entities.push(window);
 assert.equal(collides(p,0,0,0),true);assert.equal(attachOpening(p,'door',wall.id,{x:0,z:0}),null);
 assert.equal(ProjectSchema.safeParse(p).success,true);
 const sections=wallSections(wall,p.entities);assert.ok(sections.some(s=>s.y<.9));
 assert.ok(sections.some(s=>s.y>2.2));
});
test('moving a wall preserves its hosted opening geometry, deleting it removes openings',()=>{
 let p=emptyProject(),f=p.floors[0],wall=entity('wall',f.id,0,0,{w:6});p.entities=[wall];
 const door=attachOpening(p,'door',wall.id,{x:1,z:0});p.entities.push(door);
 p=updateEntity(p,wall.id,{x:5,z:8,rotation:90});
 const moved=p.entities.find(e=>e.id===door.id);assert.equal(moved.x,5);assert.equal(moved.z,7);assert.equal(moved.rotation,90);
 assert.equal(ProjectSchema.safeParse(p).success,true);
 assert.equal(removeEntity(p,wall.id).entities.length,0);
});
test('stairs support ascent and descent while upper slabs do not teleport the player',()=>{
 const p=createBuilding(3),stairs=p.entities.find(e=>e.kind==='stairs');
 assert.equal(supportHeight(p,5.5,-3,0),0);
 let player={x:0,z:.8,feet:0};
 for(let i=0;i<115;i++)player=movePlayer(p,player,0,.05);
 assert.ok(player.z>6.4);assert.ok(Math.abs(player.feet-3.2)<.02);
 for(let i=0;i<116;i++)player=movePlayer(p,player,0,-.05);
 assert.ok(player.z<1.05);assert.ok(player.feet<.08);
 assert.ok(stairs);
});
test('duplicate floor remaps doors, assigns new units and moves the roof',()=>{
 const original=createBuilding(2),{project,floorId}=duplicateFloor(original,original.floors[0].id);
 assert.equal(ProjectSchema.safeParse(project).success,true);assert.equal(project.floors.length,3);
 assert.equal(project.entities.find(e=>e.kind==='roof').floorId,floorId);
 assert.ok(project.entities.some(e=>e.floorId===floorId&&e.apartment==='Apto 301'));
 assert.equal(original.floors.length,2);
});
test('project validation rejects dangling objects, malformed dimensions and overlapping openings',()=>{
 const p=createBuilding(1);
 assert.equal(ProjectSchema.safeParse({...p,entities:[{...p.entities[0],floorId:'missing'}]}).success,false);
 assert.equal(ProjectSchema.safeParse({...p,entities:[{...p.entities[0],w:-1}]}).success,false);
 const door=p.entities.find(e=>e.kind==='door');assert.equal(ProjectSchema.safeParse({...p,entities:[...p.entities,{...door,id:'bad-duplicate'}]}).success,false);
 const room=p.entities.find(e=>e.kind==='room');assert.equal(ProjectSchema.safeParse({...p,entities:[...p.entities,{...room,id:'wrong',x:Infinity}]}).success,false);
});
test('room drawing creates metric bounds and spawn points avoid furniture',()=>{
 const p=emptyProject(),floor=p.floors[0];
 p.entities=roomFromPoints(floor.id,{x:-3,z:-2},{x:3,z:2},'Apto 101');
 assert.equal(p.entities.length,5);assert.equal(p.entities[0].w*p.entities[0].d,24);
 assert.equal(wallFromPoints(floor.id,{x:0,z:0},{x:.1,z:.1}),null);
 p.entities.push(entity('sofa',floor.id,0,0));
 const spawn=findSpawn(p,floor.id,p.entities[0].id);assert.equal(collides(p,spawn.x,spawn.z,spawn.feet),false);
 assert.equal(ProjectSchema.safeParse(p).success,true);
});
