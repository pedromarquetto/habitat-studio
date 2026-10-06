import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGRenderer, SVGObject } from 'three/addons/renderers/SVGRenderer.js';
import { makeModel, disposeObject } from './models';
import { catalogFor, findSpawn, movePlayer, updateEntity, type Entity, type Kind, type Project, type Tool, type View } from './domain';
import { WalkLook } from './walk-controls';
import { MoveGesture, MOVE_HOLD_MS, entityMovePosition } from './object-move';
import { RotationDial, normalizeRotation } from './object-rotate';
import { RealMaterials } from './real-materials';
import { lightSources, sameWalkGeometry } from './lighting';
import { reachableSwitch, type SwitchTarget } from './light-interaction';
export type { SwitchTarget } from './light-interaction';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface EngineState {project:Project;floorId:string;view:View;realMode:boolean;lighting:'day'|'night';isolate:boolean;cutaway:boolean;grid:boolean;selectedId:string|null;tool:Tool;placing:Kind;drawStart:{x:number;z:number}|null;snapping:boolean;focusId?:string|null;rotation:number;lookSensitivity:number;placement?:Partial<Entity>|null}
export interface Pick {point:{x:number;z:number};entityId:string|null}
export interface DragStatus {entityId:string;phase:'holding'|'moving'|'rotating';rotation?:number}
export interface EngineCallbacks {onToggleLight:(id:string)=>void;onSwitchTarget:(target:SwitchTarget|null)=>void;onPick:(pick:Pick)=>void;onHover:(point:{x:number;z:number})=>void;onLook:(active:boolean)=>void;onError:(message:string)=>void;onPosition:(position:{x:number;z:number;feet:number})=>void;onDragState:(status:DragStatus|null)=>void;onMove:(id:string,point:{x:number;z:number})=>boolean;onRotate:(id:string,rotation:number)=>boolean}

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
  private moveGesture=new MoveGesture();private holdTimer:ReturnType<typeof setTimeout>|null=null;
  private moving:{entity:Entity;anchor:{x:number;z:number};point:{x:number;z:number};hasMoved:boolean}|null=null;
  private suppressedPick:number|null=null;
  private rotationRing=document.createElement('div');private rotationHandle=document.createElement('button');
  private realMaterials=new RealMaterials();private environment:THREE.WebGLRenderTarget|null=null;
  private hemisphere=new THREE.HemisphereLight('#ffffff','#c4c5b5',2.5);
  private fallbackAmbient=new THREE.AmbientLight('#ffffff',.55);
  private lightFloorId:string|null=null;
  private switchPress:{pointerId:number;x:number;y:number;moved:boolean}|null=null;
  private sun=new THREE.DirectionalLight('#fff8e9',3.2);private roomLights=new THREE.Group();
  private rotating:{entity:Entity;pointerId:number;dial:RotationDial;rotation:number}|null=null;
  private listeners:{target:EventTarget;name:string;fn:EventListener;capture:boolean}[]=[];

  constructor(private host:HTMLElement,private callbacks:EngineCallbacks){
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.software=false;}
    catch{this.renderer=new SVGRenderer();this.software=true;}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setClearColor(new THREE.Color('#e8ede9'),1);
    if(this.renderer instanceof THREE.WebGLRenderer){this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.4;}
    else this.renderer.setQuality('high');
    this.renderer.domElement.setAttribute('aria-label','Área de edição 3D');this.renderer.domElement.tabIndex=0;
    host.appendChild(this.renderer.domElement);
    this.rotationRing.className='rotation-ring';this.rotationRing.hidden=true;
    this.rotationHandle.type='button';this.rotationHandle.className='rotation-handle';this.rotationHandle.textContent='↻';
    this.rotationHandle.title='Arraste para girar · Setas: 15° · Shift + setas: 1°';
    this.rotationHandle.setAttribute('aria-label','Alça de rotação do objeto');
    this.rotationRing.appendChild(this.rotationHandle);host.appendChild(this.rotationRing);this.scene.background=new THREE.Color('#e8ede9');this.scene.fog=new THREE.Fog('#e8ede9',60,160);
    this.scene.add(this.hemisphere,this.roomLights,this.sun.target);
    if(this.software)this.scene.add(this.fallbackAmbient);
    const sun=this.sun;sun.intensity=this.software?.8:3.2;sun.position.set(-14,25,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;sun.shadow.normalBias=.03;this.scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#e0e7e0',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;ground.visible=!this.software;this.scene.add(ground);
    this.grid=new THREE.GridHelper(80,80,'#aabeb0','#c6d2c9');this.grid.position.y=-.16;this.scene.add(this.grid);
    const axesPoints=[new THREE.Vector3(-40,-.15,0),new THREE.Vector3(40,-.15,0),new THREE.Vector3(0,-.15,-40),new THREE.Vector3(0,-.15,40)];
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axesPoints),new THREE.LineBasicMaterial({color:'#99ada3',transparent:true,opacity:.5})));
    this.scene.add(this.root,this.ghost,this.selection);this.selection.visible=false;
    this.camera.position.set(17,18,22);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.maxPolarAngle=Math.PI/2-.02;this.controls.minDistance=2;this.controls.maxDistance=110;
    this.planCamera.position.set(0,80,0);this.planCamera.up.set(0,0,-1);this.planCamera.lookAt(0,0,0);this.planControls=new OrbitControls(this.planCamera,this.renderer.domElement);this.planControls.enableRotate=false;this.planControls.mouseButtons.LEFT=THREE.MOUSE.PAN;this.planControls.touches.ONE=THREE.TOUCH.PAN;this.planControls.enableDamping=true;this.planControls.enabled=false;this.planControls.minZoom=.3;this.planControls.maxZoom=12;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    this.listen(this.renderer.domElement,'pointerdown',e=>{
      const event=e as PointerEvent;
      this.suppressedPick=null;this.pointerStart={x:event.clientX,y:event.clientY};
      if(this.moveGesture.pointerId!==null && this.moveGesture.pointerId!==event.pointerId)this.finishMove(false);
      if(this.state?.view==='walk'){
        if(this.look.begin(event)){
          this.switchPress={pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
          event.preventDefault();this.renderer.domElement.focus({preventScroll:true});
          this.renderer.domElement.setPointerCapture(event.pointerId);this.renderer.domElement.style.cursor='grabbing';this.callbacks.onLook(true);
        }
        return;
      }
      this.pointerStart={x:event.clientX,y:event.clientY};
      this.armMove(event);
    },true);
    // Capture precedes OrbitControls' document handlers. Real down/up events
    // remain intact for quick navigation; the controls disconnect after a hold.
    this.listen(document,'pointermove',e=>{
      const event=e as PointerEvent;
      if(this.rotating){
        if(event.pointerId!==this.rotating.pointerId)return;
        event.preventDefault();event.stopImmediatePropagation();
        if(event.pointerType!=='touch'&&!(event.buttons&1))this.finishRotation(false);else this.previewRotation(event);
        return;
      }
      const action=this.moveGesture.move(event);
      if(action==='navigate'||action==='cancel'){this.finishMove(false);this.suppressedPick=event.pointerId;return;}
      if(action==='hold'||action==='move'){
        event.preventDefault();event.stopImmediatePropagation();
        if(action==='move')this.previewMove(event);
      }
    },true);
    this.listen(document,'pointerup',e=>{
      const event=e as PointerEvent;
      if(this.rotating&&event.pointerId===this.rotating.pointerId){event.preventDefault();event.stopImmediatePropagation();this.previewRotation(event);this.finishRotation(true);return;}
      if(event.pointerId!==this.moveGesture.pointerId)return;
      const active=this.moveGesture.phase==='moving';
      if(active){this.previewMove(event);event.stopImmediatePropagation();}
      this.finishMove(active);
    },true);
    this.listen(this.renderer.domElement,'pointerup',e=>{
      const event=e as PointerEvent,press=this.switchPress;
      const click=press?.pointerId===event.pointerId&&!press.moved&&event.button===0&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=5;
      this.endLook(event.pointerId);
      if(this.state?.view==='walk'&&click){const target=this.switchTarget(event);if(target)this.callbacks.onToggleLight(target.id);}else this.pick(event);
    });
    this.listen(this.renderer.domElement,'pointercancel',e=>{const id=(e as PointerEvent).pointerId;this.endLook(id);if(id===this.moveGesture.pointerId)this.finishMove(false);});
    this.listen(this.renderer.domElement,'lostpointercapture',e=>{const id=(e as PointerEvent).pointerId;this.endLook(id);if(id===this.moveGesture.pointerId)this.finishMove(false);});
    this.listen(this.renderer.domElement,'wheel',e=>{if(this.moveGesture.phase==='moving'){e.preventDefault();e.stopImmediatePropagation();}else this.finishMove(false);},true);
    this.listen(this.renderer.domElement,'pointermove',e=>this.hover(e as PointerEvent));
    this.listen(document,'keydown',e=>this.key(e as KeyboardEvent,true));this.listen(document,'keyup',e=>this.key(e as KeyboardEvent,false));
    this.listen(document,'pointerdown',e=>{if(this.rotating&&(e as PointerEvent).pointerId!==this.rotating.pointerId)this.finishRotation(false);},true);
    this.listen(this.rotationHandle,'pointerdown',e=>this.startRotation(e as PointerEvent));
    for(const name of ['pointercancel','lostpointercapture'])this.listen(this.rotationHandle,name,e=>{if((e as PointerEvent).pointerId===this.rotating?.pointerId)this.finishRotation(false);});
    this.listen(this.rotationHandle,'keydown',e=>{
      const event=e as KeyboardEvent;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();const item=this.selectedRotatable();if(!item||this.rotating)return;
      const direction=['ArrowLeft','ArrowUp'].includes(event.key)?1:-1;this.callbacks.onRotate(item.id,normalizeRotation(item.rotation+direction*(event.shiftKey?1:15)));
    });
    this.listen(document,'wheel',e=>{if(this.rotating){e.preventDefault();e.stopImmediatePropagation();}},true);
    this.listen(document,'keydown',e=>{if((e as KeyboardEvent).key==='Escape'&&this.rotating){e.preventDefault();e.stopImmediatePropagation();this.finishRotation(false);}},true);
    this.listen(window,'blur',()=>{this.finishRotation(false);this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();this.finishMove(false);});
    this.listen(document,'visibilitychange',()=>{if(document.hidden){this.finishRotation(false);this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();this.finishMove(false);}});
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  private listen(target:EventTarget,name:string,fn:EventListener,capture=false){target.addEventListener(name,fn,{capture,passive:false});this.listeners.push({target,name,fn,capture});}
  private resize(){this.finishRotation(false);this.finishMove(false);const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const aspect=w/h;this.planCamera.left=-15*aspect;this.planCamera.right=15*aspect;this.planCamera.top=15;this.planCamera.bottom=-15;this.planCamera.updateProjectionMatrix();}
  private get activeCamera(){return this.state?.view==='plan'?this.planCamera:this.camera;}
  update(next:EngineState){
    this.dirty=true;
    const previous=this.state;
    const docChanged=previous?.project!==next.project;
    if(this.rotating&&(docChanged||previous?.selectedId!==next.selectedId||previous?.floorId!==next.floorId||previous?.view!==next.view||previous?.tool!==next.tool||previous?.snapping!==next.snapping||previous?.cutaway!==next.cutaway||previous?.isolate!==next.isolate))this.finishRotation(false);
    if(this.moving && (docChanged || previous?.floorId!==next.floorId || previous?.view!==next.view || previous?.tool!==next.tool || previous?.snapping!==next.snapping || previous?.cutaway!==next.cutaway || previous?.isolate!==next.isolate))this.finishMove(false);
    const renderChanged=docChanged||previous?.floorId!==next.floorId||previous?.isolate!==next.isolate||previous?.cutaway!==next.cutaway||previous?.view!==next.view||previous?.realMode!==next.realMode||previous?.lighting!==next.lighting;
    this.state=next;
    const elevation=next.project.floors.find(f=>f.id===next.floorId)?.elevation??0;this.plane.constant=-elevation;
    this.grid.visible=next.grid&&next.view!=='walk';this.grid.position.y=elevation+.012;
    if(renderChanged){this.rebuild();this.configureLighting();}
    this.restoreControls();
    this.renderer.domElement.style.cursor=this.moveGesture.phase==='moving'?'grabbing':this.moveGesture.phase==='holding'?'progress':next.view==='walk'?(this.look.pointerId!==null?'grabbing':'grab'):next.tool==='select'?'grab':next.tool==='move'?'move':'crosshair';
    if(previous?.view!==next.view){
      this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();
      if(next.view==='walk'){this.player=findSpawn(next.project,next.floorId,next.selectedId??undefined);this.yaw=Math.PI;this.pitch=0;this.callbacks.onPosition(this.player);}
      else{if(previous?.view==='walk')this.home();}
    }
    if(previous?.floorId!==next.floorId){
      if(next.view==='walk'){this.player=findSpawn(next.project,next.floorId);this.callbacks.onPosition(this.player);}
      else{this.controls.target.y=elevation;this.planControls.target.set(0,elevation,0);this.planCamera.position.set(0,elevation+80,0);this.planControls.update();}
    }
    if(next.view==='walk'&&docChanged&&previous&&!sameWalkGeometry(previous.project,next.project))this.player=findSpawn(next.project,next.floorId);
    if(next.view!=='walk'&&(!previous||docChanged&&previous.floorId!==next.floorId))this.home();
    this.highlight();
    if(previous?.tool!==next.tool||previous?.placing!==next.placing||previous?.view!==next.view){disposeObject(this.ghost);this.ghost.clear();}
    if(next.focusId&&previous?.focusId!==next.focusId)this.focus(next.focusId);
  }
  private rebuild(){
    if(!this.state)return;disposeObject(this.root);this.root.clear();this.objects.clear();
    const s=this.state;
    for(const e of s.project.entities){
      const floor=s.project.floors.find(f=>f.id===e.floorId)!;
      const activeElevation=s.project.floors.find(f=>f.id===s.floorId)!.elevation;
      const incoming=e.kind==='stairs'&&floor.elevation<activeElevation&&Math.abs(floor.elevation+e.h-activeElevation)<.05;
      if(s.view!=='walk'&&s.isolate&&floor.id!==s.floorId&&!incoming)continue;
      if(['roof','slab'].includes(e.kind)&&(s.view==='plan'||(s.cutaway&&s.view!=='walk')))continue;
      const model=makeModel(e,s.project.entities,s.view!=='walk'&&s.cutaway&&(s.isolate||e.floorId===s.floorId));
      if(s.realMode)this.realMaterials.apply(model,e);
      if(this.software){const layer=({terrain:-40,lawn:-30,paving:-20} as Partial<Record<Kind,number>>)[e.kind];if(layer!==undefined)model.traverse(o=>{o.renderOrder=layer;});}
      model.position.set(e.x,floor.elevation+(e.y??0),e.z);model.rotation.y=e.rotation*Math.PI/180;this.root.add(model);this.objects.set(e.id,model);
      if(e.kind==='room'&&s.view!=='walk')this.label(e,model);
    }
    this.root.updateMatrixWorld(true);
  }
  private configureLighting(lightFloorId=this.state?.floorId){
    const s=this.state;if(!s||!lightFloorId)return;this.lightFloorId=lightFloorId;
    const real=s.realMode,night=real&&s.lighting==='night';
    this.scene.background=new THREE.Color(real?(night?'#111d32':'#bcd9ec'):'#e8ede9');
    this.scene.fog=new THREE.Fog(real?(night?'#111d32':'#bcd9ec'):'#e8ede9',real?70:60,real?220:160);
    this.hemisphere.intensity=real?(night?.22:1.15):2.5;this.hemisphere.color.set(real?'#cce2ff':'#ffffff');
    this.fallbackAmbient.intensity=night?.04:.55;
    // SVGRenderer does not multiply ambient color by its intensity.
    this.fallbackAmbient.color.setRGB(night?.04:.35,night?.04:.35,night?.04:.35);
    this.sun.intensity=real?(night?.16:(this.software?1:3.4)):(this.software?.8:3.2);this.sun.color.set(night?'#8ba9dd':'#fff1d9');
    if(this.renderer instanceof THREE.WebGLRenderer){
      this.renderer.toneMappingExposure=real?(night?1.2:1):1.4;
      if(real&&!this.environment){const source=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(source,.04);source.dispose();pmrem.dispose();}
      this.scene.environment=real?this.environment?.texture??null:null;this.scene.environmentIntensity=night?.18:.75;
    }
    const bounds=new THREE.Box3().setFromObject(this.root),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,20);
    this.sun.target.position.copy(center);this.sun.position.copy(center).add(new THREE.Vector3(-span,span*1.6,span*.8));
    const shadow=this.sun.shadow.camera;shadow.left=shadow.bottom=-span;shadow.right=shadow.top=span;shadow.far=span*6;shadow.updateProjectionMatrix();
    disposeObject(this.roomLights);this.roomLights.clear();
    const elevation=s.project.floors.find(f=>f.id===lightFloorId)!.elevation;
    const sources=lightSources(s.project,lightFloorId);
    for(const source of sources){
      if(real&&source.on&&source.intensity>0&&this.roomLights.children.filter(o=>o instanceof THREE.PointLight).length<16){
        const power=this.software?(night?.85:.25):(night?32:12);
        const light=new THREE.PointLight(source.color,power*source.intensity,this.software?8:14,2);light.position.set(source.x,elevation+source.y,source.z);this.roomLights.add(light);
      }
      if(source.virtual&&(s.view==='walk'||!s.cutaway&&s.view!=='plan')){
        const mat=new THREE.MeshStandardMaterial({color:source.on?'#fff4d5':'#697570',emissive:source.on&&source.intensity>0?source.color:'#000000',emissiveIntensity:source.on?(real?2:.65)*source.intensity:0});
        const fixture=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.06,16),mat);fixture.position.set(source.x,elevation+source.y,source.z);this.roomLights.add(fixture);
      }
    }
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
  private switchTarget(event?:PointerEvent):SwitchTarget|null{
    const s=this.state;if(!s||s.view!=='walk')return null;
    const mouse=new THREE.Vector2();
    if(event){const rect=this.renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);}
    return reachableSwitch(s.project,this.root.children,this.camera,mouse);
  }
  private pick(event:PointerEvent){
    if(event.pointerId===this.suppressedPick){this.suppressedPick=null;return;}
    if(this.state?.view==='walk')return;
    if(event.button!==0||Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>5)return;
    const pick=this.hit(event);if(pick&&Math.abs(pick.point.x)<150&&Math.abs(pick.point.z)<150){this.callbacks.onPick(pick);this.renderer.domElement.focus();}
  }
  private restoreControls(){
    const enabled=this.moveGesture.phase!=='moving'&&!this.rotating;
    this.controls.enabled=enabled&&this.state?.view==='3d'&&this.state.tool==='select';
    this.planControls.enabled=enabled&&this.state?.view==='plan'&&this.state.tool==='select';
  }
  private selectedRotatable(){
    const s=this.state;if(!s||s.view==='walk'||!['select','move'].includes(s.tool))return null;
    const item=s.project.entities.find(e=>e.id===s.selectedId);
    return item&&!item.hostId&&item.floorId===s.floorId&&this.objects.has(item.id)?item:null;
  }
  private positionRotationRing(){
    const item=this.selectedRotatable();
    if(!item||this.moveGesture.pointerId!==null){this.rotationRing.hidden=true;return;}
    const elevation=this.state!.project.floors.find(f=>f.id===item.floorId)!.elevation;
    const point=new THREE.Vector3(item.x,elevation+(item.y??0)+Math.min(item.h/2,1),item.z).project(this.activeCamera);
    const x=(point.x+1)*this.host.clientWidth/2,y=(1-point.y)*this.host.clientHeight/2;
    this.rotationRing.hidden=point.z<-1||point.z>1||x<0||y<0||x>this.host.clientWidth||y>this.host.clientHeight;
    this.rotationRing.style.left=`${x}px`;this.rotationRing.style.top=`${y}px`;
    const rotation=this.rotating?.rotation??item.rotation,angle=-rotation*Math.PI/180-Math.PI/2;
    this.rotationHandle.style.left=`${64+Math.cos(angle)*64}px`;this.rotationHandle.style.top=`${64+Math.sin(angle)*64}px`;
    this.rotationRing.dataset.angle=`${normalizeRotation(rotation).toLocaleString('pt-BR',{maximumFractionDigits:1})}°`;
    this.rotationHandle.setAttribute('aria-label',`Girar ${item.name}, ${this.rotationRing.dataset.angle}`);
  }
  private startRotation(event:PointerEvent){
    const item=this.selectedRotatable();if(!item||this.rotating||!event.isPrimary||event.button!==0||event.ctrlKey||event.metaKey||event.altKey)return;
    event.preventDefault();event.stopPropagation();this.finishMove(false);
    for(const controls of [this.controls,this.planControls]){
      const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;controls.disconnect();
    }
    this.positionRotationRing();
    const rect=this.rotationRing.getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    this.rotating={entity:item,pointerId:event.pointerId,dial:new RotationDial(center,{x:event.clientX,y:event.clientY},item.rotation),rotation:item.rotation};
    this.restoreControls();this.rotationHandle.focus({preventScroll:true});this.rotationHandle.setPointerCapture(event.pointerId);
    this.rotationRing.dataset.active='true';this.callbacks.onDragState({entityId:item.id,phase:'rotating',rotation:item.rotation});
  }
  private previewRotation(event:PointerEvent){
    const drag=this.rotating,s=this.state;if(!drag||!s)return;
    const rotation=drag.dial.move({x:event.clientX,y:event.clientY},s.snapping&&!event.shiftKey);
    if(rotation===null||rotation===drag.rotation)return;
    drag.rotation=rotation;
    // updateEntity rotates hosted openings around a wall's center as well.
    const preview=updateEntity(s.project,drag.entity.id,{rotation});
    for(const item of preview.entities){
      if(item.id!==drag.entity.id&&item.hostId!==drag.entity.id&&item.switchWallId!==drag.entity.id)continue;
      const object=this.objects.get(item.id);if(!object)continue;
      object.position.set(item.x,s.project.floors.find(f=>f.id===item.floorId)!.elevation+(item.y??0),item.z);object.rotation.y=item.rotation*Math.PI/180;
    }
    this.root.updateMatrixWorld(true);this.highlight();this.dirty=true;
    this.callbacks.onDragState({entityId:drag.entity.id,phase:'rotating',rotation});
  }
  private finishRotation(commit:boolean){
    const drag=this.rotating;if(!drag)return;
    this.rotating=null;delete this.rotationRing.dataset.active;
    if(this.rotationHandle.hasPointerCapture(drag.pointerId))this.rotationHandle.releasePointerCapture(drag.pointerId);
    if(!this.stopped){this.controls.connect(this.renderer.domElement);this.planControls.connect(this.renderer.domElement);}
    this.restoreControls();this.callbacks.onDragState(null);
    const changed=normalizeRotation(drag.rotation)!==normalizeRotation(drag.entity.rotation);
    if(!(commit&&changed&&this.callbacks.onRotate(drag.entity.id,drag.rotation))){this.rebuild();this.highlight();}
    this.dirty=true;this.positionRotationRing();
  }
  private armMove(event:PointerEvent){
    const s=this.state;if(!s || this.rotating || s.view==='walk' || !['select','move'].includes(s.tool))return;
    const pick=this.hit(event),item=s.project.entities.find(e=>e.id===pick?.entityId);
    if(!pick || !item || item.floorId!==s.floorId || !this.moveGesture.begin(event))return;
    this.moving={entity:item,anchor:pick.point,point:{x:item.x,z:item.z},hasMoved:false};
    this.renderer.domElement.dataset.objectDrag='holding';this.renderer.domElement.style.cursor='progress';
    this.callbacks.onDragState({entityId:item.id,phase:'holding'});
    const activate=()=>{
      this.holdTimer=null;
      if(!this.moving || !this.moveGesture.activate(event.pointerId))return;
      // Drain old orbit damping before fixing the drag's ground-plane anchor.
      for(const controls of [this.controls,this.planControls]){
        const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;controls.disconnect();
      }
      this.moving.anchor=this.hit(event)?.point??this.moving.anchor;
      this.restoreControls();this.renderer.domElement.setPointerCapture(event.pointerId);
      this.renderer.domElement.dataset.objectDrag='moving';this.renderer.domElement.style.cursor='grabbing';
      this.callbacks.onPick({entityId:item.id,point:pick.point});
      this.callbacks.onDragState({entityId:item.id,phase:'moving'});this.dirty=true;
    };
    if(s.tool==='move')activate();else this.holdTimer=setTimeout(activate,MOVE_HOLD_MS);
  }
  private previewMove(event:PointerEvent){
    const s=this.state,drag=this.moving;if(!s || !drag)return;
    if(!drag.hasMoved && Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)<3)return;
    const pick=this.hit(event);if(!pick)return;
    drag.hasMoved=true;
    const point=entityMovePosition(s.project,drag.entity.id,{x:drag.entity.x+pick.point.x-drag.anchor.x,z:drag.entity.z+pick.point.z-drag.anchor.z},s.snapping);
    if(!point || point.x===drag.point.x&&point.z===drag.point.z)return;
    drag.point=point;
    const dx=point.x-drag.entity.x,dz=point.z-drag.entity.z;
    for(const item of s.project.entities){
      if(item.id!==drag.entity.id && item.hostId!==drag.entity.id&&item.switchWallId!==drag.entity.id)continue;
      const object=this.objects.get(item.id);if(object)object.position.set(item.x+dx,s.project.floors.find(f=>f.id===item.floorId)!.elevation+(item.y??0),item.z+dz);
    }
    // A sliding door/window changes just its host wall's hole, not the whole scene.
    if(drag.entity.hostId){
      const host=s.project.entities.find(e=>e.id===drag.entity.hostId)!;
      const old=this.objects.get(host.id);if(old){this.root.remove(old);disposeObject(old);}
      const model=makeModel(host,updateEntity(s.project,drag.entity.id,point).entities,s.cutaway);
      model.position.set(host.x,s.project.floors.find(f=>f.id===host.floorId)!.elevation+(host.y??0),host.z);model.rotation.y=host.rotation*Math.PI/180;
      this.root.add(model);this.objects.set(host.id,model);
    }
    this.root.updateMatrixWorld(true);this.highlight();this.dirty=true;this.callbacks.onHover(point);
  }
  private finishMove(commit:boolean){
    const drag=this.moving,active=this.moveGesture.phase==='moving',pointerId=this.moveGesture.pointerId;
    if(!drag)return;
    if(this.holdTimer!==null){clearTimeout(this.holdTimer);this.holdTimer=null;}
    this.moveGesture.end();this.moving=null;
    if(active && !this.stopped){this.controls.connect(this.renderer.domElement);this.planControls.connect(this.renderer.domElement);}
    this.restoreControls();delete this.renderer.domElement.dataset.objectDrag;
    this.renderer.domElement.style.cursor=this.state?.tool==='select'?'grab':this.state?.tool==='move'?'move':'crosshair';
    if(active && !commit)this.suppressedPick=pointerId;
    if(active && pointerId!==null && this.renderer.domElement.hasPointerCapture(pointerId))this.renderer.domElement.releasePointerCapture(pointerId);
    this.callbacks.onDragState(null);
    if(active){
      const changed=drag.point.x!==drag.entity.x || drag.point.z!==drag.entity.z;
      const committed=commit&&changed&&this.callbacks.onMove(drag.entity.id,drag.point);
      if(!committed){this.rebuild();this.highlight();}
      this.dirty=true;
    }
  }
  private hover(event:PointerEvent){
    if(!this.state)return;
    if(this.state.view==='walk'){
      if(this.switchPress?.pointerId===event.pointerId&&Math.hypot(event.clientX-this.switchPress.x,event.clientY-this.switchPress.y)>5)this.switchPress.moved=true;
      if(this.look.pointerId===event.pointerId&&event.pointerType!=='touch'&&!(event.buttons&1)){this.endLook(event.pointerId);return;}
      const delta=this.look.move(event,this.state.lookSensitivity);
      if(delta){this.yaw-=delta.yaw;this.pitch=Math.max(-1.3,Math.min(1.3,this.pitch-delta.pitch));this.dirty=true;}
      return;
    }
    const pick=this.hit(event);if(!pick)return;this.callbacks.onHover(pick.point);
    if(this.state.tool==='select'||this.state.tool==='move')return;
    this.preview(pick.point);
  }
  private preview(point:{x:number;z:number}){
    this.dirty=true;
    if(!this.state)return;disposeObject(this.ghost);this.ghost.clear();
    const s=this.state,quantize=(n:number)=>s.snapping?Math.round(n*4)/4:n;
    const x=quantize(point.x),z=quantize(point.z),floor=s.project.floors.find(f=>f.id===s.floorId)!;
    if(s.tool==='place'&&!['door','window'].includes(s.placing)){
      const item={...catalogFor(s.placing),...s.placement};const mesh=new THREE.Mesh(new THREE.BoxGeometry(item.w,item.h,item.d),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.35,transparent:true}));mesh.position.set(x,floor.elevation+(item.y??0)+item.h/2,z);mesh.rotation.y=s.rotation*Math.PI/180;this.ghost.add(mesh);
    }else if(s.drawStart){
      const a=s.drawStart;
      if(s.tool==='wall'||s.tool==='line'){
        const length=Math.hypot(x-a.x,z-a.z),item=catalogFor(s.placing),h=Math.min(item.h,1.3);const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,length),h,item.d),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.4,transparent:true}));mesh.position.set((x+a.x)/2,floor.elevation+h/2,(z+a.z)/2);mesh.rotation.y=-Math.atan2(z-a.z,x-a.x);this.ghost.add(mesh);
      }else{
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,Math.abs(x-a.x)),.035,Math.max(.05,Math.abs(z-a.z))),new THREE.MeshBasicMaterial({color:'#4b9166',opacity:.35,transparent:true}));mesh.position.set((x+a.x)/2,floor.elevation+.035,(z+a.z)/2);this.ghost.add(mesh);
      }
    }
  }
  private key(event:KeyboardEvent,down:boolean){
    if(!down){this.keys.delete(event.code);return;}
    const target=event.target as HTMLElement;
    if(target.closest('input,textarea,select,[role="dialog"],[role="combobox"],[contenteditable="true"]'))return;
    if(event.code==='Escape'&&down&&this.moveGesture.pointerId!==null){event.preventDefault();this.finishMove(false);return;}
    if(this.state?.view!=='walk')return;
    if(event.code==='KeyE'&&down&&!event.repeat){const target=this.switchTarget();if(target){event.preventDefault();this.callbacks.onToggleLight(target.id);}return;}
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
      if(this.state.realMode){const floor=this.state.project.floors.filter(f=>f.elevation<=this.player.feet+.1).sort((a,b)=>b.elevation-a.elevation)[0];if(floor&&floor.id!==this.lightFloorId)this.configureLighting(floor.id);}
      this.camera.position.set(this.player.x,this.player.feet+1.65,this.player.z);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
      if(time-this.lastPositionUpdate>200){this.callbacks.onSwitchTarget(this.switchTarget());this.callbacks.onPosition({...this.player});this.lastPositionUpdate=time;}
    }else if(this.moveGesture.phase!=='moving'&&!this.rotating){const orbitChanged=this.controls.update(),planChanged=this.planControls.update();if(orbitChanged||planChanged)this.dirty=true;}
    if(!this.software||(this.dirty&&time-this.lastRender>66)){this.positionRotationRing();this.renderer.render(this.scene,this.activeCamera);this.lastRender=time;this.dirty=false;}
    this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  private endLook(pointerId?:number){
    const active=this.look.pointerId;
    if(!this.look.end(pointerId))return;
    this.switchPress=null;
    if(active!==null&&this.renderer.domElement.hasPointerCapture(active))this.renderer.domElement.releasePointerCapture(active);
    this.renderer.domElement.style.cursor=this.state?.view==='walk'?'grab':this.state?.tool==='select'?'grab':this.state?.tool==='move'?'move':'crosshair';this.callbacks.onLook(false);
  }
  pauseInput(){this.keys.clear();this.touchMove={forward:0,right:0};this.endLook();}
  setTouchMove(forward:number,right:number){this.touchMove={forward,right};}
  step(forward:number,right:number){
    if(this.state?.view!=='walk')return;
    this.player=movePlayer(this.state.project,this.player,(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*.35,(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*.35);
    this.dirty=true;this.callbacks.onPosition({...this.player});
  }
  home(){
    this.finishRotation(false);this.finishMove(false);
    this.dirty=true;
    const elevation=this.state?.project.floors.find(f=>f.id===this.state?.floorId)?.elevation??0;
    const bounds=new THREE.Box3().setFromObject(this.root),size=bounds.getSize(new THREE.Vector3()),center=bounds.isEmpty()?new THREE.Vector3(0,elevation,0):bounds.getCenter(new THREE.Vector3());
    const span=Math.max(size.x,size.z,8),distance=span*1.65;this.camera.position.copy(center).add(new THREE.Vector3(17,18,22).normalize().multiplyScalar(distance));this.camera.rotation.set(0,0,0);this.controls.target.copy(center);this.controls.update();
    this.planCamera.position.set(0,elevation+80,0);this.planCamera.zoom=1;this.planControls.target.set(0,elevation,0);this.planCamera.updateProjectionMatrix();this.planControls.update();
  }
  zoom(direction:number){this.finishRotation(false);this.finishMove(false);this.dirty=true;if(this.state?.view==='plan'){this.planCamera.zoom=Math.max(.3,Math.min(12,this.planCamera.zoom*(direction>0?1.25:.8)));this.planCamera.updateProjectionMatrix();}else if(this.state?.view!=='walk'){const vec=this.camera.position.clone().sub(this.controls.target);vec.multiplyScalar(direction>0?.8:1.25);this.camera.position.copy(this.controls.target).add(vec);this.controls.update();}}
  focus(id:string){this.finishRotation(false);this.finishMove(false);this.dirty=true;const obj=this.objects.get(id);if(!obj||this.state?.view==='walk')return;const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3());this.controls.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(8,9,10));this.controls.update();this.planControls.target.set(center.x,center.y,center.z);this.planCamera.position.set(center.x,center.y+80,center.z);this.planCamera.zoom=2;this.planControls.update();this.planCamera.updateProjectionMatrix();}
  dispose(){this.stopped=true;this.finishRotation(false);this.finishMove(false);this.endLook();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();for(const {target,name,fn,capture} of this.listeners)target.removeEventListener(name,fn,capture);this.controls.dispose();this.planControls.dispose();disposeObject(this.scene);this.realMaterials.dispose();this.environment?.dispose();if(this.renderer instanceof THREE.WebGLRenderer)this.renderer.dispose();this.renderer.domElement.remove();this.rotationRing.remove();}
}
