import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationSchema, parseCoordinates, geoToLocal, localToGeo, tilePoint, tileToGeo, intersectsLot, terrariumHeight, buildingHeight, convertOsm, pointInRing } from '../lib/habitat/geography.ts';
import { ProjectSchema, emptyProject, movePlayer, entity } from '../lib/habitat/domain.ts';
import { geographicData } from '../lib/habitat/geographic-fetch.ts';
const location={latitude:-30.0347,longitude:-51.2177,heading:0,enabled:true,lotWidth:25,lotDepth:30,baseOffset:0,radius:250};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);

test('old documents stay valid and new location survives JSON round trip',()=>{
  const p=emptyProject();assert.equal(ProjectSchema.safeParse(p).success,true);p.location=location;assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))).location,location);
  for(const bad of [{latitude:91},{longitude:NaN},{lotWidth:-1},{heading:361},{radius:100000},{baseOffset:12}])assert.equal(LocationSchema.safeParse({...location,...bad}).success,false);
});
test('coordinates accept complete Maps/OSM links, reject short links and invalid input',()=>{
  for(const text of ['-30.0347, -51.2177','https://www.google.com/maps/@-30.0347,-51.2177,18z','https://www.google.com/maps?q=-30.0347%2C-51.2177','https://www.openstreetmap.org/#map=17/-30.0347/-51.2177'])assert.deepEqual(parseCoordinates(text),{lat:-30.0347,lon:-51.2177});
  for(const text of ['https://maps.app.goo.gl/test','91, 20','1, Infinity','','12','80, 181','https://example.com/no-coordinates'])assert.equal(parseCoordinates(text),null);
});
test('local metres maintain scale, geographic heading and dateline wrapping',()=>{
  for(const heading of [0,90,178,270,360])for(const latitude of [-70,-30,0,70]){
    const l={...location,heading,latitude};for(const p of [{x:100,z:25},{x:-240,z:230},{x:0,z:0}]){const back=geoToLocal(localToGeo(p,l),l);close(p.x,back.x);close(p.z,back.z);}
  }
  const east=localToGeo({x:100,z:0},location),south=localToGeo({x:0,z:100},location);assert.ok(east.lon>location.longitude);assert.ok(south.lat<location.latitude);
  const rotated=localToGeo({x:0,z:-100},{...location,heading:90});assert.ok(rotated.lon>location.longitude);
  const dateline={...location,longitude:179.999};close(geoToLocal(localToGeo({x:240,z:0},dateline),dateline).x,240);
});
test('tile coordinates and Terrarium RGB decode without height quantization',()=>{
  for(const zoom of [3,12,17]){const t=tilePoint({lat:location.latitude,lon:location.longitude},zoom),p=tileToGeo(t.x,t.y,zoom);close(p.lat,location.latitude);close(p.lon,location.longitude);}
  assert.equal(terrariumHeight(128,0,0),0);assert.equal(terrariumHeight(127,255,128),-.5);assert.equal(terrariumHeight(128,15,64),15.25);
});
test('lot clears intersecting footprints including crossings and enclosing polygons',()=>{
  assert.equal(intersectsLot([{x:-50,z:-1},{x:50,z:-1},{x:50,z:1},{x:-50,z:1}],location),true);
  assert.equal(intersectsLot([{x:-50,z:-50},{x:50,z:-50},{x:50,z:50},{x:-50,z:50}],location),true);
  assert.equal(intersectsLot([{x:40,z:40},{x:60,z:40},{x:60,z:60},{x:40,z:60}],location),false);
});
test('OSM heights distinguish measured, floor-based and default estimates',()=>{
  assert.deepEqual(buildingHeight({height:'12 m'}),{height:12,minHeight:0,estimated:false});
  assert.deepEqual(buildingHeight({'building:levels':'5'}),{height:15,minHeight:0,estimated:true});
  assert.equal(buildingHeight({height:'unknown'}).estimated,true);assert.equal(buildingHeight({height:'9999',min_height:'9999'}).minHeight,249.5);
});
test('OSM multipolygons join segments, preserve courtyards and omit duplicate member ways',()=>{
  const outer=[{lat:0,lon:0},{lat:0,lon:1},{lat:1,lon:1},{lat:1,lon:0},{lat:0,lon:0}],inner=[{lat:.2,lon:.2},{lat:.2,lon:.4},{lat:.4,lon:.4},{lat:.4,lon:.2},{lat:.2,lon:.2}];
  const result=convertOsm({elements:[{type:'relation',id:1,tags:{building:'yes',height:'10'},members:[{type:'way',ref:2,role:'outer',geometry:outer.slice(0,3)},{type:'way',ref:3,role:'outer',geometry:outer.slice(2)},{type:'way',ref:4,role:'inner',geometry:inner}]},{type:'way',id:2,tags:{building:'yes'},geometry:outer}]});
  assert.equal(result.features.length,1);assert.equal(result.features[0].rings.length,2);assert.equal(result.features[0].estimated,false);assert.equal(pointInRing({x:.3,z:.3},inner.map(p=>({x:p.lon,z:p.lat}))),true);
  assert.throws(()=>convertOsm({elements:[],remark:'runtime timeout'}));
});
test('walking follows negative terrain, respects neighbors and preserves project floor support',()=>{
  const p=emptyProject(),surface=(x,z)=>-Math.abs(x)*.05,environment={surface,blocked:(x,z)=>x>2};
  let player={x:0,z:0,feet:0};for(let i=0;i<60;i++)player=movePlayer(p,player,.08,0,environment);assert.ok(player.x<=2);assert.ok(player.feet<0);close(player.feet,surface(player.x,player.z));
  const room=entity('room',p.floors[0].id,0,0,{w:10,d:10});p.entities=[room];player=movePlayer(p,{x:0,z:0,feet:0},.5,0,environment);assert.equal(player.feet,0);
  const cliff=movePlayer(emptyProject(),{x:0,z:0,feet:0},1,0,{surface:x=>x>.3?10:0,blocked:()=>false});assert.ok(cliff.x<=.3);
});

test('neighborhood requests stay bounded, use fixed services, fail over and reuse cached coordinates',async()=>{
  let count=0;const fetcher=async(url,init)=>{count++;assert.ok(['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'].includes(url));assert.equal(init.method,'POST');assert.equal(init.redirect,'error');const query=init.body.get('data');assert.ok(query.includes('[timeout:20]'));assert.ok(query.includes('[maxsize:16000000]'));return count===1?new Response('unavailable',{status:503}):Response.json({elements:[],osm3s:{timestamp_osm_base:'2026-01-01T00:00:00Z'}});};
  const input={...location,latitude:-31.1234};const data=await geographicData(input,undefined,fetcher);assert.equal(data.features.length,0);assert.equal(count,2);
  assert.equal(await geographicData({...input,heading:90,lotWidth:100},undefined,fetcher),data);assert.equal(count,2);
});
test('neighborhood loading rejects oversized responses and stops immediately on cancellation',async()=>{
  let count=0,cancelled=false;const fetcher=async()=>{count++;return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8_000_001));},cancel(){cancelled=true;}}));};
  await assert.rejects(()=>geographicData({...location,latitude:-32.1234},undefined,fetcher),/Área com dados demais/);assert.equal(count,1);assert.equal(cancelled,true);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>geographicData({...location,latitude:-33.1234},controller.signal,fetcher));assert.equal(count,1);
});
