import * as THREE from 'three';
import type { Entity } from './domain';

type Surface='wood'|'stone'|'fabric'|'metal'|'paint';
export function defaultFinish(e:Entity):Surface{
  if(e.finish&&e.finish!=='auto')return e.finish;
  if(e.kind==='room')return /banh|terraço|circula|patamar|hall/i.test(e.name)?'stone':'wood';
  if(['cabinet','baseCabinet','wallCabinet','drawerUnit','bookshelf','wardrobe','closetPanel','table','chair','door','pergola','fence'].includes(e.kind))return 'wood';
  if(['sofa','armchair','bed'].includes(e.kind))return 'fabric';
  if(['slab','countertop','paving','terrain'].includes(e.kind))return 'stone';
  if(['fridge','stove','microwave','washingMachine','dryer','dishwasher','oven','cooktop','hood','railing'].includes(e.kind))return 'metal';
  return 'paint';
}

/** Small repeatable numeric surface maps; no remote asset dependency. */
export class RealMaterials{
  private textures=new Map<Surface,THREE.DataTexture>();
  private texture(surface:Surface){
    const cached=this.textures.get(surface);if(cached)return cached;
    const n=128,data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const noise=(Math.sin(x*127.1+y*311.7)*43758.5453)%1,grain=Math.sin(x*.72+Math.sin(y*.098)*2.5);
      const value=surface==='wood'?222+grain*16+noise*8:surface==='fabric'?230+Math.sin(x*Math.PI/2)*7+Math.sin(y*Math.PI/2)*7:surface==='stone'?238+noise*12:surface==='metal'?247+Math.sin(y*.8)*4:249+noise*4;
      const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,Math.round(value)));data[i+3]=255;
    }
    const texture=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;texture.userData.sharedHabitatTexture=true;this.textures.set(surface,texture);return texture;
  }
  apply(group:THREE.Group,e:Entity){
    const done=new Set<THREE.Material>(),surface=defaultFinish(e);
    group.traverse(object=>{
      if(object instanceof THREE.Line){object.visible=false;return;}
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const m of materials){
        if(done.has(m)||!(m instanceof THREE.MeshStandardMaterial))continue;done.add(m);
        if(m.transparent){m.roughness=.08;m.metalness=.05;continue;}
        const type=(e.finish&&e.finish!=='auto'?e.finish:m.userData.surface??surface) as Surface,texture=this.texture(type);
        m.map=texture;m.bumpMap=texture;m.bumpScale=type==='wood'?.009:type==='fabric'?.005:type==='stone'?.006:.001;
        m.roughness=type==='metal'?.28:type==='wood'?.55:type==='stone'?.62:type==='fabric'?.96:.85;
        m.metalness=type==='metal'?.72:0;m.envMapIntensity=type==='metal'?1:.4;m.needsUpdate=true;
      }
      // Meter-based UVs avoid a single grain pattern stretching across a floor.
      const uv=object.geometry.getAttribute('uv'),normal=object.geometry.getAttribute('normal');
      const dimensions=(object.geometry as THREE.BoxGeometry).parameters;
      if(!uv||!normal||!dimensions?.width)return;
      const sx=dimensions.width*group.scale.x,sy=dimensions.height*group.scale.y,sz=dimensions.depth*group.scale.z;
      for(let i=0;i<uv.count;i++){
        const axis=Math.abs(normal.getX(i))>.5?'x':Math.abs(normal.getY(i))>.5?'y':'z';
        uv.setXY(i,uv.getX(i)*(axis==='x'?sz:sx),uv.getY(i)*(axis==='y'?sz:sy));
      }
      uv.needsUpdate=true;
    });
  }
  dispose(){for(const texture of this.textures.values())texture.dispose();this.textures.clear();}
}
