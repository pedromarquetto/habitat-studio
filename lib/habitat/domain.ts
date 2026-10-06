import { z } from 'zod';

export const KINDS = ['wall', 'room', 'door', 'window', 'roof', 'stairs', 'sofa', 'armchair', 'bed', 'table', 'chair', 'cabinet', 'fridge', 'stove', 'sink', 'toilet', 'plant', 'lamp', 'terrain', 'lawn', 'paving', 'fence', 'gate', 'pool', 'tree', 'object'] as const;
export type Kind = typeof KINDS[number];
export type View = '3d' | 'plan' | 'walk';
export type Tool = 'select' | 'move' | 'wall' | 'room' | 'roof' | 'place' | 'area' | 'line';
const WebUrl = z.string().max(2048).url().refine(v => ['http:','https:'].includes(new URL(v).protocol), 'Use um link HTTP ou HTTPS.');
export const ProductSourceSchema = z.object({
  url: WebUrl, imageUrl: WebUrl.optional(), brand: z.string().max(120).optional(), model: z.string().max(120).optional(),
  dimensions: z.object({w:z.number().positive().max(100),h:z.number().positive().max(30),d:z.number().positive().max(100)}),
  measurementSource: z.enum(['page','manual','mixed']), evidence: z.array(z.string().max(250)).max(6),
});
export const EntitySchema = z.object({
  id: z.string().min(1).max(100), kind: z.enum(KINDS), name: z.string().max(120), floorId: z.string().min(1).max(100),
  x: z.number().finite().min(-200).max(200), z: z.number().finite().min(-200).max(200),
  rotation: z.number().finite().min(-36000).max(36000),
  w: z.number().finite().min(0.05).max(100), h: z.number().finite().min(0.05).max(30), d: z.number().finite().min(0.05).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), apartment: z.string().max(80), hostId: z.string().max(100).optional(),
  product: ProductSourceSchema.optional(),
});
export type Entity = z.infer<typeof EntitySchema>;
export const FloorSchema = z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(80), elevation: z.number().finite().min(0).max(100) });
export type Floor = z.infer<typeof FloorSchema>;
export const ProjectSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(120), units: z.literal('m'),
  projectType: z.enum(['house','building','terrain']).optional(),
  floors: z.array(FloorSchema).min(1).max(20), entities: z.array(EntitySchema).max(5000),
}).superRefine((p, ctx) => {
  const floors = new Set(p.floors.map(f => f.id));
  const ids = new Set(p.entities.map(e => e.id));
  if (floors.size !== p.floors.length || ids.size !== p.entities.length) ctx.addIssue({code:'custom',message:'Identificadores duplicados.'});
  if (p.floors.some((f,i) => p.floors.some((other,j) => j < i && Math.abs(other.elevation-f.elevation) < 2.4))) ctx.addIssue({code:'custom',message:'Os andares precisam ter pelo menos 2,4 m de separação.'});
  for (const e of p.entities) {
    if (!floors.has(e.floorId)) ctx.addIssue({code:'custom',message:'Objeto com andar inexistente.'});
    if (e.kind === 'door' || e.kind === 'window') {
      const host = p.entities.find(w => w.id === e.hostId && w.kind === 'wall');
      if (!host || host.floorId !== e.floorId) ctx.addIssue({code:'custom',message:'Porta ou janela sem parede válida.'});
      else {
        const local = localPoint(host,e.x,e.z);
        if (Math.abs(local.x) + e.w/2 > host.w/2 + 0.03 || Math.abs(local.z) > host.d/2 + 0.08 || Math.abs(Math.sin((e.rotation-host.rotation)*Math.PI/180)) > 0.01 || openingBase(e)+e.h > host.h+0.03) ctx.addIssue({code:'custom',message:'Abertura fora dos limites da parede.'});
        if (p.entities.some(o => o.id !== e.id && o.hostId === host.id && Math.abs(localPoint(host,o.x,o.z).x-local.x) < (o.w+e.w)/2+0.04)) ctx.addIssue({code:'custom',message:'Aberturas sobrepostas.'});
      }
    }
  }
});
export type Project = z.infer<typeof ProjectSchema>;

export interface CatalogItem { kind: Kind; name: string; section: 'structure' | 'furniture' | 'appliances' | 'outdoor'; w: number; h: number; d: number; color: string; hint: string }
export const CATALOG: CatalogItem[] = [
  {kind:'wall',name:'Parede',section:'structure',w:4,h:2.8,d:.18,color:'#f1eee6',hint:'Desenhe entre dois pontos'},
  {kind:'room',name:'Cômodo',section:'structure',w:4,h:.16,d:4,color:'#bb936e',hint:'Piso e quatro paredes'},
  {kind:'door',name:'Porta',section:'structure',w:1,h:2.2,d:.18,color:'#b98657',hint:'Clique sobre uma parede'},
  {kind:'window',name:'Janela',section:'structure',w:1.8,h:1.3,d:.18,color:'#94bac8',hint:'Clique sobre uma parede'},
  {kind:'roof',name:'Telhado',section:'structure',w:8,h:1.8,d:7,color:'#4d6560',hint:'Desenhe a área de cobertura'},
  {kind:'stairs',name:'Escada',section:'structure',w:1.4,h:3.2,d:5,color:'#cbc8bf',hint:'Conecta o andar seguinte'},
  {kind:'sofa',name:'Sofá',section:'furniture',w:2.5,h:.85,d:1,color:'#d29a66',hint:'3 lugares'},
  {kind:'armchair',name:'Poltrona',section:'furniture',w:.9,h:.9,d:.9,color:'#708f80',hint:'Assento individual'},
  {kind:'bed',name:'Cama',section:'furniture',w:1.8,h:.7,d:2.2,color:'#eee9de',hint:'Casal'},
  {kind:'table',name:'Mesa',section:'furniture',w:1.8,h:.78,d:.9,color:'#ad8059',hint:'Mesa de jantar'},
  {kind:'chair',name:'Cadeira',section:'furniture',w:.48,h:.95,d:.5,color:'#6a7b70',hint:'Madeira e tecido'},
  {kind:'cabinet',name:'Armário',section:'furniture',w:1.8,h:2.1,d:.6,color:'#b39473',hint:'Duas portas'},
  {kind:'plant',name:'Planta',section:'furniture',w:.65,h:1.2,d:.65,color:'#59855d',hint:'Vaso decorativo'},
  {kind:'lamp',name:'Luminária',section:'furniture',w:.45,h:1.7,d:.45,color:'#debd7d',hint:'Luminária de piso'},
  {kind:'fridge',name:'Geladeira',section:'appliances',w:.75,h:1.85,d:.75,color:'#ccd4d5',hint:'Duas portas'},
  {kind:'stove',name:'Fogão',section:'appliances',w:.65,h:.9,d:.65,color:'#d0d5d7',hint:'Quatro bocas'},
  {kind:'sink',name:'Pia',section:'appliances',w:1.25,h:.9,d:.65,color:'#dbd9d0',hint:'Bancada com cuba'},
  {kind:'toilet',name:'Vaso sanitário',section:'appliances',w:.45,h:.8,d:.75,color:'#f7f7f4',hint:'Louça branca'},
  {kind:'object',name:'Objeto',section:'furniture',w:1,h:1,d:1,color:'#a9b8be',hint:'Volume com medidas personalizadas'},
  {kind:'terrain',name:'Terreno',section:'outdoor',w:20,h:.18,d:25,color:'#b5a789',hint:'Desenhe os limites do lote'},
  {kind:'lawn',name:'Gramado',section:'outdoor',w:5,h:.08,d:5,color:'#7c9c55',hint:'Desenhe uma área de jardim'},
  {kind:'paving',name:'Calçada / pátio',section:'outdoor',w:4,h:.12,d:4,color:'#b8bbb2',hint:'Desenhe uma área pavimentada'},
  {kind:'fence',name:'Cerca',section:'outdoor',w:4,h:1.3,d:.12,color:'#967653',hint:'Clique no início e no fim'},
  {kind:'gate',name:'Portão',section:'outdoor',w:3,h:1.5,d:.15,color:'#526b62',hint:'Portão aberto para circulação'},
  {kind:'pool',name:'Piscina',section:'outdoor',w:5,h:1.2,d:3,color:'#4da9bf',hint:'Desenhe a área da piscina'},
  {kind:'tree',name:'Árvore',section:'outdoor',w:2.6,h:3.5,d:2.6,color:'#557b45',hint:'Árvore para o jardim'},
];
export const AREA_KINDS:Kind[]=['terrain','lawn','paving','pool'];
export const GRID = .25;
export const PLAYER_RADIUS = .22;
export const uid = () => {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
export const snap = (v:number, enabled = true) => enabled ? Math.round(v/GRID)*GRID : Math.round(v*100)/100;
export const catalogFor = (kind:Kind) => CATALOG.find(i => i.kind === kind)!;
export function entity(kind:Kind, floorId:string, x=0, z=0, extra:Partial<Entity>={}):Entity {
  const item = catalogFor(kind);
  return {id:uid(),kind,name:item.name,floorId,x,z,rotation:0,w:item.w,h:item.h,d:item.d,color:item.color,apartment:'',...extra};
}
export function localPoint(e:Entity,x:number,z:number) {
  const a=e.rotation*Math.PI/180, dx=x-e.x, dz=z-e.z;
  return {x:dx*Math.cos(a)-dz*Math.sin(a),z:dx*Math.sin(a)+dz*Math.cos(a)};
}
export function worldPoint(e:Entity,x:number,z:number) {
  const a=e.rotation*Math.PI/180;
  return {x:e.x+x*Math.cos(a)+z*Math.sin(a),z:e.z-x*Math.sin(a)+z*Math.cos(a)};
}
export function inside(e:Entity,x:number,z:number,pad=0) { const p=localPoint(e,x,z); return Math.abs(p.x)<e.w/2+pad && Math.abs(p.z)<e.d/2+pad; }
export const openingBase = (e:Pick<Entity,'kind'>) => e.kind==='window' ? .9 : 0;
export function wallFromPoints(floorId:string,a:{x:number;z:number},b:{x:number;z:number},apartment=''):Entity|null {
  const w=Math.hypot(b.x-a.x,b.z-a.z);
  if (w<.5) return null;
  return entity('wall',floorId,(a.x+b.x)/2,(a.z+b.z)/2,{w,rotation:-Math.atan2(b.z-a.z,b.x-a.x)*180/Math.PI,apartment});
}
export function roomFromPoints(floorId:string,a:{x:number;z:number},b:{x:number;z:number},apartment=''):Entity[] {
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2,w=Math.abs(a.x-b.x),d=Math.abs(a.z-b.z);
  if(w<1 || d<1) return [];
  return [entity('room',floorId,x,z,{w,d,apartment}),
    entity('wall',floorId,x,z-d/2,{w,apartment}),entity('wall',floorId,x,z+d/2,{w,apartment}),
    entity('wall',floorId,x-w/2,z,{w:d,rotation:90,apartment}),entity('wall',floorId,x+w/2,z,{w:d,rotation:90,apartment})];
}
export function attachOpening(project:Project,kind:'door'|'window',wallId:string,point:{x:number;z:number}):Entity|null {
  const host=project.entities.find(e=>e.id===wallId&&e.kind==='wall');
  if(!host)return null;
  const item=catalogFor(kind), max=host.w/2-item.w/2-.08;
  if(max<0 || openingBase(item)+item.h>host.h)return null;
  const x=Math.max(-max,Math.min(max,snap(localPoint(host,point.x,point.z).x)));
  if(project.entities.some(e=>e.hostId===host.id&&Math.abs(localPoint(host,e.x,e.z).x-x)<(e.w+item.w)/2+.08))return null;
  const pos=worldPoint(host,x,0);
  return entity(kind,host.floorId,pos.x,pos.z,{hostId:host.id,rotation:host.rotation,d:host.d,apartment:host.apartment});
}

export interface WallSection {x:number;y:number;w:number;h:number}
export function wallSections(wall:Entity,all:Entity[],displayHeight=wall.h):WallSection[] {
  const openings=all.filter(e=>e.hostId===wall.id).map(e=>({e, x:localPoint(wall,e.x,e.z).x})).sort((a,b)=>a.x-b.x);
  const out:WallSection[]=[]; let left=-wall.w/2;
  const add=(x:number,y:number,w:number,h:number)=>{if(w>.001&&h>.001)out.push({x,y,w,h});};
  for(const {e,x} of openings){
    const start=Math.max(left,x-e.w/2),end=Math.min(wall.w/2,x+e.w/2);
    add((left+start)/2,displayHeight/2,start-left,displayHeight);
    const base=Math.min(openingBase(e),displayHeight),top=openingBase(e)+e.h;
    add(x,base/2,end-start,base);
    if(top<displayHeight)add(x,(top+displayHeight)/2,end-start,displayHeight-top);
    left=end;
  }
  add((left+wall.w/2)/2,displayHeight/2,wall.w/2-left,displayHeight);
  return out;
}
export function collides(project:Project,x:number,z:number,feet:number):boolean {
  return project.entities.some(e=>{
    const floor=project.floors.find(f=>f.id===e.floorId)!;
    if(feet+1.65<floor.elevation || feet>floor.elevation+e.h-.1)return false;
    if(e.kind==='wall'){
      const p=localPoint(e,x,z);
      if(Math.abs(p.z)>e.d/2+PLAYER_RADIUS||Math.abs(p.x)>e.w/2+PLAYER_RADIUS)return false;
      return !project.entities.some(o=>o.kind==='door'&&o.hostId===e.id&&Math.abs(p.x-localPoint(e,o.x,o.z).x)<o.w/2-PLAYER_RADIUS&&feet+1.65<floor.elevation+o.h);
    }
    if(['room','door','window','roof','stairs','plant','lamp','terrain','lawn','paving'].includes(e.kind))return false;
    if(e.kind==='gate') { const p=localPoint(e,x,z); return Math.abs(p.z)<e.d/2+PLAYER_RADIUS && Math.abs(p.x)>e.w/2-.12-PLAYER_RADIUS && Math.abs(p.x)<e.w/2+PLAYER_RADIUS; }
    if(e.kind==='tree')return Math.hypot(x-e.x,z-e.z)<Math.min(e.w,e.d)*.08+PLAYER_RADIUS;
    return inside(e,x,z,PLAYER_RADIUS*.7);
  });
}
export function supportHeight(project:Project,x:number,z:number,previous:number):number {
  let support=0;
  for(const e of project.entities){
    const floor=project.floors.find(f=>f.id===e.floorId)!;
    if(!inside(e,x,z,.002))continue;
    if(e.kind==='room' && floor.elevation<=previous+.24) support=Math.max(support,floor.elevation);
    if(e.kind==='stairs'){
      const p=localPoint(e,x,z), y=floor.elevation+(p.z/e.d+.5)*e.h;
      if(y<=previous+.24) support=Math.max(support,y);
    }
  }
  return support;
}
export function movePlayer(project:Project,position:{x:number;z:number;feet:number},dx:number,dz:number){
  let {x,z,feet}=position;
  const parts=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  for(let i=0;i<parts;i++){
    const nx=x+dx/parts, nz=z+dz/parts;
    let height=supportHeight(project,nx,z,feet);
    if(height>=feet-.5&&!collides(project,nx,z,height)){x=nx;feet=height;}
    height=supportHeight(project,x,nz,feet);
    if(height>=feet-.5&&!collides(project,x,nz,height)){z=nz;feet=height;}
  }
  return {x,z,feet};
}
export function findSpawn(project:Project,floorId:string,roomId?:string):{x:number;z:number;feet:number} {
  const floor=project.floors.find(f=>f.id===floorId)??project.floors[0];
  const room=project.entities.find(e=>e.id===roomId&&e.kind==='room'&&e.floorId===floor.id);
  const candidates=room?[room]:project.entities.filter(e=>e.kind==='room'&&e.floorId===floor.id).sort((a,b)=>Number(b.apartment==='')-Number(a.apartment===''));
  for(const e of candidates){
    if(!collides(project,e.x,e.z,floor.elevation))return{x:e.x,z:e.z,feet:floor.elevation};
    for(let dx=-e.w/2+.5;dx<e.w/2;dx+=.5)for(let dz=-e.d/2+.5;dz<e.d/2;dz+=.5){
    const pos=worldPoint(e,dx,dz);
    if(!collides(project,pos.x,pos.z,floor.elevation))return{...pos,feet:floor.elevation};
    }
  }
  return {x:0,z:-9,feet:0};
}

export function emptyProject():Project{return {version:1,name:'Meu projeto',projectType:'house',units:'m',floors:[{id:uid(),name:'Térreo',elevation:0}],entities:[]};}
export function createTerrain():Project {
  const p=emptyProject();p.name='Meu terreno';p.projectType='terrain';
  p.entities.push(entity('terrain',p.floors[0].id,0,0,{w:24,d:30}));return p;
}
export function createHouse():Project {
  const p=createTerrain();p.name='Casa com quintal';p.projectType='house';const id=p.floors[0].id;
  const add=(kind:Kind,x:number,z:number,extra:Partial<Entity>={})=>{const e=entity(kind,id,x,z,extra);p.entities.push(e);return e;};
  const wall=(x:number,z:number,w:number,rotation=0)=>add('wall',x,z,{w,rotation});
  const opening=(kind:'door'|'window',host:Entity,x:number,w?:number)=>{const pos=worldPoint(host,x,0);add(kind,pos.x,pos.z,{hostId:host.id,rotation:host.rotation,...(w?{w}:{})});};
  add('lawn',0,0,{w:23,d:29,name:'Jardim'});add('paving',0,-9,{w:3,d:8,name:'Acesso à casa'});add('paving',-7,9,{w:8,d:6,name:'Pátio'});
  add('room',-2,0,{w:8,d:10,name:'Sala e cozinha',apartment:'Casa'});add('room',4,-2.5,{w:4,d:5,name:'Quarto',apartment:'Casa'});add('room',4,2.5,{w:4,d:5,name:'Banheiro',apartment:'Casa',color:'#c4d6d0'});
  const front=wall(0,-5,12),back=wall(0,5,12),left=wall(-6,0,10,90),right=wall(6,0,10,90);
  opening('door',front,0,1.2);opening('window',front,-3,2);opening('window',front,4,1.5);
  opening('door',back,-2,1.2);opening('window',back,4,1.2);opening('window',left,0,2);opening('window',right,2,1.5);
  const partition=wall(2,0,10,90);opening('door',partition,2.5);opening('door',partition,-2.5);wall(4,0,4);
  add('roof',0,0,{w:12.8,d:10.8});add('sofa',-4,-2,{rotation:90});add('table',-2.5,-2,{h:.45,w:1.3,d:.7});add('armchair',-1,-3,{rotation:180});
  add('fridge',-5.4,3.9);add('stove',-4.5,4.2);add('sink',-3.4,4.2);add('table',-.5,2.5,{w:1.5,d:.9});add('chair',-.5,1.6);add('chair',-.5,3.4,{rotation:180});
  add('bed',4,-2.3,{w:1.5,d:2});add('cabinet',4,-4.5,{w:1.7});add('toilet',5,4);add('sink',3.5,3.8,{w:1});add('plant',-5,-4);
  add('pool',5,9,{w:6,d:3.5});for(const [x,z] of [[-9,6],[-9,-8],[9,-8],[9,12]])add('tree',x,z);
  add('fence',-12,0,{w:30,rotation:90});add('fence',12,0,{w:30,rotation:90});add('fence',0,15,{w:24});add('fence',-6.75,-15,{w:10.5});add('fence',6.75,-15,{w:10.5});add('gate',0,-15);
  return p;
}
export function createBuilding(count=2):Project {
  count=Math.max(1,Math.min(8,Math.round(count)));
  const p:Project={version:1,name:'Residencial Aurora',projectType:'building',units:'m',floors:[],entities:[]};
  for(let i=0;i<count;i++){
    const floor:Floor={id:uid(),name:i===0?'Térreo':`${i}º andar`,elevation:i*3.2};p.floors.push(floor);
    const add=(kind:Kind,x:number,z:number,extra:Partial<Entity>={})=>{const e=entity(kind,floor.id,x,z,extra);p.entities.push(e);return e;};
    const wall=(x:number,z:number,w:number,rotation=0)=>add('wall',x,z,{w,rotation,h:2.9});
    const opening=(kind:'door'|'window',host:Entity,local:number,w?:number)=>{const pos=worldPoint(host,local,0);return add(kind,pos.x,pos.z,{hostId:host.id,rotation:host.rotation,...(w?{w}:{})});};
    add('room',0,-2.5,{name:'Hall de entrada',w:4,d:7,color:'#d5d2c9'});
    add('room',0,6.5,{name:'Patamar',w:4,d:1,color:'#d5d2c9'});
    add('room',-1.65,3.5,{name:'Circulação',w:.7,d:5,color:'#d5d2c9'});
    add('room',1.65,3.5,{name:'Circulação',w:.7,d:5,color:'#d5d2c9'});
    if(i<count-1)add('stairs',0,3.5,{w:1.9,d:5,h:3.2,name:`Escada para ${i+1}º andar`});
    const frontLeft=wall(-5.5,-6,7),frontRight=wall(5.5,-6,7);
    opening('window',frontLeft,0,2.5);opening('window',frontRight,0,2.5);
    const entrance=wall(0,-6,4);opening('door',entrance,0,1.5);
    const back=wall(0,7,18);opening('window',back,-5.5,2);opening('window',back,5.5,2);
    const left=wall(-9,.5,13,90),right=wall(9,.5,13,90);opening('window',left,-2,2);opening('window',right,-2,2);
    for(const side of [-1,1]){
      const apartment=`Apto ${(i+1)*100+(side===-1?1:2)}`, cx=side*5.5;
      add('room',cx,-3,{name:'Sala & cozinha',w:7,d:6,apartment,color:'#bb9673'});
      add('room',side*7,3.5,{name:'Quarto',w:4,d:7,apartment,color:'#c5a181'});
      add('room',side*3.5,3.5,{name:'Banheiro',w:3,d:7,apartment,color:'#c2d2cd'});
      const interior=wall(side*2,.5,13,90);interior.apartment=apartment;opening('door',interior,3.5,1.1);
      const divider=wall(cx,0,7);divider.apartment=apartment;opening('door',divider,side*1.5);opening('door',divider,-side*2);
      const bathroom=wall(side*5,3.5,7,90);bathroom.apartment=apartment;
      add('sofa',cx,-4.6,{rotation:0,color:side===-1?'#cf9e70':'#7faaa0',apartment});
      add('table',cx,-2.4,{w:1.5,h:.42,d:.8,apartment,name:'Mesa de centro'});
      add('armchair',side*7.8,-2.5,{rotation:side*90,apartment});
      add('plant',side*8.4,-5.3,{apartment});
      add('fridge',side*2.6,-5.3,{apartment});
      add('stove',side*3.3,-5.3,{apartment});
      add('sink',side*4.2,-5.3,{w:1,apartment});
      add('bed',side*7,3.2,{rotation:180,apartment});
      add('cabinet',side*7,6.5,{apartment});
      add('lamp',side*8.5,5,{apartment});
      add('toilet',side*3.3,5.8,{apartment});
      add('sink',side*3.5,1.2,{apartment});
    }
  }
  const top=p.floors.at(-1)!;
  p.entities.push(entity('roof',top.id,0,.5,{w:18.8,d:13.8,h:2,name:'Cobertura principal',color:'#4f6760'}));
  return p;
}
export function duplicateFloor(project:Project,sourceId:string):{project:Project;floorId:string} {
  if(project.floors.length>=20)throw new Error('Limite de 20 andares.');
  const elevation=Math.max(...project.floors.map(f=>f.elevation))+3.2;
  const floor:Floor={id:uid(),name:`${project.floors.length}º andar`,elevation};
  const source=project.entities.filter(e=>e.floorId===sourceId&&e.kind!=='roof'&&catalogFor(e.kind).section!=='outdoor');
  const remap=new Map(source.map(e=>[e.id,uid()]));
  const copies=source.map(e=>({...e,id:remap.get(e.id)!,floorId:floor.id,hostId:e.hostId?remap.get(e.hostId):undefined,apartment:e.apartment?e.apartment.replace(/\d+/,m=>String((project.floors.length+1)*100+(Number(m)%100))):''}));
  return{project:{...project,floors:[...project.floors,floor],entities:[...project.entities.filter(e=>e.kind!=='roof'),...copies,...project.entities.filter(e=>e.kind==='roof').map(e=>({...e,floorId:floor.id}))]},floorId:floor.id};
}
export function updateEntity(project:Project,id:string,patch:Partial<Entity>):Project {
  const old=project.entities.find(e=>e.id===id);if(!old)return project;
  const updated={...old,...patch};
  return {...project,entities:project.entities.map(e=>{
    if(e.id===id)return updated;
    if(old.kind==='wall'&&e.hostId===id){const local=localPoint(old,e.x,e.z),pos=worldPoint(updated,local.x,0);return {...e,...pos,rotation:updated.rotation,floorId:updated.floorId,d:updated.d};}
    return e;
  })};
}
export function removeEntity(project:Project,id:string):Project {return {...project,entities:project.entities.filter(e=>e.id!==id&&e.hostId!==id)};}
