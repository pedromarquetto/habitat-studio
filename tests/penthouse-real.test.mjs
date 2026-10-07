import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const d=await import('../lib/habitat/domain.ts');
const { addPenthouse }=await import('../lib/habitat/penthouse.ts');
const { makeModel,disposeObject }=await import('../lib/habitat/models.ts');
const { RealMaterials,defaultFinish }=await import('../lib/habitat/real-materials.ts');
const THREE=await import('three');
const {productKind}=await import('../lib/habitat/product-import.ts');

test('both penthouse styles preserve lower floors, validate, serialize and replace the top roof',()=>{
  for(const style of ['apartment','terrace']){
    const original=d.createBuilding(2),before=JSON.stringify(original),top=original.floors.at(-1),next=addPenthouse(original,style);
    assert.equal(JSON.stringify(original),before);assert.equal(d.ProjectSchema.safeParse(next.project).success,true);
    const floor=next.project.floors.find(f=>f.id===next.floorId);assert.equal(floor.elevation,top.elevation+3.2);
    for(const item of original.entities.filter(e=>e.kind!=='roof'))assert.deepEqual(next.project.entities.find(e=>e.id===item.id),item);
    assert.equal(next.project.entities.some(e=>e.kind==='roof'&&e.floorId===top.id),false);
    const added=next.project.entities.filter(e=>e.floorId===floor.id);
    assert.equal(added.filter(e=>e.kind==='railing').length,4);assert.ok(added.some(e=>e.kind==='pergola'));
    assert.equal(added.some(e=>e.kind==='bed'),style==='apartment');
    assert.deepEqual(d.ProjectSchema.parse(JSON.parse(JSON.stringify(next.project))),next.project);
  }
});
test('stairs continuously reach and leave the terrace through an actual slab opening',()=>{
  const original=d.createBuilding(2),next=addPenthouse(original),top=original.floors.at(-1),stair=next.project.entities.find(e=>e.kind==='stairs'&&e.floorId===top.id);
  let p={x:stair.x,z:stair.z-stair.d/2-.3,feet:top.elevation};
  for(let i=0;i<76;i++)p=d.movePlayer(next.project,p,0,.08);
  assert.ok(p.z>stair.z+stair.d/2);assert.ok(Math.abs(p.feet-(top.elevation+3.2))<.001);
  for(let i=0;i<76;i++)p=d.movePlayer(next.project,p,0,-.08);
  assert.ok(p.z<stair.z-stair.d/2);assert.ok(Math.abs(p.feet-top.elevation)<.001);
  const floor=next.project.floors.find(f=>f.id===next.floorId),railing=next.project.entities.find(e=>e.kind==='railing'&&e.floorId===floor.id&&e.rotation===0);
  assert.equal(d.collides(next.project,railing.x,railing.z,floor.elevation),true);
  const entry=next.project.entities.find(e=>e.floorId===floor.id&&e.kind==='door'&&e.w===1.2);
  p={x:entry.x+.6,z:entry.z,feet:floor.elevation};
  for(let i=0;i<15;i++)p=d.movePlayer(next.project,p,-.08,0);
  assert.ok(p.x<entry.x-.4,'terrace doorway has continuous floor support');
  for(let i=0;i<15;i++)p=d.movePlayer(next.project,p,.08,0);
  assert.ok(p.x>entry.x+.4,'apartment doorway also exits onto the terrace');
});
test('unsupported bases and floor limits fail without mutating the project',()=>{
  const p=d.emptyProject(),before=JSON.stringify(p);assert.throws(()=>addPenthouse(p),/cômodos/);assert.equal(JSON.stringify(p),before);
  const building=d.createBuilding(1);building.floors=Array.from({length:20},(_,i)=>({id:`f${i}`,name:`F${i}`,elevation:i*3.2}));assert.throws(()=>addPenthouse(building),/20 andares/);
});
test('new appliances and woodwork have distinct usable geometry and retain exact imported bounds',()=>{
  const items=d.CATALOG.filter(c=>c.section==='woodwork'||['microwave','washingMachine','dryer','dishwasher','oven','cooktop','hood','airConditioner'].includes(c.kind));
  assert.equal(items.length,16);
  assert.equal(productKind('Micro-ondas 30 litros'),'microwave');assert.equal(productKind('Ar-condicionado split'),'airConditioner');assert.equal(productKind('Armário aéreo de cozinha'),'wallCabinet');assert.equal(productKind('Lava-louças 14 serviços'),'dishwasher');
  for(const item of items){
    const e=d.entity(item.kind,'floor',0,0,{product:{url:'https://shop.example.com/item',dimensions:{w:item.w,h:item.h,d:item.d},measurementSource:'manual',evidence:[]}}),model=makeModel(e,[e]),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok(model.children.length>=1);for(const axis of ['x','y','z'])assert.ok(Math.abs(size[axis]-e[{x:'w',y:'h',z:'d'}[axis]])<1e-6,`${item.kind} ${axis}`);
    disposeObject(model);
  }
  const p=d.emptyProject(),floor=p.floors[0].id;p.entities.push(d.entity('airConditioner',floor,0,0));
  assert.equal(d.collides(p,0,0,0),false);p.entities.push(d.entity('wallCabinet',floor,2,0));assert.equal(d.collides(p,2,0,0),true);
});
test('real materials preserve geometry/document identity and shared maps survive model disposal',()=>{
  const e=d.entity('baseCabinet','f',0,0,{finish:'wood'}),before=JSON.stringify(e),model=makeModel(e,[e]),bounds=new THREE.Box3().setFromObject(model),library=new RealMaterials();
  assert.equal(defaultFinish(e),'wood');library.apply(model,e);assert.deepEqual(new THREE.Box3().setFromObject(model),bounds);assert.equal(JSON.stringify(e),before);
  const material=model.children.find(o=>o instanceof THREE.Mesh).material,map=material.map;assert.ok(map instanceof THREE.DataTexture);assert.ok(material.normalMap);assert.ok(material.roughnessMap);assert.notEqual(material.map,material.roughnessMap);assert.equal(material.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(material.metalness,0);
  let disposed=0;map.addEventListener('dispose',()=>disposed++);disposeObject(model);assert.equal(disposed,0);library.dispose();assert.equal(disposed,1);
  const metal=d.entity('baseCabinet','f',0,0,{finish:'metal'}),metalModel=makeModel(metal,[metal]),metalLibrary=new RealMaterials();metalLibrary.apply(metalModel,metal);
  assert.equal(metalModel.children.find(o=>o instanceof THREE.Mesh).material.metalness,.72,'explicit finish overrides catalog defaults');disposeObject(metalModel);metalLibrary.dispose();
});
