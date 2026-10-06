import { catalogFor, localPoint, worldPoint, openingBase, type Entity, type Project } from './domain';

export type MovePoint={x:number;z:number;y?:number};
/** A face-mounted switch keeps its back flush with the wall, including rotated walls. */
export function switchMountPosition(project:Project,wallId:string,point:MovePoint,options:{item?:Entity;side?:number;snapping?:boolean;ignoreId?:string}={}){
  const wall=project.entities.find(e=>e.id===wallId&&e.kind==='wall');if(!wall)return null;
  const item=options.item??catalogFor('lightSwitch'),local=localPoint(wall,point.x,point.z);
  if(!Number.isFinite(local.x)||!Number.isFinite(local.z)||point.y!==undefined&&!Number.isFinite(point.y))return null;
  const side=Math.sign(options.side??local.z)||1,limit=(wall.w-item.w)/2-.02,maxY=wall.h-item.h-.02;
  if(limit<0||maxY<.02)return null;
  const quantize=(n:number)=>options.snapping?Math.round(n/.05)*.05:n;
  const x=Math.max(-limit,Math.min(limit,quantize(local.x))),y=Math.max(.02,Math.min(maxY,quantize((point.y??1.1+item.h/2)-item.h/2)));
  if(project.entities.some(e=>e.hostId===wall.id&&Math.abs(localPoint(wall,e.x,e.z).x-x)<(e.w+item.w)/2+.02&&y<openingBase(e)+e.h+.02&&y+item.h>openingBase(e)-.02))return null;
  if(project.entities.some(e=>e.kind==='lightSwitch'&&e.id!==options.ignoreId&&e.switchWallId===wall.id&&Math.sign(localPoint(wall,e.x,e.z).z)===side&&Math.abs(localPoint(wall,e.x,e.z).x-x)<(e.w+item.w)/2+.02&&Math.abs((e.y??1.1)-y)<Math.max(e.h,item.h)+.02))return null;
  const pos=worldPoint(wall,x,side*(wall.d/2+item.d/2+.002));
  return {...pos,y,rotation:wall.rotation+(side<0?180:0),switchWallId:wall.id};
}
