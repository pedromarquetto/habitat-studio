/** A screen-space dial: clockwise pointer travel rotates around the vertical axis. */
export const normalizeRotation=(degrees:number)=>((degrees%360)+360)%360;
type Point={x:number;y:number};
export class RotationDial {
  private last:number;
  private delta=0;
  private center:Point;
  private initial:number;
  constructor(center:Point,start:Point,initial:number){this.center=center;this.initial=initial;this.last=this.angle(start);}
  private angle(point:Point){return Math.atan2(point.y-this.center.y,point.x-this.center.x);}
  move(point:Point,snapping:boolean){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.hypot(point.x-this.center.x,point.y-this.center.y)<12)return null;
    const angle=this.angle(point),change=angle-this.last;
    this.delta+=Math.atan2(Math.sin(change),Math.cos(change))*180/Math.PI;this.last=angle;
    // A click or tiny jitter must preserve an existing non-grid angle.
    if(Math.abs(this.delta)<.75)return this.initial;
    const value=this.initial-this.delta;
    return normalizeRotation(snapping?Math.round(value/15)*15:Math.round(value*10)/10);
  }
}
