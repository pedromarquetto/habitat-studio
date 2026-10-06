import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { parseProductPage, parseProductText, parseMeasurement, publicProductUrl } from '../lib/habitat/product-import.ts';
import { createHouse, createTerrain, collides, duplicateFloor, entity, movePlayer, ProjectSchema } from '../lib/habitat/domain.ts';
import * as THREE from 'three';

// Node's type stripping preserves extensionless imports used by the web bundler.
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);}});
const { fetchProduct, publicAddress }=await import('../lib/habitat/product-fetch.ts');
const { makeModel, disposeObject }=await import('../lib/habitat/models.ts');
const url='https://shop.example.com/fridge';
const page=(data,body='')=>`<script type="application/ld+json">${JSON.stringify(data)}</script>${body}`;

test('metric and imperial units convert, missing units and ranges stay unset',()=>{
  assert.equal(parseMeasurement('184,7 cm'),184.7);assert.equal(parseMeasurement({value:724,unitCode:'MMT'}),72.4);assert.equal(parseMeasurement('1.85 m'),185);assert.equal(parseMeasurement('30 in'),76.2);
  assert.equal(parseMeasurement('185'),null);assert.equal(parseMeasurement('176 - 184 cm'),null);assert.equal(parseMeasurement('30 kg'),null);
});
test('product dimensions exclude offer shipping dimensions and retain source identity',()=>{
  const d=parseProductPage(page({'@type':'Product',name:'Geladeira Azul',width:{value:62.2,unitCode:'CMT'},height:'184.7 cm',depth:'724 mm',brand:{name:'Marca'},offers:{shippingDetails:{height:'200 cm'}},image:'/front.jpg'}),url);
  assert.deepEqual(d.dimensions,{width:62.2,height:184.7,depth:72.4});assert.equal(d.kind,'fridge');assert.equal(d.brand,'Marca');assert.equal(d.imageUrl,'https://shop.example.com/front.jpg');
});
test('storefront specifications prefer explicit unpackaged values and skip niches',()=>{
  const data={specifications:[{name:'Altura com Embalagem (cm)',values:['210']},{name:'Altura (cm) [sem Embalagem]',values:['184,7']},{name:'Largura (cm)',values:['62,2']},{name:'Profundidade (cm)',values:['72.4']},{name:'Largura do Nicho (cm)',values:['95']}]};
  const d=parseProductPage(`<meta property="og:title" content="Geladeira Teste"><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`,url);
  assert.deepEqual(d.dimensions,{width:62.2,height:184.7,depth:72.4});
});
test('labelled dimensions support explicit axis order while ambiguous dimensions need review',()=>{
  const d=parseProductPage('<h1>Armário</h1><p>Dimensões (A x L x P): 180 x 90 x 50 cm</p>',url);assert.deepEqual(d.dimensions,{width:90,height:180,depth:50});
  const ambiguous=parseProductPage('<h1>Armário</h1><p>Dimensões: 180 x 90 x 50 cm</p>',url);assert.deepEqual(ambiguous.dimensions,{width:null,height:null,depth:null});assert.ok(ambiguous.warnings.length);
});
test('local destinations, IP literals, credentials, unsafe schemes and ports are rejected',()=>{
  for(const u of ['http://localhost/a','http://127.0.0.1/a','http://2130706433/a','http://[::1]/a','https://a.internal/a','https://a.local/a','file:///etc/passwd','https://user:pass@shop.example.com/a','https://shop.example.com:8080/a'])assert.throws(()=>publicProductUrl(u));
  for(const ip of ['10.0.0.1','127.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','::1','fc00::1','fe80::1','2001:db8::1'])assert.equal(publicAddress(ip),false);
  assert.equal(publicAddress('1.1.1.1'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
const dns=()=>Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'}]});
test('server fetch checks DNS and every redirect before reading bounded HTML',async()=>{
  let pages=0;const fetcher=async u=>{if(String(u).startsWith('https://cloudflare-dns.com'))return dns();pages++;return new Response(page({'@type':'Product',name:'Fridge',width:'70 cm',height:'180 cm',depth:'65 cm'}),{headers:{'content-type':'text/html'}});};
  const d=await fetchProduct(url,fetcher);assert.equal(pages,1);assert.equal(d.dimensions.height,180);
  await assert.rejects(fetchProduct(url,async u=>String(u).startsWith('https://cloudflare-dns.com')?dns():new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})),/pública/);
  await assert.rejects(fetchProduct(url,async()=>Response.json({Status:0,Answer:[{type:1,data:'10.0.0.2'}]})),/público/);
  await assert.rejects(fetchProduct(url,async u=>String(u).startsWith('https://cloudflare-dns.com')?dns():new Response('',{headers:{'content-type':'text/html','content-length':'3000000'}})),/grande demais/);
});
test('house and terrain serialize, outdoor gates admit walking and pools block entry',()=>{
  const p=createHouse();assert.equal(ProjectSchema.safeParse(p).success,true);assert.equal(ProjectSchema.safeParse(createTerrain()).success,true);
  assert.equal(collides(p,0,-5,0),false);assert.equal(collides(p,0,-15,0),false);assert.equal(collides(p,5,9,0),true);assert.equal(collides(p,-6,-15,0),true);
  assert.ok(movePlayer(p,{x:0,z:-4.6,feet:0},0,-2).z<-5.5);
  assert.ok(movePlayer(p,{x:-2,z:0,feet:0},0,6).z>5.5,'rear exit stays clear of the kitchen counter');
  const next=duplicateFloor(p,p.floors[0].id);assert.equal(next.project.entities.some(e=>e.floorId===next.floorId&&['terrain','lawn','pool','fence','gate','tree','paving'].includes(e.kind)),false);
});
test('imported model bounds match confirmed measures and product provenance survives JSON',()=>{
  const p=createTerrain(),dimensions={w:.622,h:1.847,d:.724};const e=entity('fridge',p.floors[0].id,0,0,{...dimensions,product:{url,dimensions,measurementSource:'page',evidence:['Largura: 62,2 cm']}});p.entities.push(e);
  const roundtrip=ProjectSchema.parse(JSON.parse(JSON.stringify(p)));assert.deepEqual(roundtrip.entities.at(-1).product,e.product);
  const model=makeModel(e,[]);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());for(const [key,axis] of [['w','x'],['h','y'],['d','z']])assert.ok(Math.abs(size[axis]-dimensions[key])<1e-6);disposeObject(model);
});

test('copied specifications accept decimal commas, labelled units and punctuation',()=>{
 const d=parseProductText('Altura: 184,7 cm; Largura: 62,2 cm; Profundidade: 72,4 cm',url,'Geladeira');assert.deepEqual(d.dimensions,{width:62.2,height:184.7,depth:72.4});
 const unitsInLabel=parseProductText('Largura (cm): 62,2 Altura (cm): 184,7 Profundidade (cm): 72,4',url);assert.deepEqual(unitsInLabel.dimensions,d.dimensions);
});
