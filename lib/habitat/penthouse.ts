import { entity, uid, worldPoint, type Entity, type Project } from './domain';

type Rect={left:number;right:number;front:number;back:number};
function subtract(rect:Rect,hole:Rect):Rect[]{
  const l=Math.max(rect.left,hole.left),r=Math.min(rect.right,hole.right),f=Math.max(rect.front,hole.front),b=Math.min(rect.back,hole.back);
  if(l>=r||f>=b)return [rect];
  return [{...rect,right:l},{...rect,left:r},{left:l,right:r,front:rect.front,back:f},{left:l,right:r,front:b,back:rect.back}].filter(p=>p.right-p.left>=.05&&p.back-p.front>=.05);
}
/** Add a distinct, editable top floor; preserve all lower-floor entities. */
export function addPenthouse(project:Project,style:'apartment'|'terrace'='apartment'):{project:Project;floorId:string}{
  if(project.floors.length>=20)throw new Error('Limite de 20 andares atingido.');
  const top=project.floors.reduce((a,b)=>a.elevation>b.elevation?a:b),elevation=top.elevation+3.2;
  if(elevation>100)throw new Error('A cobertura ultrapassa a altura máxima de 100 m.');
  const base=project.entities.filter(e=>e.floorId===top.id&&['room','wall'].includes(e.kind));
  if(!base.length)throw new Error('Crie cômodos ou paredes no último andar antes de adicionar a cobertura.');
  const points=base.flatMap(e=>[-1,1].flatMap(x=>[-1,1].map(z=>worldPoint(e,x*e.w/2,z*e.d/2))));
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),front=Math.min(...points.map(p=>p.z)),back=Math.max(...points.map(p=>p.z));
  const w=right-left,d=back-front,cx=(left+right)/2,cz=(front+back)/2;
  if(w<8||d<9||w>60||d>60)throw new Error('A base automática precisa medir entre 8 × 9 m e 60 × 60 m. Use laje e pergolado para outras medidas.');
  const floor={id:uid(),name:project.floors.some(f=>f.name==='Cobertura')?`Cobertura ${project.floors.length}`:'Cobertura',elevation};
  const additions:Entity[]=[],add=(kind:Entity['kind'],x:number,z:number,extra:Partial<Entity>={})=>{const item=entity(kind,floor.id,x,z,extra);additions.push(item);return item;};
  const existing=project.entities.filter(e=>e.kind==='stairs'&&Math.abs(e.x-cx)<.5&&Math.abs(e.rotation%360)<.01&&e.z-e.d/2>=front&&e.z+e.d/2<=back).sort((a,b)=>project.floors.find(f=>f.id===b.floorId)!.elevation-project.floors.find(f=>f.id===a.floorId)!.elevation)[0];
  const stair=entity('stairs',top.id,cx,existing?.z??cz+d*.23,{w:existing?.w??1.9,d:existing?.d??Math.min(5,d*.45),h:3.2,name:'Escada para a cobertura'});
  const hole:Rect={left:stair.x-stair.w/2-.06,right:stair.x+stair.w/2+.06,front:stair.z-stair.d/2-.08,back:stair.z+stair.d/2};
  const floorRect=(rect:Rect,name:string,apartment='',finish:Entity['finish']='stone')=>{
    for(const [i,r] of subtract(rect,hole).sort((a,b)=>(b.right-b.left)*(b.back-b.front)-(a.right-a.left)*(a.back-a.front)).entries())add('room',(r.left+r.right)/2,(r.front+r.back)/2,{w:r.right-r.left,d:r.back-r.front,name:i?`${name} · circulação`:name,apartment,finish,color:finish==='wood'?'#b99570':'#c7c2b4'});
  };
  let terraceLeft=left+.1;
  if(style==='apartment'){
    const il=left+.25,ir=hole.left-.3,ff=front+.25,bb=back-.25,mid=(ff+bb)/2,bath=ir-(ir-il)*.36;
    if(ir-il<2.6)throw new Error('Não há largura suficiente para o apartamento. Escolha Terraço livre.');
    const apt='Cobertura';
    floorRect({left:il,right:ir,front:ff,back:mid},'Sala e cozinha',apt,'wood');
    floorRect({left:il,right:bath,front:mid,back:bb},'Suíte',apt,'wood');
    floorRect({left:bath,right:ir,front:mid,back:bb},'Banheiro',apt);
    const wall=(x:number,z:number,width:number,rotation=0)=>add('wall',x,z,{w:width,rotation,h:2.8,apartment:apt});
    const opening=(kind:'door'|'window',host:Entity,offset=0,width?:number)=>{const p=worldPoint(host,offset,0);add(kind,p.x,p.z,{hostId:host.id,rotation:host.rotation,apartment:apt,...(width?{w:width}:{})});};
    wall((il+ir)/2,ff,ir-il);wall((il+ir)/2,bb,ir-il);
    const west=wall(il,(ff+bb)/2,bb-ff,90);opening('window',west,0,1.8);
    const east=wall(ir,(ff+bb)/2,bb-ff,90);opening('door',east,(bb-ff)/4,1.2);opening('window',east,-(bb-ff)/4,1.5);
    const divide=wall((il+ir)/2,mid,ir-il);opening('door',divide,(il+bath)/2-(il+ir)/2,.9);opening('door',divide,(bath+ir)/2-(il+ir)/2,.8);
    wall(bath,(mid+bb)/2,bb-mid,90);
    add('slab',(il+ir)/2,(ff+bb)/2,{w:ir-il+.35,d:bb-ff+.35,y:2.85,h:.18,name:'Laje do apartamento',finish:'stone'});
    add('sofa',il+1.6,ff+1.6,{w:2.1,apartment:apt,finish:'fabric'});
    add('fridge',ir-.55,ff+.5,{w:.65,d:.65,apartment:apt});
    add('baseCabinet',ir-1.75,ff+.45,{apartment:apt});add('wallCabinet',ir-1.75,ff+.27,{apartment:apt});
    add('microwave',ir-1.75,ff+.45,{apartment:apt});
    add('bed',(il+bath)/2,(mid+bb)/2,{w:1.5,d:2,apartment:apt});
    add('toilet',(bath+ir)/2,bb-.7,{apartment:apt});add('sink',(bath+ir)/2,mid+.5,{w:.8,apartment:apt});
    terraceLeft=ir;
  }
  floorRect({left:terraceLeft,right:right-.1,front:front+.1,back:back-.1},'Terraço');
  for(const z of [front,back])add('railing',cx,z,{w,finish:'metal'});
  for(const x of [left,right])add('railing',x,cz,{w:d,rotation:90,finish:'metal'});
  const px=cx+w*.27,pz=front+d*.22;
  add('pergola',px,pz,{w:Math.min(3.5,w*.32),d:Math.min(3.5,d*.3),h:2.7,finish:'wood'});
  add('table',px,pz,{w:1.3,d:.8,finish:'wood'});add('chair',px,pz-.85,{finish:'wood'});add('chair',px,pz+.85,{rotation:180,finish:'wood'});
  add('plant',right-.7,front+.7);add('plant',right-.7,back-.7);
  // The top floor's old gabled roof is replaced; lower-floor roofs stay intact.
  const entities=project.entities.filter(e=>!(e.kind==='roof'&&e.floorId===top.id));
  const stairOnTop=entities.find(e=>e.kind==='stairs'&&e.floorId===top.id&&Math.abs(e.x-stair.x)<.05&&Math.abs(e.z-stair.z)<.05);
  return {project:{...project,floors:[...project.floors,floor],entities:[...entities,...(stairOnTop?[]:[stair]),...additions]},floorId:floor.id};
}
