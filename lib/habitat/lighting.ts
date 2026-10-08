import { switchMountPosition, type MovePoint } from './switch-mount';
import { ceilingHeight, entity, inside, localPoint, worldPoint, updateEntity, type Entity, type Project } from './domain';

export const lightSettings=(e:Entity)=>e.light??{on:true,intensity:1,color:'#ffd6a3'};
export const isLitRoom=(e:Entity)=>e.kind==='room'&&e.w>=2&&e.d>=2;
export function circuitRoom(project:Pick<Project,'entities'>,item:Entity){
  if(item.kind==='room')return item;
  return project.entities.find(r=>r.kind==='room'&&r.floorId===item.floorId&&(item.roomId?r.id===item.roomId:inside(r,item.x,item.z)));
}
export function switchRoom(project:Pick<Project,'entities'>,item:Entity){return item.roomId?project.entities.find(r=>r.id===item.roomId&&r.kind==='room'):undefined;}
export function toggleLight(project:Project,id:string){
  const item=project.entities.find(e=>e.id===id);if(!item)return project;
  const target=item.kind==='lightSwitch'?switchRoom(project,item):item;
  if(!target||!['room','lamp','ceilingLight'].includes(target.kind))return project;
  const light=lightSettings(target);return updateEntity(project,target.id,{light:{...light,on:!light.on}});
}
export interface LightSource {id:string;x:number;z:number;y:number;on:boolean;intensity:number;color:string;virtual:boolean;roomId?:string}
export function lightSources(project:Project,floorId:string):LightSource[]{
  const rooms=project.entities.filter(e=>e.floorId===floorId&&isLitRoom(e));
  const fixtures=project.entities.filter(e=>e.floorId===floorId&&['lamp','ceilingLight'].includes(e.kind));
  const sources:LightSource[]=fixtures.map(e=>{
    const room=circuitRoom(project,e),own=lightSettings(e),circuit=room?lightSettings(room):null;
    return {id:e.id,x:e.x,z:e.z,y:(e.y??0)+(e.kind==='lamp'?e.h*.88:e.h*.5),on:own.on&&(circuit?.on??true),intensity:own.intensity*(circuit?.intensity??1),color:room?.light?.color??own.color,virtual:false,roomId:room?.id};
  });
  for(const room of rooms){
    if(fixtures.some(e=>e.kind==='ceilingLight'&&circuitRoom(project,e)?.id===room.id))continue;
    const settings=lightSettings(room);sources.push({id:room.id,x:room.x,z:room.z,y:2.72,...settings,virtual:true,roomId:room.id});
  }
  return sources;
}

/** Place a physical switch on the room-facing side of a wall, away from openings. */
function switchOnWall(project:Project,wall:Entity,room:Entity,offset:number):Entity|null{
  const side=Math.sign(localPoint(wall,room.x,room.z).z)||1;
  const openings=project.entities.filter(e=>e.hostId===wall.id);
  const candidates=[offset,...openings.flatMap(o=>{const x=localPoint(wall,o.x,o.z).x;return [x-o.w/2-.22,x+o.w/2+.22];}),0,-wall.w*.35,wall.w*.35];
  for(const raw of candidates){
    const x=Math.max(-wall.w/2+.12,Math.min(wall.w/2-.12,raw));
    if(openings.some(o=>Math.abs(localPoint(wall,o.x,o.z).x-x)<o.w/2+.12))continue;
    const pos=worldPoint(wall,x,side*(wall.d/2+.027));
    if(!inside(room,pos.x,pos.z,.18))continue;
    return entity('lightSwitch',room.floorId,pos.x,pos.z,{roomId:room.id,switchWallId:wall.id,rotation:wall.rotation+(side<0?180:0),apartment:room.apartment,name:`Interruptor · ${room.name}`});
  }
  return null;
}
export function attachLightSwitch(project:Project,wallId:string,point:MovePoint,roomId?:string,options:{side?:number;snapping?:boolean;item?:Entity}={}){
  const wall=project.entities.find(e=>e.id===wallId&&e.kind==='wall');if(!wall)return null;
  // In plan view choose the adjacent room's face. In 3D use the face actually clicked.
  const rooms=project.entities.filter(e=>e.floorId===wall.floorId&&isLitRoom(e)&&(!roomId||e.id===roomId)).sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
  const adjacent=rooms.find(room=>inside(room,point.x,point.z,.2));
  const side=options.side??(adjacent?Math.sign(localPoint(wall,adjacent.x,adjacent.z).z)||1:undefined);
  const mount=switchMountPosition(project,wallId,point,{...options,side,ignoreId:options.item?.id});if(!mount)return null;
  const room=rooms.find(room=>inside(room,mount.x,mount.z,.05));
  return entity('lightSwitch',wall.floorId,mount.x,mount.z,{...options.item,...mount,roomId:room?.id,apartment:options.item?.apartment??room?.apartment??'',name:options.item?.name??(room?`Interruptor · ${room.name}`:'Interruptor')});
}
export function installRoomLighting(project:Project,floorId?:string){
  const additions:Entity[]=[];
  for(const room of project.entities.filter(e=>isLitRoom(e)&&(!floorId||e.floorId===floorId))){
    if(!project.entities.some(e=>e.kind==='ceilingLight'&&circuitRoom(project,e)?.id===room.id)){const height=ceilingHeight(project.entities,room);additions.push(entity('ceilingLight',room.floorId,room.x,room.z,{roomId:room.id,apartment:room.apartment,name:`Plafon · ${room.name}`,...(height!==null?{y:height-.082,ceilingRoomId:room.id}:{})}));}
    if(project.entities.some(e=>e.kind==='lightSwitch'&&e.roomId===room.id))continue;
    const walls=project.entities.filter(e=>e.kind==='wall'&&e.floorId===room.floorId).sort((a,b)=>{
      const score=(w:Entity)=>{const p=localPoint(w,room.x,room.z),door=project.entities.some(e=>e.kind==='door'&&e.hostId===w.id);return Math.abs(p.z)+Math.max(0,Math.abs(p.x)-w.w/2)*5-(door?.6:0);};return score(a)-score(b);
    });
    for(const wall of walls){const door=project.entities.find(e=>e.kind==='door'&&e.hostId===wall.id),offset=door?localPoint(wall,door.x,door.z).x+door.w/2+.22:localPoint(wall,room.x,room.z).x;const item=switchOnWall(project,wall,room,offset);if(item){additions.push(item);break;}}
  }
  return additions.length?{...project,entities:[...project.entities,...additions]}:project;
}
/** Lighting edits must never teleport a walking visitor back to the spawn point. */
export function sameWalkGeometry(a:Project,b:Project){
  if(a.floors.length!==b.floors.length||a.entities.length!==b.entities.length)return false;
  if(a.floors.some((f,i)=>f.id!==b.floors[i].id||f.elevation!==b.floors[i].elevation))return false;
  return a.entities.every((e,i)=>{const other=b.entities[i];return (['id','kind','floorId','x','y','z','rotation','w','h','d','hostId','switchWallId'] as const).every(k=>e[k]===other[k]);});
}
