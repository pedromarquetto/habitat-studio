import * as THREE from 'three';
import { disposeObject } from './models';
import { geographicData } from './geographic-fetch';
import { EMPTY_CONTEXT, geoToLocal, localToGeo, tilePoint, terrariumHeight, intersectsLot, pointInRing, type ProjectLocation, type GeographicData, type Point, type ContextStatus } from './geography';

type HeightTile={pixels:Uint8ClampedArray;width:number;height:number};
type Neighbor={rings:Point[][];bottom:number;top:number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number}};
export class GeographicScene {
  readonly group=new THREE.Group();
  private location:ProjectLocation|null=null;
  private key='';private abort:AbortController|null=null;private disposed=false;
  private data:GeographicData|null=null;private tiles=new Map<string,HeightTile>();private neighbors:Neighbor[]=[];
  private altitude=0;private terrainReady=false;private status:ContextStatus={...EMPTY_CONTEXT};
  constructor(private software:boolean,private onStatus:(status:ContextStatus)=>void,private invalidate:()=>void){this.group.name='Entorno geográfico';}
  update(location?:ProjectLocation){
    const key=location?.enabled?JSON.stringify(location):'';if(this.key===key)return;
    this.abort?.abort();this.abort=null;this.key=key;this.location=location?.enabled?location:null;
    this.data=null;this.tiles.clear();this.terrainReady=false;this.neighbors=[];disposeObject(this.group);this.group.clear();
    if(!this.location){this.report({...EMPTY_CONTEXT});this.invalidate();return;}
    const controller=new AbortController();this.abort=controller;this.report({...EMPTY_CONTEXT,state:'loading',terrain:'loading'});
    this.build();void this.load(this.location,controller);
  }
  private report(status:ContextStatus){this.status=status;this.onStatus({...status});}
  private async load(location:ProjectLocation,controller:AbortController){
    const signal=controller.signal;
    const contextTask=geographicData(location,signal);
    const terrainTask=this.loadTerrain(location,signal);
    await Promise.allSettled([
      contextTask.then(data=>{if(signal.aborted)return;this.data=data;this.build();this.report({...this.status,state:'ready',message:data.truncated?'Área muito densa: parte dos elementos foi omitida.':data.features.length?this.status.message:'Este ponto tem poucos dados mapeados.'});}).catch(error=>{if(!signal.aborted)this.report({...this.status,state:'error',message:error instanceof Error?error.message:'Não foi possível carregar o entorno.'});}),
      terrainTask.then(()=>{if(signal.aborted)return;this.terrainReady=true;this.altitude=this.rawHeight(0,0);this.build();this.report({...this.status,terrain:'real',altitude:Math.round(this.altitude)});}).catch(()=>{if(!signal.aborted){this.terrainReady=false;this.tiles.clear();this.report({...this.status,terrain:'flat',altitude:undefined});}}),
    ]);
  }
  private async loadTerrain(location:ProjectLocation,signal:AbortSignal){
    const samples=[{x:0,z:0},...[-location.radius,location.radius].flatMap(x=>[-location.radius,location.radius].map(z=>({x,z})))];
    const keys=new Set(samples.map(p=>{const t=tilePoint(localToGeo(p,location),12);return`${Math.floor(t.x)},${Math.floor(t.y)}`;}));
    if(keys.size>4)throw new Error('Relevo indisponível.');
    const results=await Promise.all([...keys].map(async key=>{
      const [x,y]=key.split(',').map(Number),response=await fetch(`https://tiles.mapterhorn.com/12/${x}/${y}.webp`,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
      if(!response.ok)throw new Error('Relevo indisponível.');
      const bitmap=await createImageBitmap(await response.blob());
      try{if(signal.aborted)throw new Error('Cancelado');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Relevo indisponível.');context.drawImage(bitmap,0,0);return{key,tile:{pixels:context.getImageData(0,0,bitmap.width,bitmap.height).data,width:bitmap.width,height:bitmap.height}};}finally{bitmap.close();}
    }));
    if(signal.aborted)return;for(const item of results)this.tiles.set(item.key,item.tile);
  }
  private rawHeight(x:number,z:number){
    if(!this.location)return 0;const point=tilePoint(localToGeo({x,z},this.location),12),tile=this.tiles.get(`${Math.floor(point.x)},${Math.floor(point.y)}`);if(!tile)return this.altitude;
    const u=Math.max(0,Math.min(tile.width-1,(point.x-Math.floor(point.x))*tile.width)),v=Math.max(0,Math.min(tile.height-1,(point.y-Math.floor(point.y))*tile.height));
    const x0=Math.floor(u),y0=Math.floor(v),read=(a:number,b:number)=>{const i=(b*tile.width+a)*4;return terrariumHeight(tile.pixels[i],tile.pixels[i+1],tile.pixels[i+2]);};
    const a=read(x0,y0),b=read(Math.min(x0+1,tile.width-1),y0),c=read(x0,Math.min(y0+1,tile.height-1)),d=read(Math.min(x0+1,tile.width-1),Math.min(y0+1,tile.height-1));
    return(a*(1-(u-x0))+b*(u-x0))*(1-(v-y0))+(c*(1-(u-x0))+d*(u-x0))*(v-y0);
  }
  surface=(x:number,z:number):number=>{
    const l=this.location;if(!l||!this.terrainReady)return 0;
    const distance=Math.max(0,Math.abs(x)-l.lotWidth/2,Math.abs(z)-l.lotDepth/2),t=Math.min(1,distance/8);
    return(this.rawHeight(x,z)-this.altitude-l.baseOffset)*t*t*(3-2*t);
  };
  blocked=(x:number,z:number,feet:number):boolean=>{
    const l=this.location;if(!l)return false;if(Math.abs(x)>l.radius-1||Math.abs(z)>l.radius-1)return true;
    return this.neighbors.some(n=>feet+1.65>n.bottom&&feet<n.top&&x>n.bounds.minX-.24&&x<n.bounds.maxX+.24&&z>n.bounds.minZ-.24&&z<n.bounds.maxZ+.24&&
      [{x,z},{x:x+.24,z},{x:x-.24,z},{x,z:z+.24},{x,z:z-.24}].some(p=>pointInRing(p,n.rings[0])&&!n.rings.slice(1).some(h=>pointInRing(p,h))));
  };
  get active(){return !!this.location;}
  private material(color:string){return new THREE.MeshStandardMaterial({color,roughness:.9,side:THREE.DoubleSide});}
  private build(){
    disposeObject(this.group);this.group.clear();this.neighbors=[];const l=this.location;if(!l||this.disposed)return;
    const steps=this.software?16:40,positions:number[]=[],indices:number[]=[];
    for(let row=0;row<=steps;row++)for(let col=0;col<=steps;col++){const x=(col/steps*2-1)*l.radius,z=(row/steps*2-1)*l.radius;positions.push(x,this.surface(x,z)-.06,z);}
    for(let row=0;row<steps;row++)for(let col=0;col<steps;col++){const a=row*(steps+1)+col,b=a+1,c=a+steps+1,d=c+1;indices.push(a,c,b,b,c,d);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
    const ground=new THREE.Mesh(geo,this.material('#839f76'));ground.receiveShadow=true;if(this.software)ground.renderOrder=-100;this.group.add(ground);
    const lot=new THREE.Mesh(new THREE.BoxGeometry(l.lotWidth,.1,l.lotDepth),this.material('#a3b29a'));lot.position.y=-.055;lot.receiveShadow=true;if(this.software)lot.renderOrder=-80;this.group.add(lot);
    const border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(l.lotWidth,.02,l.lotDepth)),new THREE.LineBasicMaterial({color:'#54754b'}));border.position.y=-.01;this.group.add(border);
    let buildings=0,roads=0,estimated=0,reduced=false;
    const features=this.software?[...(this.data?.features??[])].sort((a,b)=>{const distance=(f:typeof a)=>Math.min(...f.rings[0].map(p=>{const q=geoToLocal(p,l);return q.x*q.x+q.z*q.z;}));return distance(a)-distance(b);}):this.data?.features??[];
    for(const f of features){
      const rings=f.rings.map(r=>r.map(p=>geoToLocal(p,l))),outer=rings[0];if(!outer?.length||outer.every(p=>Math.abs(p.x)>l.radius+60||Math.abs(p.z)>l.radius+60))continue;
      if(f.kind==='building'){
        if(intersectsLot(outer,l))continue;
        if(this.software&&buildings>=80){reduced=true;continue;}
        const shape=new THREE.Shape(outer.map(p=>new THREE.Vector2(p.x,-p.z)));for(const hole of rings.slice(1))shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(p.x,-p.z))));
        const bottom=Math.min(...outer.map(p=>this.surface(p.x,p.z)))-.08,geometry=new THREE.ExtrudeGeometry(shape,{depth:f.height-f.minHeight,bevelEnabled:false,curveSegments:1});geometry.rotateX(-Math.PI/2);
        const mesh=new THREE.Mesh(geometry,this.material(f.estimated?'#b8bab0':'#c2c3b9'));mesh.position.y=bottom+f.minHeight;mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);
        this.neighbors.push({rings,bottom:bottom+f.minHeight,top:bottom+f.height,bounds:{minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z))}});
        buildings++;if(f.estimated)estimated++;
      }else if(f.kind==='road'){
        if(this.software&&roads>=100){reduced=true;continue;}
        const verts:number[]=[],idx:number[]=[];for(let i=0;i<outer.length-1;i++){
          const a=outer[i],b=outer[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.1||len>1500)continue;
          const count=Math.max(1,Math.ceil(len/12));for(let j=0;j<count;j++){
            const p={x:a.x+dx*j/count,z:a.z+dz*j/count},q={x:a.x+dx*(j+1)/count,z:a.z+dz*(j+1)/count};if(Math.abs(p.x)>l.radius+30||Math.abs(p.z)>l.radius+30)continue;
            const rx=-dz/len*f.width/2,rz=dx/len*f.width/2,points=[{x:p.x+rx,z:p.z+rz},{x:p.x-rx,z:p.z-rz},{x:q.x+rx,z:q.z+rz},{x:q.x-rx,z:q.z-rz}],start=verts.length/3;
            for(const point of points)verts.push(point.x,this.surface(point.x,point.z)-.025,point.z);idx.push(start,start+2,start+1,start+1,start+2,start+3);
          }
        }
        if(!verts.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geometry.setIndex(idx);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,this.material('#747e7b'));mesh.receiveShadow=true;if(this.software)mesh.renderOrder=-90;this.group.add(mesh);roads++;
      }else{
        const shape=new THREE.Shape(outer.map(p=>new THREE.Vector2(p.x,-p.z))),geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);const points=geometry.attributes.position;
        for(let i=0;i<points.count;i++)points.setY(i,this.surface(points.getX(i),points.getZ(i))-.035);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,this.material(f.kind==='water'?'#679daa':'#638958'));if(this.software)mesh.renderOrder=-95;this.group.add(mesh);
      }
    }
    this.report({...this.status,buildings,roads,estimated,message:reduced?'Visualização leve: parte do entorno foi ocultada.':this.status.message});this.group.updateMatrixWorld(true);this.invalidate();
  }
  retry(){const location=this.location;this.key='';this.update(location??undefined);}
  dispose(){this.disposed=true;this.abort?.abort();disposeObject(this.group);this.group.clear();this.tiles.clear();}
}
