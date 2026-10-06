import * as THREE from 'three';
import { wallSections, openingBase, type Entity } from './domain';

export function material(color:string,roughness=.8) {return new THREE.MeshStandardMaterial({color,roughness,metalness:.02});}
export function makeModel(e:Entity,entities:Entity[],cutaway=false):THREE.Group {
  const group=new THREE.Group();group.userData.entityId=e.id;
  const mat=material(e.color);
  const dark=material('#46524e'),white=material('#f2efe7'),wood=material('#956e4e');
  wood.userData.surface='wood';dark.userData.surface='paint';white.userData.surface=['bed','sofa','armchair'].includes(e.kind)?'fabric':'paint';
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material=mat)=>{
    const surface=['room','terrain','lawn','paving'].includes(e.kind);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,surface?Math.max(1,Math.ceil(w/2)):1,1,surface?Math.max(1,Math.ceil(d/2)):1),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const cylinder=(x:number,y:number,z:number,r:number,h:number,m:THREE.Material=mat)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,18),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const legs=(top=.75)=>{for(const x of [-.39,.39])for(const z of [-.36,.36])box(x,top/2,z,.07,top,.07,wood);};
  switch(e.kind){
    case 'wall':{
      const height=cutaway?Math.min(e.h,1.1):e.h;
      for(const s of wallSections(e,entities,height)){
        const mesh=box(s.x,s.y,0,s.w,s.h,e.d);
        const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:'#d1d0c7'}));edge.position.copy(mesh.position);group.add(edge);
      }
      break;
    }
    case 'room':{
      box(0,-e.h/2,0,e.w,e.h,e.d);
      // Subtle plank lines preserve metric geometry rather than using external textures.
      const lineMat=new THREE.LineBasicMaterial({color:new THREE.Color(e.color).multiplyScalar(.88)});
      const points:THREE.Vector3[]=[];
      for(let x=-e.w/2+.35;x<e.w/2;x+=.35)points.push(new THREE.Vector3(x,.003,-e.d/2),new THREE.Vector3(x,.003,e.d/2));
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),lineMat));
      break;
    }
    case 'terrain': case 'lawn': case 'paving':{
      const top=e.kind==='terrain'?-.13:e.kind==='lawn'?-.065:-.02;
      box(0,top-e.h/2,0,e.w,e.h,e.d);
      if(e.kind==='paving'){
        const lines:THREE.Vector3[]=[];for(let x=-e.w/2+1;x<e.w/2;x++)lines.push(new THREE.Vector3(x,top+.002,-e.d/2),new THREE.Vector3(x,top+.002,e.d/2));
        for(let z=-e.d/2+1;z<e.d/2;z++)lines.push(new THREE.Vector3(-e.w/2,top+.002,z),new THREE.Vector3(e.w/2,top+.002,z));
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines),new THREE.LineBasicMaterial({color:'#94998f'})));
      }
      break;
    }
    case 'fence':{
      const posts=Math.max(2,Math.ceil(e.w/1.7)+1);for(let i=0;i<posts;i++)box(-e.w/2+.05+(e.w-.1)*i/(posts-1),e.h/2,0,.1,e.h,e.d);
      for(const t of [.35,.75])box(0,e.h*t,0,e.w,.12,e.d*.65);break;
    }
    case 'gate':{
      for(const x of [-1,1])box(x*(e.w/2-.06),e.h/2,0,.12,e.h,e.d);
      // The leaf slides alongside the opening; the center stays traversable.
      box(-e.w*.75,e.h*.46,-e.d*.7,e.w*.5,e.h*.82,e.d*.4);break;
    }
    case 'pool':{
      const rim=material('#ddd8c9');box(0,-e.h,0,e.w,.12,e.d,rim);
      for(const x of [-1,1])box(x*(e.w/2-.1),-e.h/2,0,.2,e.h,e.d,rim);
      for(const z of [-1,1])box(0,-e.h/2,z*(e.d/2-.1),e.w,e.h,.2,rim);
      box(0,-.15,0,Math.max(.05,e.w-.4),.04,Math.max(.05,e.d-.4));
      for(const z of [-1,1])box(0,.05,z*(e.d/2-.12),e.w,.1,.24,rim);
      for(const x of [-1,1])box(x*(e.w/2-.12),.05,0,.24,.1,e.d,rim);break;
    }
    case 'door': case 'window':{
      const base=openingBase(e),height=cutaway?Math.min(e.h,Math.max(0,1.1-base)):e.h;
      if(height<=0)break;
      box(-e.w/2,base+height/2,0,.06,height,e.d+.06,dark);
      box(e.w/2,base+height/2,0,.06,height,e.d+.06,dark);
      if(!cutaway)box(0,base+e.h,0,e.w+.08,.08,e.d+.06,dark);
      if(e.kind==='window'){
        box(0,base,0,e.w,.07,e.d+.1,dark);
        const glass=new THREE.MeshPhysicalMaterial({color:e.color,transparent:true,opacity:.28,roughness:.15,metalness:.15,depthWrite:false});
        box(0,base+height/2,0,e.w,height,.025,glass);
        box(0,base+height/2,0,.035,height,.04,dark);
      }else{
        // A permanently open leaf makes doorways traversable in this first version.
        const leaf=box(-e.w/2+(e.w*.14),height/2, e.w*.42,e.w*.3,height*.95,.05);
        leaf.rotation.y=-Math.PI/2;
      }
      break;
    }
    case 'roof':{
      const shape=new THREE.Shape();shape.moveTo(-e.w/2,0);shape.lineTo(0,e.h);shape.lineTo(e.w/2,0);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:e.d,bevelEnabled:false});
      const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(0,2.95,-e.d/2);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      break;
    }
    case 'slab':box(0,e.h/2,0,e.w,e.h,e.d);break;
    case 'pergola':{
      for(const x of [-1,1])for(const z of [-1,1])box(x*(e.w/2-.07),e.h/2,z*(e.d/2-.07),.14,e.h,.14);
      for(const z of [-1,1])box(0,e.h-.12,z*(e.d/2-.08),e.w,.18,.16);
      const beams=Math.max(4,Math.ceil(e.w/.3));for(let i=0;i<beams;i++)box(-e.w/2+.07+(e.w-.14)*i/(beams-1),e.h-.04,0,.08,.08,e.d);
      break;
    }
    case 'railing':{
      const panels=Math.max(1,Math.ceil(e.w/1.2)),glass=new THREE.MeshPhysicalMaterial({color:'#bcdce3',roughness:.12,metalness:.05,transparent:true,opacity:.24,depthWrite:false});
      for(let i=0;i<=panels;i++)box(-e.w/2+i*e.w/panels,e.h/2,0,.035,e.h,e.d,dark);
      box(0,e.h-.025,0,e.w,.05,e.d,dark);
      for(let i=0;i<panels;i++)box(-e.w/2+(i+.5)*e.w/panels,e.h*.47,0,e.w/panels-.05,e.h*.85,.018,glass);
      break;
    }
    case 'stairs':{
      const steps=Math.max(8,Math.ceil(e.h/.18));
      for(let i=0;i<steps;i++){const h=(i+1)*e.h/steps;box(0,h/2,-e.d/2+(i+.5)*e.d/steps,e.w,h,e.d/steps);}
      const railMat=material('#536761');
      for(const side of [-1,1]){
        for(let i=0;i<5;i++){const t=i/4;box(side*e.w/2,t*e.h+.5,-e.d/2+t*e.d,.035,1,.035,railMat);}
        const rail=box(side*e.w/2,e.h/2+1,0,.045,Math.hypot(e.h,e.d),.045,railMat);rail.rotation.x=Math.atan2(e.d,e.h);
      }
      break;
    }
    default:{
      group.scale.set(e.w,e.h,e.d);
      switch(e.kind){
        case 'object':box(0,.5,0,1,1,1);break;
        case 'tree':{
          cylinder(0,.3,0,.07,.6,wood);
          for(const [x,y,z,r] of [[0,.72,0,.3],[-.17,.63,.1,.23],[.17,.68,-.1,.23]]){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);}break;
        }
        case 'sofa':
          box(0,.18,0,.95,.28,.95);box(0,.68,-.38,.94,.64,.2);box(-.44,.48,0,.14,.65,1);box(.44,.48,0,.14,.65,1);
          for(const x of [-.26,0,.26])box(x,.44,.06,.25,.22,.72);
          for(const x of [-.3,.3]){const cushion=box(x,.67,-.18,.25,.28,.14,white);cushion.rotation.z=x*.3;}break;
        case 'armchair':box(0,.3,0,1,.45,.9);box(0,.75,-.36,.9,.5,.22);box(-.42,.6,0,.16,.5,1);box(.42,.6,0,.16,.5,1);break;
        case 'bed':
          box(0,.23,0,1,.34,1,wood);box(0,.5,0,1,.24,.96,white);box(0,.85,-.45,1.06,.3,.12,wood);box(0,.66,.15,1.01,.07,.66);
          box(-.23,.69,-.3,.4,.12,.2,white);box(.23,.69,-.3,.4,.12,.2,white);break;
        case 'table':legs(.9);box(0,.94,0,1,.12,1);break;
        case 'chair':legs(.48);box(0,.5,0,1,.1,1);box(0,.78,-.4,.95,.45,.12);break;
        case 'cabinet':box(0,.5,0,1,1,1);box(0,.5,.51,.02,.95,.025,dark);for(const x of [-.08,.08])box(x,.5,.53,.02,.14,.025,dark);break;
        case 'baseCabinet':case 'wallCabinet':case 'wardrobe':{
          box(0,.5,0,1,1,1);const doors=e.kind==='wardrobe'?3:2;
          for(let i=1;i<doors;i++)box(-.5+i/doors,.5,.505,.008,.96,.012,dark);
          for(let i=0;i<doors;i++)box(-.5+(i+.65)/doors,.53,.515,.015,.14,.015,dark);
          if(e.kind==='baseCabinet')box(0,.97,0,1,.06,1,white);break;
        }
        case 'drawerUnit':{
          box(0,.5,0,1,1,1);
          for(let i=0;i<4;i++){box(0,(i+.5)/4,.505,.94,.232,.016);box(0,(i+.5)/4,.524,.35,.017,.02,dark);}break;
        }
        case 'bookshelf':{
          box(-.47,.5,0,.06,1,1);box(.47,.5,0,.06,1,1);box(0,.5,-.47,.88,1,.06);
          for(let i=0;i<=5;i++)box(0,.025+i*.19,0,.9,.04,1);
          const books=[material('#47666a'),material('#b0714f'),material('#cfbc92')];
          for(let shelf=0;shelf<3;shelf++)for(let i=0;i<5;i++)box(-.3+i*.1,.13+shelf*.19,0,.07,.14,.48,books[i%3]);break;
        }
        case 'closetPanel':{
          box(0,.5,-.25,1,1,.5,dark);for(let i=0;i<18;i++)box(-.47+i*.055,.5,.12,.028,1,.75);break;
        }
        case 'countertop':box(0,.5,0,1,1,1);break;
        case 'fridge':box(0,.5,0,1,1,1);box(0,.7,.51,.99,.018,.02,dark);box(.37,.4,.53,.025,.21,.03,dark);box(.37,.83,.53,.025,.16,.03,dark);break;
        case 'washingMachine':case 'dryer':{
          box(0,.5,0,1,1,1);box(0,.89,.506,.92,.12,.02,white);
          const rim=cylinder(0,.44,.515,.32,.04,dark);rim.rotation.x=Math.PI/2;
          const glass=cylinder(0,.44,.545,.265,.02,material(e.kind==='dryer'?'#607680':'#32494e',.18));glass.rotation.x=Math.PI/2;
          cylinder(.3,.9,.53,.035,.02,dark).rotation.x=Math.PI/2;box(-.25,.9,.53,.25,.05,.025,dark);break;
        }
        case 'microwave':case 'oven':{
          box(0,.5,0,1,1,1);box(-.06,.5,.505,.76,.73,.025,dark);box(-.06,.5,.525,.59,.51,.015,material('#344d50',.12));
          box(.28,.5,.54,.025,.48,.03,white);box(.4,.75,.53,.065,.06,.02,dark);box(.4,.52,.53,.07,.2,.02,dark);break;
        }
        case 'dishwasher':{
          box(0,.5,0,1,1,1);box(0,.9,.505,.98,.16,.025,dark);box(0,.78,.54,.7,.025,.04,white);box(-.28,.91,.525,.17,.04,.015,white);break;
        }
        case 'cooktop':{
          box(0,.25,0,1,.5,1,dark);
          for(const x of [-.26,.26])for(const z of [-.25,.25]){
            cylinder(x,.6,z,.17,.18,mat);cylinder(x,.75,z,.115,.12,dark);
          }break;
        }
        case 'hood':box(0,.14,0,1,.28,1);box(0,.64,-.2,.32,.72,.45);box(0,.02,0,.8,.035,.75,dark);break;
        case 'airConditioner':{
          box(0,.5,0,1,.9,1);box(0,.16,.5,.88,.13,.02,dark);
          for(let i=0;i<4;i++)box(0,.15+i*.035,.514,.86,.012,.025,white);
          box(.35,.55,.512,.1,.05,.02,dark);break;
        }
        case 'stove':
          box(0,.46,0,1,.92,1);box(0,.98,0,1,.05,1,dark);box(0,.44,.505,.75,.48,.02,dark);
          for(const x of [-.26,.26])for(const z of [-.25,.25])cylinder(x,1.01,z,.14,.025,wood);
          for(const x of [-.3,-.1,.1,.3])cylinder(x,.83,.53,.04,.03,dark).rotation.x=Math.PI/2;break;
        case 'sink':box(0,.45,0,.96,.9,.95);box(0,.95,0,1,.1,1,white);box(0,1.006,0,.5,.025,.55,dark);cylinder(.28,1.07,-.25,.025,.2,dark);break;
        case 'toilet':cylinder(0,.25,.08,.33,.45,white);box(0,.65,-.3,.9,.7,.36,white);cylinder(0,.5,.13,.42,.12,mat);break;
        case 'plant':{
          cylinder(0,.17,0,.28,.34,wood);cylinder(0,.45,0,.025,.7,dark);
          for(let i=0;i<9;i++){const angle=i*2.4,mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),mat);mesh.position.set(Math.sin(angle)*.21,.5+i*.055,Math.cos(angle)*.21);mesh.scale.set(.8,1.35,.65);mesh.rotation.z=Math.sin(angle)*.6;mesh.castShadow=true;group.add(mesh);}break;
        }
        case 'lamp':cylinder(0,.03,0,.32,.06,dark);cylinder(0,.5,0,.025,.9,dark);cylinder(0,.9,0,.45,.22);break;
      }
    }
  }
  if(e.product){
    const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
    group.scale.multiply(new THREE.Vector3(e.w/Math.max(size.x,.001),e.h/Math.max(size.y,.001),e.d/Math.max(size.z,.001)));
    const normalized=new THREE.Box3().setFromObject(group),offset=normalized.getCenter(new THREE.Vector3());offset.y=normalized.min.y;
    for(const child of group.children)child.position.sub(offset.clone().divide(group.scale));
  }
  // Child picking always resolves to the stable document entity.
  group.traverse(obj=>{obj.userData.entityId=e.id;});
  // Materials not used by a model are disposed immediately.
  const used=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])used.add(m);});
  for(const m of [mat,dark,white,wood])if(!used.has(m))m.dispose();
  return group;
}
export function disposeObject(object:THREE.Object3D){
  const mats=new Set<THREE.Material>();
  object.traverse(o=>{
    if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Sprite){
      if('geometry' in o)o.geometry.dispose();
      for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);
    }
  });
  const textures=new Set<THREE.Texture>();
  for(const m of mats){for(const key of ['map','bumpMap','roughnessMap','normalMap','metalnessMap','emissiveMap'] as const){const texture=(m as THREE.MeshStandardMaterial)[key];if(texture instanceof THREE.Texture&&!texture.userData.sharedHabitatTexture)textures.add(texture);}m.dispose();}
  for(const texture of textures)texture.dispose();
}
