import * as THREE from 'three';
import type { Project } from './domain';
import { lightSettings, switchRoom } from './lighting';

export interface SwitchTarget {id:string;name:string;on:boolean}
/** The first mesh must be the switch: walls and furniture cannot be clicked through. */
export function reachableSwitch(project:Project,objects:THREE.Object3D[],camera:THREE.Camera,mouse=new THREE.Vector2()):SwitchTarget|null{
  const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);
  const hit=ray.intersectObjects(objects,true).find(h=>h.object instanceof THREE.Mesh);
  if(!hit||hit.distance>2.5)return null;
  const item=project.entities.find(e=>e.id===hit.object.userData.entityId&&e.kind==='lightSwitch');if(!item)return null;
  const room=switchRoom(project,item);return room?{id:item.id,name:room.name,on:lightSettings(room).on}:null;
}
