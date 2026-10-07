import * as THREE from 'three';
import type { Entity } from './domain';

export type Surface='wood'|'stone'|'fabric'|'metal'|'paint';
export interface MaterialStatus {state:'loading'|'ready'|'partial';loaded:number;total:number}
interface SurfaceMaps {map:THREE.Texture;normalMap:THREE.Texture;roughnessMap:THREE.Texture}
export const SURFACE_ASSETS={wood:{name:'oak',tile:[.85,1.8]},stone:{name:'limestone',tile:[1.2,1.2]},fabric:{name:'linen',tile:[.22,.22]},paint:{name:'plaster',tile:[.65,.65]}} as const;
export function defaultFinish(e:Entity):Surface{
  if(e.finish&&e.finish!=='auto')return e.finish;
  if(e.kind==='room')return /banh|terraço|circula|patamar|hall/i.test(e.name)?'stone':'wood';
  if(['cabinet','baseCabinet','wallCabinet','drawerUnit','bookshelf','wardrobe','closetPanel','table','chair','door','pergola','fence'].includes(e.kind))return 'wood';
  if(['sofa','armchair','bed'].includes(e.kind))return 'fabric';
  if(['slab','countertop','paving','terrain'].includes(e.kind))return 'stone';
  if(['fridge','stove','microwave','washingMachine','dryer','dishwasher','oven','cooktop','hood','railing'].includes(e.kind))return 'metal';
  return 'paint';
}
/** Shared local PBR assets, with deterministic maps until images have loaded. */
export class RealMaterials{
  private textures=new Map<Surface,SurfaceMaps>();private owned=new Set<THREE.Texture>();
  private bindings=new Map<Surface,Set<THREE.MeshPhysicalMaterial>>();private loading=new Set<Surface>();
  private stopped=false;private loaded=0;private failed=0;private total=0;
  private onStatus?: (status:MaterialStatus)=>void;private anisotropy:number;private onReady?:()=>void;
  constructor(onStatus?:(status:MaterialStatus)=>void,anisotropy=4,onReady?:()=>void){this.onStatus=onStatus;this.anisotropy=anisotropy;this.onReady=onReady;}
  private own(texture:THREE.Texture,color=false){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=this.anisotropy;texture.userData.sharedHabitatTexture=true;texture.needsUpdate=true;this.owned.add(texture);return texture;}
  private maps(surface:Surface){
    const cached=this.textures.get(surface);if(cached)return cached;
    const n=128,albedo=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4),rough=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const noise=Math.sin(x*127.1+y*311.7)*43758.5453%1,grain=Math.sin(x*.72+Math.sin(y*.098)*2.5),i=(y*n+x)*4;
      const value=surface==='wood'?225+grain*15+noise*8:surface==='fabric'?233+Math.sin(x*Math.PI/2)*8+Math.sin(y*Math.PI/2)*8:surface==='stone'?240+noise*12:surface==='metal'?250+Math.sin(y*.8)*4:249+noise*4;
      albedo[i]=albedo[i+1]=albedo[i+2]=value;albedo[i+3]=255;
      normal[i]=128+noise*8;normal[i+1]=128+grain*5;normal[i+2]=255;normal[i+3]=255;
      rough[i]=rough[i+1]=rough[i+2]=(surface==='metal'?85:surface==='fabric'?243:surface==='paint'?235:180)+noise*10;rough[i+3]=255;
    }
    const maps={map:this.own(new THREE.DataTexture(albedo,n,n,THREE.RGBAFormat),true),normalMap:this.own(new THREE.DataTexture(normal,n,n,THREE.RGBAFormat)),roughnessMap:this.own(new THREE.DataTexture(rough,n,n,THREE.RGBAFormat))};this.textures.set(surface,maps);return maps;
  }
  private status(){this.onStatus?.({state:this.loaded+this.failed<this.total?'loading':this.failed?'partial':'ready',loaded:this.loaded,total:this.total});}
  private load(surface:Surface){
    if(surface==='metal'||typeof document==='undefined'||this.loading.has(surface)||this.stopped)return;
    this.loading.add(surface);this.total+=3;this.status();const asset=SURFACE_ASSETS[surface],maps=this.maps(surface),loader=new THREE.TextureLoader();
    for(const [key,suffix] of [['map','albedo'],['normalMap','normal'],['roughnessMap','roughness']] as const){
      loader.load(`/materials/${asset.name}-${suffix}.jpg`,texture=>{
        if(this.stopped){texture.dispose();return;}
        this.own(texture,key==='map');maps[key]=texture;
        for(const mat of this.bindings.get(surface)??[]){mat[key]=texture;mat.needsUpdate=true;}
        this.loaded++;this.status();this.onReady?.();
      },undefined,()=>{if(!this.stopped){this.failed++;this.status();this.onReady?.();}});
    }
  }
  apply(group:THREE.Group,e:Entity){
    const replacements=new Map<THREE.MeshStandardMaterial,THREE.MeshPhysicalMaterial>(),surface=defaultFinish(e);
    group.traverse(object=>{
      if(object instanceof THREE.Line){object.visible=false;return;}
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const next=materials.map(original=>{
        if(!(original instanceof THREE.MeshStandardMaterial))return original;
        const cached=replacements.get(original);if(cached)return cached;
        const m=new THREE.MeshPhysicalMaterial({color:original.color.clone(),emissive:original.emissive.clone(),emissiveIntensity:original.emissiveIntensity,side:original.side,opacity:original.opacity,transparent:original.transparent,depthWrite:original.depthWrite});m.userData={...original.userData};
        replacements.set(original,m);
        if(m.transparent){object.castShadow=false;m.roughness=.04;m.metalness=0;m.ior=1.45;m.clearcoat=1;m.clearcoatRoughness=.06;return m;}
        if(object.userData.lightEmitter||original.emissive.getHex()!==0){object.castShadow=false;m.roughness=.4;return m;}
        const type=(e.finish&&e.finish!=='auto'&&!m.userData.hardware?e.finish:m.userData.surface??surface) as Surface,maps=this.maps(type);
        m.map=maps.map;m.normalMap=maps.normalMap;m.roughnessMap=maps.roughnessMap;m.normalScale.setScalar(type==='fabric'?.5:type==='wood'?.3:type==='paint'?.18:.25);
        m.roughness=type==='metal'?.7:1;m.metalness=type==='metal'?.72:0;m.envMapIntensity=type==='metal'?1:.7;
        m.clearcoat=type==='wood'?.18:type==='stone'?.22:type==='metal'?.3:0;m.clearcoatRoughness=.35;
        if(type==='fabric'){m.sheen=1;m.sheenColor.copy(m.color);m.sheenRoughness=.85;}
        if(!m.userData.hardware&&['wood','stone'].includes(type))m.color.lerp(new THREE.Color('#ffffff'),.45);
        const set=this.bindings.get(type)??new Set<THREE.MeshPhysicalMaterial>();set.add(m);this.bindings.set(type,set);m.addEventListener('dispose',()=>set.delete(m));this.load(type);return m;
      });
      object.material=Array.isArray(object.material)?next:next[0];
      const uv=object.geometry.getAttribute('uv'),normal=object.geometry.getAttribute('normal'),position=object.geometry.getAttribute('position');
      if(!uv||!normal||!position||object.geometry.userData.habitatMetricUV)return;
      const type=(e.finish&&e.finish!=='auto'?e.finish:next[0]?.userData.surface??surface) as Surface,tile=type==='metal'?[.4,.4]:SURFACE_ASSETS[type].tile;
      // Position projection keeps a 1 m surface at the same texel scale at any object size.
      if((object.geometry as THREE.BoxGeometry).parameters?.width){
        for(let i=0;i<uv.count;i++){
          const axis=Math.abs(normal.getX(i))>.5?'x':Math.abs(normal.getY(i))>.5?'y':'z';
          const x=position.getX(i)*group.scale.x,y=position.getY(i)*group.scale.y,z=position.getZ(i)*group.scale.z;
          uv.setXY(i,(axis==='x'?z:x)/tile[0],(axis==='y'?z:y)/tile[1]);
        }
      }else{for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(e.w,e.d)/tile[0],uv.getY(i)*e.h/tile[1]);}
      uv.needsUpdate=true;object.geometry.userData.habitatMetricUV=true;
    });
    for(const original of replacements.keys())original.dispose();
  }
  dispose(){this.stopped=true;for(const texture of this.owned)texture.dispose();this.owned.clear();this.textures.clear();this.bindings.clear();}
}
