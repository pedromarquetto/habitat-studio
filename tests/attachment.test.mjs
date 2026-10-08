import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const d=await import('../lib/habitat/domain.ts');
const {suggestedPlacement,wallMountPosition,supportPosition}=await import('../lib/habitat/placement.ts');
const {entityMovePosition}=await import('../lib/habitat/object-move.ts');
const {makeModel,disposeObject}=await import('../lib/habitat/models.ts');
const THREE=await import('three');

test('wall appliances attach flush on either side at clicked height and follow wall transformations',()=>{
  for(const angle of [0,37,90,-135])for(const side of [-1,1]){
    let p=d.emptyProject();const floor=p.floors[0].id,wall=d.entity('wall',floor,3,4,{rotation:angle,w:6,h:3.1,d:.25});p.entities.push(wall);
    const item=suggestedPlacement(p,'airConditioner',floor,{point:{x:40,z:40},surface:{...d.worldPoint(wall,1.23,side*.125),y:2.35},entityId:wall.id,wallSide:side},{snapping:true});
    assert.ok(item);assert.ok(Math.abs(d.localPoint(wall,item.x,item.z).z-side*(.125+item.d/2+.002))<1e-8);assert.ok(Math.abs(item.y-2.2)<1e-8);assert.equal(item.rotation,angle+(side<0?180:0));p.entities.push(item);
    assert.equal(d.ProjectSchema.safeParse(p).success,true);
    const point=entityMovePosition(p,item.id,{...d.worldPoint(wall,-1.32,4),y:1.83},true);assert.ok(point);assert.ok(Math.abs(point.y-1.85)<1e-8);
    p=d.updateEntity(p,wall.id,{x:8,z:-3,rotation:-22,d:.4});const updated=p.entities.find(e=>e.id===item.id),host=p.entities.find(e=>e.id===wall.id);assert.ok(Math.abs(d.localPoint(host,updated.x,updated.z).z-side*(.2+item.d/2+.002))<1e-8);assert.equal(d.ProjectSchema.safeParse(p).success,true);
  }
});
test('mounted cabinets avoid doors/windows, other fixtures and oversized walls',()=>{
  const p=d.emptyProject(),floor=p.floors[0].id,wall=d.entity('wall',floor,0,0,{w:5});p.entities.push(wall,d.entity('door',floor,0,0,{hostId:wall.id}));
  const item=d.entity('wallCabinet',floor,0,0);assert.equal(wallMountPosition(p,wall.id,item,{x:0,z:.1,y:1.8}),null);
  const mount=wallMountPosition(p,wall.id,item,{x:1.5,z:.1,y:1.8});assert.ok(mount);p.entities.push({...item,...mount});assert.equal(wallMountPosition(p,wall.id,d.entity('airConditioner',floor),{x:1.5,z:.1,y:1.8}),null);
  assert.equal(wallMountPosition(p,wall.id,{...item,w:6},{x:1,z:.1}),null);
});
test('small plants rest on the actual furniture surface, remain at metric size, and follow stacked supports',()=>{
  let p=d.emptyProject();const floor=p.floors[0].id,table=d.entity('table',floor,2,3,{rotation:32});p.entities.push(table);
  for(const kind of ['plantSmall','succulent','flowerPot']){
    const item=suggestedPlacement(p,kind,floor,{point:{x:90,z:90},surface:{x:table.x,z:table.z,y:table.h},surfaceNormal:{x:0,y:1,z:0},entityId:table.id},{snapping:true});assert.ok(item);assert.equal(item.supportId,table.id);assert.ok(Math.abs(item.y-table.h-.002)<1e-8);
    const model=makeModel(item,[item]);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());for(const [axis,key] of [['x','w'],['y','h'],['z','d']])assert.ok(Math.abs(size[axis]-item[key])<1e-6);disposeObject(model);
  }
  const microwave=d.entity('microwave',floor,table.x,table.z,{rotation:32});const top=supportPosition(table,microwave,table);p.entities.push({...microwave,...top});
  const plant=d.entity('succulent',floor,table.x,table.z,{rotation:32}),upper=supportPosition(p.entities[1],plant,plant);p.entities.push({...plant,...upper});
  p=d.updateEntity(p,table.id,{x:7,z:8,rotation:90,h:1});assert.equal(d.ProjectSchema.safeParse(p).success,true);assert.ok(Math.abs(p.entities[2].y-1-microwave.h-.004)<1e-8);assert.equal(p.entities[2].rotation,90);
  assert.equal(d.removeEntity(p,table.id).entities.length,0);
});
test('ceiling fixtures and fitted roofs use real wall heights rather than fixed offsets',()=>{
  let p=d.emptyProject();const floor=p.floors[0].id;p.entities=d.roomFromPoints(floor,{x:-3,z:-2},{x:3,z:2});p.entities=p.entities.map(e=>e.kind==='wall'?{...e,h:3.1}:e);
  const room=p.entities[0],fixture=suggestedPlacement(p,'ceilingLight',floor,{point:{x:0,z:0},entityId:room.id});assert.ok(fixture);assert.ok(Math.abs(fixture.y+fixture.h+.002-3.1)<1e-8);p.entities.push(fixture);
  const roof=d.fitRoof(p,d.entity('roof',floor,0,0,{w:9,d:9}));assert.ok(roof);assert.equal(roof.y,3.1);assert.ok(roof.w>6);p.entities.push(roof);
  const model=makeModel(roof,p.entities);assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.y)<1e-8);disposeObject(model);
  for(const wall of p.entities.filter(e=>e.kind==='wall'))p=d.updateEntity(p,wall.id,{h:3.5});assert.equal(p.entities.find(e=>e.id===roof.id).y,3.5);assert.ok(Math.abs(p.entities.find(e=>e.id===fixture.id).y+fixture.h+.002-3.5)<1e-8);
  const copy=d.duplicateFloor(p,floor);assert.equal(d.ProjectSchema.safeParse(copy.project).success,true);const copied=copy.project.entities.find(e=>e.kind==='roof');assert.ok(copied.roofWallIds.every(id=>copy.project.entities.some(e=>e.id===id&&e.floorId===copy.floorId)));
  const legacy={...roof,y:undefined,roofWallIds:undefined},legacyModel=makeModel(legacy,p.entities);assert.ok(Math.abs(new THREE.Box3().setFromObject(legacyModel).min.y-3.5)<1e-8);disposeObject(legacyModel);
});
test('door leaves pivot at the jamb at full width; cutaway retains upper height references',()=>{
  const e=d.entity('door','f',0,0,{w:1,h:2.2});
  for(const side of [-1,1])for(const hinge of ['left','right']){
    const model=makeModel({...e,doorSide:side,doorHinge:hinge},[e]),pivot=model.children.find(o=>o.userData.doorPivot),leaf=pivot.children.find(o=>o.userData.doorLeaf);
    assert.ok(Math.abs(leaf.geometry.parameters.width-.88)<1e-8);assert.ok(Math.abs(Math.abs(pivot.position.x)-.44)<1e-8);const bounds=new THREE.Box3().setFromObject(model);assert.ok(Math.abs(bounds.max.y-e.h)<1e-6);assert.ok(side>0?bounds.max.z>.8:bounds.min.z<-.8);disposeObject(model);
  }
  const wall=d.entity('wall','f',0,0,{h:2.8}),model=makeModel(wall,[wall],true);assert.ok(model.children.some(o=>o.userData.cutawayGhost));assert.ok(Math.abs(new THREE.Box3().setFromObject(model).max.y-2.8)<1e-6);disposeObject(model);
});
test('attachment schema rejects cross-floor, cyclic and missing supports, while JSON preserves valid links',()=>{
  const p=d.emptyProject(),floor=p.floors[0].id,table=d.entity('table',floor,0,0),plant=d.entity('plantSmall',floor,0,0);p.entities.push(table,{...plant,...supportPosition(table,plant,plant)});
  assert.deepEqual(d.ProjectSchema.parse(JSON.parse(JSON.stringify(p))),p);
  assert.equal(d.ProjectSchema.safeParse({...p,entities:p.entities.map(e=>e.id===plant.id?{...e,supportId:'missing'}:e)}).success,false);
  assert.equal(d.ProjectSchema.safeParse({...p,entities:p.entities.map(e=>e.id===table.id?{...e,supportId:plant.id}:e)}).success,false);
});

test('repositioning uses the new pointer coordinates while keeping object and switch identities',()=>{
  const p=d.emptyProject(),f=p.floors[0].id,plant=d.entity('flowerPot',f,0,0,{y:.9,supportId:'previous'});
  const moved=suggestedPlacement(p,plant.kind,f,{point:{x:2.25,z:1.5},entityId:null},{item:plant,snapping:true});
  assert.equal(moved.id,plant.id);assert.equal(moved.x,2.25);assert.equal(moved.z,1.5);assert.equal(moved.y,0);assert.equal(moved.supportId,undefined);
  const wall=d.entity('wall',f,0,0,{w:5});p.entities.push(wall);const sw=suggestedPlacement(p,'lightSwitch',f,{point:{x:0,z:.09},entityId:wall.id},{plan:true});p.entities.push(sw);
  const replaced=suggestedPlacement(p,'lightSwitch',f,{point:{x:1,z:.09},surface:{x:1,z:.09,y:1.4},entityId:wall.id},{item:sw});assert.equal(replaced.id,sw.id);assert.equal(replaced.x,1);assert.equal(replaced.switchWallId,wall.id);
  assert.equal(d.ProjectSchema.safeParse(d.updateEntity(p,sw.id,replaced)).success,true);
});
