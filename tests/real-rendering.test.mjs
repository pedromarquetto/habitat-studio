import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const d=await import('../lib/habitat/domain.ts');
const {makeModel,disposeObject}=await import('../lib/habitat/models.ts');
const {RealMaterials}=await import('../lib/habitat/real-materials.ts');
const {roomCeiling,makeCeiling,addWallTrim}=await import('../lib/habitat/real-room.ts');
const {addPenthouse}=await import('../lib/habitat/penthouse.ts');
const THREE=await import('three');

test('Real rounds furniture without changing imported dimensions or saved project data',()=>{
  for(const kind of ['sofa','baseCabinet','fridge','washingMachine']){
    const e=d.entity(kind,'f',0,0),before=JSON.stringify(e);e.product={url:'https://shop.example.com/item',dimensions:{w:e.w,h:e.h,d:e.d},measurementSource:'manual',evidence:[]};
    const saved=JSON.stringify(e),editor=makeModel(e,[e]),real=makeModel(e,[e],false,true);
    const size=new THREE.Box3().setFromObject(real).getSize(new THREE.Vector3());
    assert.ok(real.children.some(o=>o.geometry?.type==='RoundedBoxGeometry'));
    for(const [axis,key] of [['x','w'],['y','h'],['z','d']])assert.ok(Math.abs(size[axis]-e[key])<1e-6);
    assert.equal(JSON.stringify(e),saved);assert.ok(before);disposeObject(editor);disposeObject(real);
  }
});
test('PBR separates color and data maps, preserves emitters, and keeps glazing from blocking sunlight',()=>{
  const library=new RealMaterials();
  for(const kind of ['sofa','window','lamp','ceilingLight']){
    const e=d.entity(kind,'f',0,0),model=makeModel(e,[e],false,true);library.apply(model,e);
    model.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      assert.ok(o.material instanceof THREE.MeshPhysicalMaterial);
      if(o.material.transparent){assert.equal(o.castShadow,false);assert.equal(o.material.roughness,.04);}
      else if(o.userData.lightEmitter){assert.equal(o.castShadow,false);assert.equal(o.material.map,null);assert.ok(o.material.emissiveIntensity>0);}
      else{assert.equal(o.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(o.material.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(o.material.roughnessMap.colorSpace,THREE.NoColorSpace);if(kind==='sofa'&&!o.material.userData.hardware)assert.equal(o.material.sheen,1);}
    });disposeObject(model);
  }
  library.dispose();
});
test('Real ceilings enclose interiors but leave outdoor terraces open; baseboards keep door openings',()=>{
  const house=d.createHouse(),saved=JSON.stringify(house),rooms=house.entities.filter(e=>e.kind==='room');
  assert.ok(rooms.filter(r=>roomCeiling(house,r)!==null).length>=3);
  for(const room of rooms){const height=roomCeiling(house,room);if(height!==null){const ceiling=makeCeiling(room,height),bounds=new THREE.Box3().setFromObject(ceiling);assert.ok(Math.abs(bounds.min.y-height)<1e-6);disposeObject(ceiling);}}
  assert.equal(JSON.stringify(house),saved);
  const penthouse=addPenthouse(d.createBuilding(2),'terrace').project;
  for(const room of penthouse.entities.filter(e=>e.kind==='room'&&/terraço|patamar|circula/i.test(e.name)))assert.equal(roomCeiling(penthouse,room),null);
  const door=house.entities.find(e=>e.kind==='door'),wall=house.entities.find(e=>e.id===door.hostId),trim=new THREE.Group();addWallTrim(trim,wall,house.entities);trim.updateMatrixWorld(true);
  const local=d.localPoint(wall,door.x,door.z),ray=new THREE.Raycaster(new THREE.Vector3(local.x,.05,-2),new THREE.Vector3(0,0,1));
  assert.equal(ray.intersectObjects(trim.children).length,0);assert.ok(trim.children.length>=2);disposeObject(trim);
});
test('all local PBR maps ship as valid JPEG assets; renderer needs no external texture host',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/materials/manifest.json',import.meta.url),'utf8'));
  let count=0;for(const [name,asset] of Object.entries(manifest.assets))for(const map of asset.maps){const bytes=await readFile(new URL(`../public/materials/${name}-${map}.jpg`,import.meta.url));assert.ok(bytes.length>1000);assert.equal(bytes.readUInt16BE(0),0xffd8);count++;}
  assert.equal(count,12);
});
