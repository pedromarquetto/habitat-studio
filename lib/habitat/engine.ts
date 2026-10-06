import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGRenderer, SVGObject } from 'three/addons/renderers/SVGRenderer.js';
import { makeModel, disposeObject } from './models';
import { catalogFor, findSpawn, movePlayer, type Entity, type Kind, type Project, type Tool, type View } from './domain';
import { WalkLook } from './walk-controls';

export interface EngineState {project:Project;floorId:string;view:View;isolate:boolean;cutaway:boolean;grid:boolean;selectedId:string|null;tool:Tool;placing:Kind;drawStart:{x:number;z:number}|null;snapping:boolean;focusId?:string|null;rotation:number;lookSensitivity:number}
export interface Pick {point:{x:number;z:number};entityId:string|null}
export interface EngineCallbacks {onPick:(pick:Pick)=>void;onHover:(point:{x:number;z:number})=>void;onLook:(active:boolean)=>void;onError:(message:string)=>void;onPosition:(position:{x:number;z:number;feet:number})=>void}

export class HabitatEngine {
  readonly renderer:THREE.WebGLRenderer|SVGRenderer;
  readonly software:boolean;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(45,1,.05,500);
  readonly planCamera=new THREE.OrthographicCamera(-15,15,15,-15,.1,300);
  readonly controls:OrbitControls;
  readonly planControls:OrbitControls;
  private root=new THREE.Group();private ghost=new THREE.Group();private grid:THREE.GridHelper;
  private selection=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#3b8f64'));
  private raycaster=new THREE.Raycaster();private mouse=new THREE.Vector2();private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private resizeObserver:ResizeObserver;private frame=0;private lastTime=0;private lastPositionUpdate=0;private lastRender=0;
  private keys=new Set<string>();private touchMove={forward:0,right:0};private pointerStart={x:0,y:0};private look=new WalkLook();
  private state:EngineState|null=null;private objects=new Map<string,THREE.Group>();
  private player={x:0,z:-9,feet:0};private yaw=0;private pitch=0;private stopped=false;private dirty=true;
  private listeners:{target:EventTarget;name:string;fn:EventListener}[]=[];

  constructor(private host:HTMLElement,private callbacks:EngineCallbacks){
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.software=false;}
    catch{this.renderer=new SVGRenderer();this.software=true;}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setClearColor(new THREE.Color('#e8ede9'),1);
    if(this.renderer instanceof THREE.WebGLRenderer){this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.4;}
    else this.renderer.setQuality('high');
    this.renderer.domElement.setAttribute('aria-label','Área de edição 3D');this.renderer.domElement.tabIndex=0;
    host.appendChild(this.renderer.domElement);this.scene.background=new THREE.Color('#e8ede9');this.scene.fog=new THREE.Fog('#e8ede9',60,160);
    this.scene.add(new THREE.HemisphereLight('#ffffff','#c4c5b5',2.5));
    if(this.software)this.scene.add(new THREE.AmbientLight('#ffffff',.55));
    const sun=new THREE.DirectionalLight('#fff8e9',this.software?.8:3.2);sun.position.set(-14,25,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;sun.shadow.normalBias=.03;this.scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#e0e7e0',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;ground.visible=!this.software;this.scene.add(ground);
    this.grid=new THREE.GridHelper(80,80,'#aabeb0','#c6d2c9');this.grid.position.y=-.16;this.scene.add(this.grid);
    const axesPoints=[new THREE.Vector3(-40,-.15,0),new THREE.Vector3(40,-.15,0),new THREE.Vector3(0,-.15,-40),new THREE.Vector3(0,-.15,40)];
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axesPoints),new THREE.LineBasicMaterial({color:'#99ada3',transparent:true,opacity:.5})));
    this.scene.add(this.root,this.ghost,this.selection);this.selection.visible=false;
    this.camera.position.set(17,18,22);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.maxPolarAngle=Math.PI/2-.02;this.controls.minDistance=2;this.controls.maxDistance=110;
    this.planCamera.position.set(0,80,0);this.planCamera.up.set(0,0,-1);this.planCamera.lookAt(0,0,0);this.planControls=new OrbitControls(this.planCamera,this.renderer.domElement);this.planControls.enableRotate=false;this.planControls.enableDamping=true;this.planControls.enabled=false;this.planControls.minZoom=.3;this.planControls.maxZoom=12;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    this.listen(this.renderer.domElement,'pointerdown',e=>{
      const event=e as PointerEvent;
      if(this.state?.view==='walk'){
        if(this.look.begin(event)){
          event.preventDefault();this.renderer.domElement.focus({preventScroll:true});
          this.renderer.domElement.setPointerCapture(event.pointerId);this.renderer.domElement.style.cursor='grabbing';this.callbacks.onLook(true);
        }
        return;
      }
      this.pointerStart={x:event.clientX,y:event.clientY};
    });
    this.listen(this.renderer.domElement,'pointerup',e=>{const event=e as PointerEvent;this.endLook(event.pointerId);this.pick(event);});
    this.listen(this.renderer.domElement,'pointercancel',e=>this.endLook((e as PointerEvent).pointerId));
    this.listen(this.renderer.domElement,'lostpointercapture',e=>this.endLook((e as PointerEvent).pointerId));
    this.listen(this.renderer.domElement,'pointermove',e=>this.hover(e as PointerEvent));
    this.listen(document,'keydown',e=>this.key(e as KeyboardEvent,true));this.listen(document,'keyup',e=>this.key(e as KeyboardEvent,false));
    this.listen(window,'blur',()=>{this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();});
    this.listen(document,'visibilitychange',()=>{if(document.hidden){this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();}});
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  private listen(target:EventTarget,name:string,fn:EventListener){target.addEventListener(name,fn);this.listeners.push({target,name,fn});}
  private resize(){const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const aspect=w/h;this.planCamera.left=-15*aspect;this.planCamera.right=15*aspect;this.planCamera.top=15;this.planCamera.bottom=-15;this.planCamera.updateProjectionMatrix();}
  private get activeCamera(){return this.state?.view==='plan'?this.planCamera:this.camera;}
  update(next:EngineState){
    this.dirty=true;
    const previous=this.state;
    const docChanged=previous?.project!==next.project;
    const renderChanged=docChanged||previous?.floorId!==next.floorId||previous?.isolate!==next.isolate||previous?.cutaway!==next.cutaway||previous?.view!==next.view;
    this.state=next;
    const elevation=next.project.floors.find(f=>f.id===next.floorId)?.elevation??0;this.plane.constant=-elevation;
    this.grid.visible=next.grid&&next.view!=='walk';this.grid.position.y=elevation+.012;
    if(renderChanged)this.rebuild();
    this.controls.enabled=next.view==='3d'&&next.tool==='select';this.planControls.enabled=next.view==='plan'&&next.tool==='select';
    this.renderer.domElement.style.cursor=next.view==='walk'?(this.look.pointerId!==null?'grabbing':'grab'):next.tool==='select'?'grab':'crosshair';
    if(previous?.view!==next.view){
      this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();
      if(next.view==='walk'){this.player=findSpawn(next.project,next.floorId,next.selectedId??undefined);this.yaw=Math.PI;this.pitch=0;this.callbacks.onPosition(this.player);}
      else{if(previous?.view==='walk')this.home();}
    }
    if(previous?.floorId!==next.floorId){
      if(next.view==='walk'){this.player=findSpawn(next.project,next.floorId);this.callbacks.onPosition(this.player);}
      else{this.controls.target.y=elevation;this.planControls.target.set(0,elevation,0);this.planCamera.position.set(0,elevation+80,0);this.planControls.update();}
    }
    if(next.view==='walk'&&docChanged&&previous)this.player=findSpawn(next.project,next.floorId);
    this.highlight();
    if(previous?.tool!==next.tool||previous?.placing!==next.placing||previous?.view!==next.view){disposeObject(this.ghost);this.ghost.clear();}
    if(next.focusId&&previous?.focusId!==next.focusId)this.focus(next.focusId);
  }
  private rebuild(){
    if(!this.state)return;disposeObject(this.root);this.root.clear();this.objects.clear();
    const s=this.state;
    for(const e of s.project.entities){
      const floor=s.project.floors.find(f=>f.id===e.floorId)!;
      if(s.view!=='walk'&&s.isolate&&floor.id!==s.floorId)continue;
      if(e.kind==='roof'&&(s.view==='plan'||(s.cutaway&&s.view!=='walk')))continue;
      const model=makeModel(e,s.project.entities,s.view!=='walk'&&s.cutaway&&(s.isolate||e.floorId===s.floorId));
      model.position.set(e.x,floor.elevation,e.z);model.rotation.y=e.rotation*Math.PI/180;this.root.add(model);this.objects.set(e.id,model);
      if(e.kind==='room'&&s.view!=='walk')this.label(e,model);
    }
    this.root.updateMatrixWorld(true);
  }
  private label(e:Entity,model:THREE.Group){
    if(e.w<2||e.d<2)return;
    if(this.software){
      const node=document.createElementNS('http://www.w3.org/2000/svg','g');
      for(const [text,y,size] of [[e.name,-5,'12'],[`${(e.w*e.d).toFixed(1).replace('.',',')} m²`,12,'10']] as const){
        const line=document.createElementNS('http://www.w3.org/2000/svg','text');line.setAttribute('text-anchor','middle');line.setAttribute('y',String(y));line.setAttribute('font-size',size);line.setAttribute('font-family','Arial, sans-serif');line.setAttribute('fill','#385448');line.textContent=text;node.appendChild(line);
      }
      const label=new SVGObject(node);label.position.y=.025;model.add(label);return;
    }
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.font='500 28px Arial';ctx.fillStyle='#385048';ctx.textAlign='center';ctx.fillText(e.name,256,50,490);ctx.font='23px Arial';ctx.fillStyle='#586c60';ctx.fillText(`${(e.w*e.d).toFixed(1).replace('.',',')} m²`,256,85);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(e.w*.8,3.8),.9),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.012,0);mesh.userData.entityId=e.id;model.add(mesh);
  }
  private highlight(){
    const selected=this.state?.selectedId?this.objects.get(this.state.selectedId):null;this.selection.visible=Boolean(selected)&&this.state?.view!=='walk';
    if(selected){this.selection.box.setFromObject(selected).expandByScalar(.025);this.selection.updateMatrixWorld(true);}
  }
  private hit(event:PointerEvent):Pick|null{
    const rect=this.renderer.domElement.getBoundingClientRect();this.mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.mouse,this.activeCamera);
    const point=new THREE.Vector3();if(!this.raycaster.ray.intersectPlane(this.plane,point))return null;
    const hits=this.raycaster.intersectObjects(this.root.children,true);
    const object=hits.find(hit=>Boolean(hit.object.userData.entityId));
    return {point:{x:point.x,z:point.z},entityId:object?.object.userData.entityId??null};
  }
  private pick(event:PointerEvent){
    if(this.state?.view==='walk')return;
    if(event.button!==0||Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>5)return;
    const pick=this.hit(event);if(pick&&Math.abs(pick.point.x)<150&&Math.abs(pick.point.z)<150){this.callbacks.onPick(pick);this.renderer.domElement.focus();}
  }
  private hover(event:PointerEvent){
    if(!this.state)return;
    if(this.state.view==='walk'){
      if(this.look.pointerId===event.pointerId&&event.pointerType!=='touch'&&!(event.buttons&1)){this.endLook(event.pointerId);return;}
      const delta=this.look.move(event,this.state.lookSensitivity);
      if(delta){this.yaw-=delta.yaw;this.pitch=Math.max(-1.3,Math.min(1.3,this.pitch-delta.pitch));this.dirty=true;}
      return;
    }
    const pick=this.hit(event);if(!pick)return;this.callbacks.onHover(pick.point);
    if(this.state.tool==='select')return;
    this.preview(pick.point);
  }
  private preview(point:{x:number;z:number}){
    this.dirty=true;
    if(!this.state)return;disposeObject(this.ghost);this.ghost.clear();
    const s=this.state,quantize=(n:number)=>s.snapping?Math.round(n*4)/4:n;
    const x=quantize(point.x),z=quantize(point.z),floor=s.project.floors.find(f=>f.id===s.floorId)!;
    if(s.tool==='place'&&!['door','window'].includes(s.placing)){
      const item=catalogFor(s.placing);const mesh=new THREE.Mesh(new THREE.BoxGeometry(item.w,item.h,item.d),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.35,transparent:true}));mesh.position.set(x,floor.elevation+item.h/2,z);mesh.rotation.y=s.rotation*Math.PI/180;this.ghost.add(mesh);
    }else if(s.drawStart){
      const a=s.drawStart;
      if(s.tool==='wall'){
        const length=Math.hypot(x-a.x,z-a.z);const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,length),1.1,.18),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.4,transparent:true}));mesh.position.set((x+a.x)/2,floor.elevation+.55,(z+a.z)/2);mesh.rotation.y=-Math.atan2(z-a.z,x-a.x);this.ghost.add(mesh);
      }else{
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,Math.abs(x-a.x)),.035,Math.max(.05,Math.abs(z-a.z))),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.35,transparent:true}));mesh.position.set((x+a.x)/2,floor.elevation+.035,(z+a.z)/2);this.ghost.add(mesh);
      }
    }
  }
  private key(event:KeyboardEvent,down:boolean){
    const target=event.target as HTMLElement;
    if(target.closest('input,textarea,select,[role="dialog"],[role="combobox"],[contenteditable="true"]'))return;
    if(this.state?.view!=='walk')return;
    if(event.code==='Escape'&&down){this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();return;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();if(down)this.keys.add(event.code);else this.keys.delete(event.code);}
  }
  private animate(time:number){
    if(this.stopped)return;const dt=Math.min((time-this.lastTime)/1000,.05);this.lastTime=time;
    if(this.state?.view==='walk'){
      this.dirty=true;
      if(this.keys.has('ArrowLeft'))this.yaw+=dt*1.5;if(this.keys.has('ArrowRight'))this.yaw-=dt*1.5;
      if(this.keys.has('ArrowUp'))this.pitch=Math.min(1.3,this.pitch+dt);if(this.keys.has('ArrowDown'))this.pitch=Math.max(-1.3,this.pitch-dt);
      let forward=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS'))+this.touchMove.forward;
      let right=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'))+this.touchMove.right;
      const norm=Math.max(1,Math.hypot(forward,right));forward/=norm;right/=norm;
      const speed=(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?4.5:2.5)*dt;
      this.player=movePlayer(this.state.project,this.player,(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*speed,(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*speed);
      this.camera.position.set(this.player.x,this.player.feet+1.65,this.player.z);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
      if(time-this.lastPositionUpdate>200){this.callbacks.onPosition({...this.player});this.lastPositionUpdate=time;}
    }else{const orbitChanged=this.controls.update(),planChanged=this.planControls.update();if(orbitChanged||planChanged)this.dirty=true;}
    if(!this.software||(this.dirty&&time-this.lastRender>66)){this.renderer.render(this.scene,this.activeCamera);this.lastRender=time;this.dirty=false;}
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  private endLook(pointerId?:number){
    const active=this.look.pointerId;
    if(!this.look.end(pointerId))return;
    if(active!==null&&this.renderer.domElement.hasPointerCapture(active))this.renderer.domElement.releasePointerCapture(active);
    this.renderer.domElement.style.cursor=this.state?.view==='walk'?'grab':this.state?.tool==='select'?'grab':'crosshair';this.callbacks.onLook(false);
  }
  setTouchMove(forward:number,right:number){this.touchMove={forward,right};}
  step(forward:number,right:number){
    if(this.state?.view!=='walk')return;
    this.player=movePlayer(this.state.project,this.player,(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*.35,(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*.35);
    this.dirty=true;this.callbacks.onPosition({...this.player});
  }
  home(){
    this.dirty=true;
    const elevation=this.state?.project.floors.find(f=>f.id===this.state?.floorId)?.elevation??0;
    this.camera.position.set(17,elevation+18,22);this.camera.rotation.set(0,0,0);this.controls.target.set(0,elevation,0);this.controls.update();
    this.planCamera.position.set(0,elevation+80,0);this.planCamera.zoom=1;this.planControls.target.set(0,elevation,0);this.planCamera.updateProjectionMatrix();this.planControls.update();
  }
  zoom(direction:number){this.dirty=true;if(this.state?.view==='plan'){this.planCamera.zoom=Math.max(.3,Math.min(12,this.planCamera.zoom*(direction>0?1.25:.8)));this.planCamera.updateProjectionMatrix();}else if(this.state?.view!=='walk'){const vec=this.camera.position.clone().sub(this.controls.target);vec.multiplyScalar(direction>0?.8:1.25);this.camera.position.copy(this.controls.target).add(vec);this.controls.update();}}
  focus(id:string){this.dirty=true;const obj=this.objects.get(id);if(!obj||this.state?.view==='walk')return;const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3());this.controls.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(8,9,10));this.controls.update();this.planControls.target.set(center.x,center.y,center.z);this.planCamera.position.set(center.x,center.y+80,center.z);this.planCamera.zoom=2;this.planControls.update();this.planCamera.updateProjectionMatrix();}
  dispose(){this.stopped=true;this.endLook();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();for(const {target,name,fn} of this.listeners)target.removeEventListener(name,fn);this.controls.dispose();this.planControls.dispose();disposeObject(this.scene);if(this.renderer instanceof THREE.WebGLRenderer)this.renderer.dispose();this.renderer.domElement.remove();}
}
