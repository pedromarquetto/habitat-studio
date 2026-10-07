import * as THREE from 'three';
import { localPoint, wallSections, type Entity, type Project } from './domain';

/** Enclosed rooms receive a presentation-only ceiling; open terraces and stair shafts remain open. */
export function roomCeiling(project:Project,room:Entity):number|null{
  if(room.kind!=='room'||room.w<2||room.d<2||/terraço|varanda|pátio|patamar|circula/i.test(room.name))return null;
  const angle=room.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const walls=project.entities.filter(w=>w.kind==='wall'&&w.floorId===room.floorId);
  const sides=[[-room.w/2,0],[room.w/2,0],[0,-room.d/2],[0,room.d/2]];
  const bordering=sides.map(([x,z])=>walls.find(w=>{const p=localPoint(w,room.x+x*c+z*s,room.z-x*s+z*c);return Math.abs(p.z)<=w.d/2+.2&&Math.abs(p.x)<=w.w/2+.2;})).filter((w):w is Entity=>Boolean(w));
  if(bordering.length<3)return null;
  return Math.min(...bordering.map(w=>(w.y??0)+w.h));
}
export function addWallTrim(model:THREE.Group,wall:Entity,entities:Entity[]){
  if(wall.kind!=='wall')return;
  const material=new THREE.MeshStandardMaterial({color:'#eeede7',roughness:.62});material.userData.surface='paint';
  const segments=wallSections(wall,entities,.1);
  for(const segment of segments)for(const side of [-1,1]){const trim=new THREE.Mesh(new THREE.BoxGeometry(segment.w,.09,.018),material);trim.position.set(segment.x,.05,side*(wall.d/2+.009));trim.castShadow=trim.receiveShadow=true;trim.userData.entityId=wall.id;model.add(trim);}
  if(!segments.length)material.dispose();
}
export function makeCeiling(room:Entity,height:number){
  const material=new THREE.MeshStandardMaterial({color:'#f3f1eb',roughness:.94});material.userData.surface='paint';
  const ceiling=new THREE.Mesh(new THREE.BoxGeometry(room.w,.06,room.d),material);ceiling.position.y=height+.03;ceiling.castShadow=ceiling.receiveShadow=true;
  const group=new THREE.Group();group.add(ceiling);return group;
}
