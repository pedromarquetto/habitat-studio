import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

// Exercise the engine's actual frame/update methods without constructing WebGL.
registerHooks({
  resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);},
  load(url,context,next){
    if(url.endsWith('.ts')&&!url.includes('/node_modules/'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
    return next(url,context);
  },
});
const {cacheShadowMaps,invalidateShadowMaps}=await import('../lib/habitat/render-cache.ts');
const {HabitatEngine}=await import('../lib/habitat/engine.ts');
const {RealPipeline}=await import('../lib/habitat/real-pipeline.ts');
const d=await import('../lib/habitat/domain.ts');

test('stationary shadows retain every light, resolution and transform; scene changes refresh all maps',()=>{
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),room=new THREE.Group();sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);scene.add(sun,room);
  for(let i=0;i<16;i++){const light=new THREE.SpotLight('#ffccaa',55,14);light.castShadow=true;light.position.set(i,2.9,1);light.shadow.mapSize.set(i<4?1024:512,i<4?1024:512);room.add(light,light.target);}
  const lights=[sun,...room.children.filter(o=>o instanceof THREE.SpotLight)];
  const snapshot=()=>lights.map(light=>({intensity:light.intensity,position:light.position.toArray(),resolution:light.shadow.mapSize.toArray(),castShadow:light.castShadow}));
  const before=snapshot(),shadowMap={autoUpdate:true,needsUpdate:false};
  cacheShadowMaps(shadowMap,scene,true);
  assert.equal(shadowMap.autoUpdate,false);assert.equal(shadowMap.needsUpdate,true);
  for(const light of lights){assert.equal(light.shadow.autoUpdate,false);assert.equal(light.shadow.needsUpdate,true);light.shadow.needsUpdate=false;}
  shadowMap.needsUpdate=false;
  const camera=new THREE.PerspectiveCamera();for(let i=0;i<8;i++){camera.position.x=i;scene.updateMatrixWorld(true);}
  assert.equal(shadowMap.needsUpdate,false);assert.ok(lights.every(light=>!light.shadow.needsUpdate));
  // Moving furniture, toggling a circuit or loading terrain invalidates depth.
  invalidateShadowMaps(shadowMap,scene);
  assert.equal(shadowMap.needsUpdate,true);assert.ok(lights.every(light=>light.shadow.needsUpdate));assert.deepEqual(snapshot(),before);
  cacheShadowMaps(shadowMap,scene,false);
  assert.equal(shadowMap.autoUpdate,true);assert.ok(lights.every(light=>light.shadow.autoUpdate));
});

function fixture(){
  const engine=Object.create(HabitatEngine.prototype),project=d.createHouse(),calls={renders:0,positions:0,targets:0,lighting:0,rebuilds:0,exposures:0};
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.65,-9);camera.rotation.set(0,0,0,'YXZ');
  Object.assign(engine,{
    stopped:false,lastTime:0,lastPositionUpdate:0,lastRender:0,dirty:true,targetDirty:true,software:false,
    state:{project,floorId:project.floors[0].id,view:'walk',realMode:false,realQuality:'high',realExposure:1,lighting:'day',isolate:false,cutaway:false,grid:true,selectedId:null,tool:'select',placing:'chair',drawStart:null,snapping:true,rotation:0,lookSensitivity:1},
    player:{x:0,z:-9,feet:0},yaw:0,pitch:0,keys:new Set(),touchMove:{forward:0,right:0},camera,
    renderer:{render(){calls.renders++;},domElement:{style:{}}},geographic:{active:false,update(){}},ground:{},grid:{position:{}},plane:{},objects:new Map(),
    callbacks:{onPosition(){calls.positions++;},onSwitchTarget(){calls.targets++;}},
    positionRotationRing(){},switchTarget(){return null;},configureLighting(){calls.lighting++;},configureExposure(){calls.exposures++;},rebuild(){calls.rebuilds++;},restoreControls(){},highlight(){},
    moveGesture:{phase:'idle',pointerId:null},look:{pointerId:null},
  });
  return {engine,calls};
}

test('idle walking stops rendering and UI polling; movement, look and scene updates wake it immediately',()=>{
  const previousDocument=globalThis.document,previousFrame=globalThis.requestAnimationFrame;
  globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>1;
  try{
    const {engine,calls}=fixture();engine.animate(1000);assert.equal(calls.renders,1);
    for(const time of [1016,1200,1500,2000])engine.animate(time);
    assert.deepEqual(calls,{renders:1,positions:1,targets:1,lighting:0,rebuilds:0,exposures:0});
    engine.keys.add('KeyW');engine.animate(2016);assert.equal(calls.renders,2);assert.notEqual(engine.player.z,-9);
    engine.keys.clear();engine.animate(2032);assert.equal(calls.renders,2);
    engine.yaw+=.1;engine.animate(2048);assert.equal(calls.renders,3);assert.ok(Math.abs(engine.camera.rotation.y-.1)<1e-8);
    engine.dirty=true;engine.animate(2064);assert.equal(calls.renders,4);
    globalThis.document.hidden=true;engine.keys.add('KeyW');const z=engine.player.z;engine.animate(2100);assert.equal(calls.renders,4);assert.equal(engine.player.z,z);
  }finally{globalThis.document=previousDocument;globalThis.requestAnimationFrame=previousFrame;}
});

test('exposure reuses geometry, lights and reflections; day/night rebuilds lighting only',()=>{
  const {engine,calls}=fixture();
  engine.state={...engine.state,realMode:true};
  engine.update({...engine.state,realExposure:1.1});
  assert.equal(calls.exposures,1);assert.equal(calls.rebuilds,0);assert.equal(calls.lighting,0);
  engine.update({...engine.state,lighting:'night'});
  assert.equal(calls.rebuilds,0);assert.equal(calls.lighting,1);
  engine.update({...engine.state,realQuality:'balanced'});
  assert.equal(calls.rebuilds,0);assert.equal(calls.lighting,2);
});

test('cached pipeline sizing preserves contact shading, bloom and original resolution across quality changes',()=>{
  const pipeline=Object.create(RealPipeline.prototype),calls=[],resolution=new THREE.Vector2();let ratio=1.5;
  Object.assign(pipeline,{
    renderer:{getPixelRatio:()=>ratio},pixelRatio:ratio,resolutionKey:'',
    composer:{setPixelRatio(value){calls.push(['ratio',value]);},setSize(w,h){calls.push(['composer',w,h]);}},
    ao:{enabled:false,setSize(w,h){calls.push(['ao',w,h]);}},bloom:{enabled:false},fxaa:{uniforms:{resolution:{value:resolution}}},
  });
  pipeline.resize(1000,500,'high');
  assert.deepEqual(calls,[['composer',1000,500],['ao',975,488]]);assert.equal(pipeline.ao.enabled,true);assert.equal(pipeline.bloom.enabled,true);
  assert.deepEqual(resolution.toArray(),[1/1500,1/750]);
  pipeline.resize(1000,500,'high');assert.equal(calls.length,2);
  pipeline.resize(1000,500,'balanced');assert.equal(pipeline.ao.enabled,false);assert.equal(pipeline.bloom.enabled,false);assert.equal(calls.length,2);
  pipeline.resize(1000,500,'high');assert.equal(pipeline.ao.enabled,true);assert.equal(pipeline.bloom.enabled,true);assert.equal(calls.length,2);
  ratio=1;pipeline.resize(1000,500,'balanced');assert.deepEqual(calls.slice(2),[['ratio',1],['composer',1000,500],['ao',650,325]]);assert.deepEqual(resolution.toArray(),[1/1000,1/500]);
});
