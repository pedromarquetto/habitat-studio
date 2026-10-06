import { switchMountPosition, type MovePoint } from './switch-mount';
import { localPoint, snap, worldPoint, type Project } from './domain';

export const MOVE_HOLD_MS = 450;
export const MOVE_SLOP_PX = 7;
type Pointer = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'isPrimary' | 'button' | 'buttons' | 'clientX' | 'clientY' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** Quick drags navigate. A stationary primary press can become an object drag. */
export class MoveGesture {
  private press: {id:number;x:number;y:number;phase:'holding'|'moving'} | null = null;
  get pointerId(){return this.press?.id ?? null;}
  get phase(){return this.press?.phase ?? null;}
  begin(p:Pointer){
    if(this.press || !p.isPrimary || p.button!==0 || p.altKey || p.ctrlKey || p.metaKey || p.shiftKey)return false;
    this.press={id:p.pointerId,x:p.clientX,y:p.clientY,phase:'holding'};return true;
  }
  activate(id:number){
    if(this.press?.id!==id || this.press.phase!=='holding')return false;
    this.press.phase='moving';return true;
  }
  move(p:Pointer):'hold'|'navigate'|'move'|'cancel'|null {
    if(!this.press || this.press.id!==p.pointerId)return null;
    if(p.pointerType!=='touch' && !(p.buttons&1))return 'cancel';
    if(this.press.phase==='moving')return 'move';
    return Math.hypot(p.clientX-this.press.x,p.clientY-this.press.y)>MOVE_SLOP_PX?'navigate':'hold';
  }
  end(id?:number){
    if(!this.press || id!==undefined && id!==this.press.id)return false;
    this.press=null;return true;
  }
}

/** Hosted openings slide along their wall without crossing another opening. */
export function entityMovePosition(project:Project,id:string,point:MovePoint,snapping:boolean):MovePoint|null {
  const item=project.entities.find(e=>e.id===id);
  if(!item || !Number.isFinite(point.x) || !Number.isFinite(point.z))return null;
  if(item.kind==='lightSwitch'&&item.switchWallId){
    const wall=project.entities.find(e=>e.id===item.switchWallId);if(!wall)return null;
    const side=Math.sign(localPoint(wall,item.x,item.z).z)||1;
    const mount=switchMountPosition(project,wall.id,{...point,y:(point.y??item.y??1.1)+item.h/2},{item,side,snapping,ignoreId:item.id});
    return mount?{x:mount.x,z:mount.z,y:mount.y}:null;
  }
  if(item.hostId){
    const wall=project.entities.find(e=>e.id===item.hostId && e.kind==='wall');
    if(!wall)return null;
    const limit=(wall.w-item.w)/2-.08;if(limit<0)return null;
    const x=Math.max(-limit,Math.min(limit,snap(localPoint(wall,point.x,point.z).x,snapping)));
    if(project.entities.some(e=>e.id!==id && e.hostId===wall.id && Math.abs(localPoint(wall,e.x,e.z).x-x)<(e.w+item.w)/2+.08))return null;
    const position=worldPoint(wall,x,0);
    return Math.abs(position.x)<=150 && Math.abs(position.z)<=150?position:null;
  }
  return {x:Math.max(-150,Math.min(150,snap(point.x,snapping))),z:Math.max(-150,Math.min(150,snap(point.z,snapping)))};
}
