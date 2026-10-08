import { attachOpening, ceilingHeight, entity, fitRoof, inside, localPoint, worldPoint, openingBase, snap, WALL_MOUNT_KINDS, SUPPORT_KINDS, type Entity, type Kind, type Project } from './domain';
import { attachLightSwitch } from './lighting';
import type { MovePoint } from './switch-mount';

export interface PlacementTarget {point:{x:number;z:number};entityId:string|null;surface?:MovePoint;wallSide?:number;surfaceNormal?:{x:number;y:number;z:number}}
export function placementWall(project:Project,target:PlacementTarget){const picked=project.entities.find(e=>e.id===target.entityId);return project.entities.find(e=>e.id===(picked?.kind==='wall'?picked.id:picked?.wallMountId??picked?.switchWallId??picked?.hostId)&&e.kind==='wall');}
export function wallMountPosition(project:Project,wallId:string,item:Entity,point:MovePoint,options:{side?:number;snapping?:boolean;ignoreId?:string}={}){
  const wall=project.entities.find(e=>e.id===wallId&&e.kind==='wall');if(!wall||!WALL_MOUNT_KINDS.includes(item.kind))return null;
  const local=localPoint(wall,point.x,point.z),side=Math.sign(options.side??local.z)||1,limit=(wall.w-item.w)/2-.02,minY=(wall.y??0)+.002,maxY=(wall.y??0)+wall.h-item.h-.002;
  if(limit<0||maxY<minY||!Number.isFinite(local.x)||point.y!==undefined&&!Number.isFinite(point.y))return null;
  const quantize=(value:number)=>options.snapping?Math.round(value/.05)*.05:value;
  const x=Math.max(-limit,Math.min(limit,quantize(local.x))),y=Math.max(minY,Math.min(maxY,quantize(point.y===undefined?(item.y??0):point.y-item.h/2)));
  if(project.entities.some(e=>e.id!==options.ignoreId&&((e.hostId===wall.id&&Math.abs(localPoint(wall,e.x,e.z).x-x)<(e.w+item.w)/2+.02&&y<openingBase(e)+e.h+.02&&y+item.h>openingBase(e)-.02)||((e.wallMountId===wall.id||e.switchWallId===wall.id)&&Math.sign(localPoint(wall,e.x,e.z).z)===side&&Math.abs(localPoint(wall,e.x,e.z).x-x)<(e.w+item.w)/2+.02&&y<(e.y??0)+e.h+.02&&y+item.h>(e.y??0)-.02))))return null;
  return {...worldPoint(wall,x,side*(wall.d/2+item.d/2+.002)),y,rotation:wall.rotation+(side<0?180:0),wallMountId:wall.id};
}
export function supportPosition(support:Entity,item:Entity,point:{x:number;z:number},snapping=false,ratio=1){
  const angle=(item.rotation-support.rotation)*Math.PI/180,hx=(Math.abs(Math.cos(angle))*item.w+Math.abs(Math.sin(angle))*item.d)/2,hz=(Math.abs(Math.sin(angle))*item.w+Math.abs(Math.cos(angle))*item.d)/2;
  const limitX=support.w/2-hx-.002,limitZ=support.d/2-hz-.002;if(limitX<0||limitZ<0)return null;
  const local=localPoint(support,point.x,point.z),quantize=(n:number)=>snapping?Math.round(n/.05)*.05:n;
  return {...worldPoint(support,Math.max(-limitX,Math.min(limitX,quantize(local.x))),Math.max(-limitZ,Math.min(limitZ,quantize(local.z)))),y:(support.y??0)+support.h*ratio+.002,supportId:support.id,supportRatio:ratio};
}
/** The editor and the green preview use exactly the same suggested attachment. */
export function suggestedPlacement(project:Project,kind:Kind,floorId:string,target:PlacementTarget,options:{item?:Partial<Entity>|null;rotation?:number;snapping?:boolean;plan?:boolean}={}):Entity|null{
  const picked=project.entities.find(e=>e.id===target.entityId),point:MovePoint=target.surface??target.point;
  let item=entity(kind,floorId,snap(target.point.x,options.snapping),snap(target.point.z,options.snapping),{...options.item,x:snap(target.point.x,options.snapping),z:snap(target.point.z,options.snapping),rotation:options.rotation??0,wallMountId:undefined,switchWallId:undefined,supportId:undefined,supportRatio:undefined,ceilingRoomId:undefined});
  if(kind==='lightSwitch'){const wall=placementWall(project,target);return wall?.floorId===floorId?attachLightSwitch(project,wall.id,point,undefined,{side:target.wallSide,snapping:options.snapping,item:options.item?.id?item:undefined}):null;}
  if(kind==='door'||kind==='window'){const wall=placementWall(project,target);return wall?.floorId===floorId?attachOpening(project,kind,wall.id,point,{side:target.wallSide,snapping:options.snapping}):null;}
  if(WALL_MOUNT_KINDS.includes(kind)){
    const wall=placementWall(project,target);if(wall?.floorId!==floorId)return null;
    const mount=wallMountPosition(project,wall.id,item,point,{side:target.wallSide,snapping:options.snapping,ignoreId:options.item?.id});return mount?{...item,...mount}:null;
  }
  if(kind==='ceilingLight'){
    const room=project.entities.find(e=>e.kind==='room'&&e.floorId===floorId&&inside(e,target.point.x,target.point.z));if(!room)return null;
    const height=ceilingHeight(project.entities,room);if(height===null||height<item.h+.002)return null;
    return {...item,x:snap(target.point.x,options.snapping),z:snap(target.point.z,options.snapping),y:height-item.h-.002,ceilingRoomId:room.id,roomId:room.id};
  }
  if(!options.plan&&picked?.floorId===floorId&&SUPPORT_KINDS.includes(picked.kind)&&(target.surfaceNormal?.y??0)>.6&&point.y!==undefined){
    const ratio=Math.max(0,Math.min(1,(point.y-(picked.y??0))/picked.h)),support=supportPosition(picked,item,point,options.snapping,ratio);return support?{...item,...support}:null;
  }
  // Countertop appliances still keep manual elevation when imported, but all
  // ordinary decorative items start on the floor until an actual top is clicked.
  if(['plant','plantSmall','succulent','flowerPot','lamp','cabinet','wallCabinet'].includes(kind))item={...item,y:0};
  return item;
}
export function placementDescription(item:Entity|null,project:Project){
  if(!item)return 'Sem encaixe aqui. Escolha uma superfície livre.';
  const parent=project.entities.find(e=>e.id===(item.wallMountId??item.switchWallId??item.hostId??item.supportId??item.ceilingRoomId));
  const base=(item.y??0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  return item.roofWallIds?`Paredes · base ${base} m`:item.ceilingRoomId?`Teto de ${parent?.name??'cômodo'} · base ${base} m`:item.wallMountId||item.switchWallId?`Parede · base ${base} m`:item.hostId?'Abertura na parede':item.supportId?`${parent?.name??'Móvel'} · base ${base} m`:`Piso · base ${base} m`;
}
export function suggestedAttachment(project:Project,item:Entity):Entity|null{
  if(item.kind==='roof')return fitRoof(project,item);
  if(WALL_MOUNT_KINDS.includes(item.kind)){
    const walls=project.entities.filter(w=>w.kind==='wall'&&w.floorId===item.floorId).sort((a,b)=>{
      const distance=(wall:Entity)=>{const local=localPoint(wall,item.x,item.z);return Math.hypot(Math.max(0,Math.abs(local.x)-wall.w/2),Math.abs(local.z));};return distance(a)-distance(b);
    });
    for(const wall of walls){const local=localPoint(wall,item.x,item.z);if(Math.abs(local.z)>2||Math.abs(local.x)>wall.w/2+1)continue;const mount=wallMountPosition(project,wall.id,item,{x:item.x,z:item.z,y:(item.y??0)+item.h/2},{side:Math.sign(local.z)||1,ignoreId:item.id});if(mount)return {...item,...mount,supportId:undefined,supportRatio:undefined};}
    return null;
  }
  if(item.kind==='ceilingLight')return suggestedPlacement(project,item.kind,item.floorId,{point:{x:item.x,z:item.z},entityId:null},{item,snapping:false});
  if(['plantSmall','succulent','flowerPot','microwave','cooktop','countertop'].includes(item.kind)){
    const supports=project.entities.filter(e=>e.id!==item.id&&e.floorId===item.floorId&&SUPPORT_KINDS.includes(e.kind)&&inside(e,item.x,item.z));
    for(const support of supports.sort((a,b)=>Math.abs((a.y??0)+a.h-(item.y??0))-Math.abs((b.y??0)+b.h-(item.y??0)))){const candidate=supportPosition(support,item,item);if(candidate)return {...item,...candidate};}
  }
  return null;
}
