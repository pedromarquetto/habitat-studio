'use client';
import { switchMountPosition, type MovePoint } from '@/lib/habitat/switch-mount';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Armchair, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Building2, Check, CookingPot, Copy, DoorOpen, Download, Footprints, Grid2X2, House, Layers3, Leaf, Lightbulb, Maximize, Minus, MousePointer2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Refrigerator, RotateCw, Ruler, Save, Sofa, Square, SquareMousePointer, Trash2, Undo2, Upload, X, BedDouble, Bath, Columns3, LayoutGrid, SlidersHorizontal, CircleHelp, Scan, Pencil, Table2, AppWindow, Fence, Trees, Waves, Map as MapIcon, Link2, ExternalLink, Move, Sparkles, Flower2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import Viewport from './Viewport';
import RealControls from './RealControls';
import LocationDialog from './LocationDialog';
import LocationStatus from './LocationStatus';
import { EMPTY_CONTEXT, type ContextStatus } from '@/lib/habitat/geography';
import AttachmentControls from './AttachmentControls';
import { suggestedPlacement, suggestedAttachment, wallMountPosition, supportPosition } from '@/lib/habitat/placement';
import type { RealQuality } from '@/lib/habitat/real-pipeline';
import type { MaterialStatus } from '@/lib/habitat/real-materials';
import LightingPanel, { LightControls } from './LightingPanel';
import { attachLightSwitch, circuitRoom, installRoomLighting, isLitRoom, lightSettings, toggleLight } from '@/lib/habitat/lighting';
import ProductImporter from './ProductImporter';
import { AREA_KINDS, CATALOG, ProjectSchema, inside, localPoint, worldPoint, attachOpening, catalogFor, fitRoof, ceilingHeight, WALL_MOUNT_KINDS, createBuilding, createHouse, createTerrain, duplicateFloor, emptyProject, entity, removeEntity, roomFromPoints, snap, uid, updateEntity, wallFromPoints, type Entity, type Kind, type Project, type Tool, type View } from '@/lib/habitat/domain';
import type { EngineState, HabitatEngine, Pick, DragStatus, SwitchTarget } from '@/lib/habitat/engine';
import { addPenthouse } from '@/lib/habitat/penthouse';
import { DEFAULT_LOOK_SENSITIVITY, normalizeLookSensitivity } from '@/lib/habitat/walk-controls';

const STORAGE_KEY='habitat-studio:project:v1';
const LOOK_SETTINGS_KEY='habitat-studio:mouse-sensitivity:v1';
const icons:Record<Kind,ComponentType<{size?:number;strokeWidth?:number;className?:string}>>={wall:Columns3,room:Square,door:DoorOpen,window:AppWindow,roof:House,stairs:Layers3,sofa:Sofa,armchair:Armchair,bed:BedDouble,table:Table2,chair:Armchair,cabinet:Box,fridge:Refrigerator,stove:CookingPot,sink:Bath,toilet:Bath,plant:Leaf,plantSmall:Leaf,succulent:Leaf,flowerPot:Flower2,lamp:Lightbulb,terrain:MapIcon,lawn:Leaf,paving:Grid2X2,fence:Fence,gate:DoorOpen,pool:Waves,tree:Trees,object:Box,slab:Square,pergola:Columns3,railing:Fence,microwave:AppWindow,washingMachine:Waves,dryer:Waves,dishwasher:AppWindow,oven:CookingPot,cooktop:CookingPot,hood:Layers3,airConditioner:AppWindow,baseCabinet:Box,wallCabinet:Box,drawerUnit:SlidersHorizontal,bookshelf:Layers3,wardrobe:Columns3,closetPanel:Columns3,countertop:Square,lightSwitch:SlidersHorizontal,ceilingLight:Lightbulb};
const sections=[{id:'structure',label:'Estrutura'},{id:'furniture',label:'Móveis'},{id:'appliances',label:'Equipamentos'},{id:'outdoor',label:'Área externa'},{id:'woodwork',label:'Marcenaria'}] as const;
type DialogMode='building'|'empty'|'help'|'penthouse'|null;

function NumberField({label,value,onChange,min=.05,max=100,step=.1,disabled=false}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number;disabled?:boolean}){
  const [draft,setDraft]=useState(String(Math.round(value*1000000)/1000000));
  const [lastValue,setLastValue]=useState(value);
  if(value!==lastValue){setLastValue(value);setDraft(String(Math.round(value*1000000)/1000000));}
  const commit=()=>{const n=Number(draft);if(draft.trim()===''||!Number.isFinite(n)||n<min||n>max){setDraft(String(Math.round(value*1000000)/1000000));return;}if(n!==value)onChange(n);};
  return <label className="number-field"><span>{label}</span><div><Input type="number" value={draft} min={min} max={max} step={step} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>{label==='Rotação'?'°':'m'}</span></div></label>;
}

export default function Studio(){
  const [project,setProject]=useState<Project>(()=>installRoomLighting(createBuilding(2)));
  const [floorId,setFloorId]=useState(project.floors[0].id);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [view,setView]=useState<View>('3d');
  const [realMode,setRealMode]=useState(false),[lighting,setLighting]=useState<'day'|'night'>('day');
  const [realQuality,setRealQuality]=useState<RealQuality>('high'),[realExposure,setRealExposure]=useState(1);
  const [materialStatus,setMaterialStatus]=useState<MaterialStatus>({state:'loading',loaded:0,total:0});
  const [realUnavailable,setRealUnavailable]=useState(false),[viewportGeneration,setViewportGeneration]=useState(0);
  const pendingReal=useRef(false);
  const [locationOpen,setLocationOpen]=useState(false),[contextStatus,setContextStatus]=useState<ContextStatus>({...EMPTY_CONTEXT});
  const [lightingOpen,setLightingOpen]=useState(false),[switchTarget,setSwitchTarget]=useState<SwitchTarget|null>(null);
  const [penthouseStyle,setPenthouseStyle]=useState<'apartment'|'terrace'>('apartment');
  const [tool,setTool]=useState<Tool>('select');
  const [productOpen,setProductOpen]=useState(false),[placement,setPlacement]=useState<Partial<Entity>|null>(null);
  const [repositionId,setRepositionId]=useState<string|null>(null),[placementHint,setPlacementHint]=useState<{text:string;valid:boolean}|null>(null);
  const [projectTemplate,setProjectTemplate]=useState('house');
  const [placing,setPlacing]=useState<Kind>('sofa');
  const [drawStart,setDrawStart]=useState<{x:number;z:number}|null>(null);
  const [cutaway,setCutaway]=useState(true),[isolate,setIsolate]=useState(true),[grid,setGrid]=useState(true),[snapping,setSnapping]=useState(true);
  const [rotation,setRotation]=useState(0),[focusId,setFocusId]=useState<string|null>(null);
  const [looking,setLooking]=useState(false),[saved,setSaved]=useState(false),[storageError,setStorageError]=useState('');
  const [dragStatus,setDragStatus]=useState<DragStatus|null>(null);
  const [lookSensitivity,setLookSensitivity]=useState(DEFAULT_LOOK_SENSITIVITY);
  const [position,setPosition]=useState({x:0,z:0,feet:0}),[cursor,setCursor]=useState({x:0,z:0});
  const [category,setCategory]=useState('structure'),[libraryOpen,setLibraryOpen]=useState(true),[inspectorOpen,setInspectorOpen]=useState(false);
  const [dialog,setDialog]=useState<DialogMode>(null),[buildingFloors,setBuildingFloors]=useState(3),[roomFilter,setRoomFilter]=useState('all');
  const [historyStats,setHistoryStats]=useState({past:0,future:0});
  const engineRef=useRef<HabitatEngine|null>(null),projectRef=useRef(project),loaded=useRef(false),importRef=useRef<HTMLInputElement>(null);
  const history=useRef<{past:Project[];future:Project[]}>({past:[],future:[]});
  const selected=project.entities.find(e=>e.id===selectedId)??null;
  const attachmentSuggestion=useMemo(()=>{if(!selected)return null;const candidate=suggestedAttachment(project,selected);if(!candidate)return null;const changed=(['x','y','z','rotation','w','d','wallMountId','supportId','ceilingRoomId'] as const).some(key=>candidate[key]!==selected[key])||JSON.stringify(candidate.roofWallIds)!==JSON.stringify(selected.roofWallIds);return changed?candidate:null;},[project,selected]);
  const activeFloor=project.floors.find(f=>f.id===floorId)??project.floors[0];
  const floorEntities=project.entities.filter(e=>e.floorId===activeFloor.id);
  const apartments=Array.from(new Set(floorEntities.map(e=>e.apartment).filter(Boolean))).sort();
  const rooms=floorEntities.filter(e=>e.kind==='room'&&(roomFilter==='all'||e.apartment===roomFilter));
  const visibleRooms=rooms.filter(r=>r.w>=2&&r.d>=2);
  const totalArea=project.entities.filter(e=>e.kind==='room').reduce((sum,e)=>sum+e.w*e.d,0);

  const commit=useCallback((candidate:Project)=>{
    const checked=ProjectSchema.safeParse(candidate);
    if(!checked.success){toast.error(checked.error.issues[0]?.message??'Alteração inválida.');return false;}
    history.current.past.push(projectRef.current);if(history.current.past.length>40)history.current.past.shift();history.current.future=[];
    projectRef.current=candidate;setProject(candidate);setHistoryStats({past:history.current.past.length,future:0});setSaved(false);return true;
  },[]);
  const replace=useCallback((candidate:Project)=>{if(commit(candidate)){setFloorId(candidate.floors[0].id);setSelectedId(null);setDrawStart(null);setTool('select');setPlacement(null);setRepositionId(null);setPlacementHint(null);setRoomFilter('all');setView('3d');setRealMode(false);}},[commit]);
  const undo=useCallback(()=>{
    const previous=history.current.past.pop();if(!previous)return;
    history.current.future.push(projectRef.current);projectRef.current=previous;setProject(previous);setSelectedId(null);setDrawStart(null);setFloorId(id=>previous.floors.some(f=>f.id===id)?id:previous.floors[0].id);setHistoryStats({past:history.current.past.length,future:history.current.future.length});setSaved(false);
  },[]);
  const redo=useCallback(()=>{
    const next=history.current.future.pop();if(!next)return;
    history.current.past.push(projectRef.current);projectRef.current=next;setProject(next);setFloorId(id=>next.floors.some(f=>f.id===id)?id:next.floors[0].id);setSelectedId(null);setDrawStart(null);setHistoryStats({past:history.current.past.length,future:history.current.future.length});setSaved(false);
  },[]);
  const save=useCallback((notify=false)=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(projectRef.current));setSaved(true);setStorageError('');if(notify)toast.success('Projeto salvo neste navegador.');}
    catch{setSaved(false);setStorageError('Não foi possível salvar neste navegador. Exporte o projeto para guardar uma cópia.');if(notify)toast.error('Não foi possível salvar. Use Exportar.');}
  },[]);
  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const parsed=ProjectSchema.safeParse(JSON.parse(raw));if(parsed.success){projectRef.current=parsed.data;setProject(parsed.data);setFloorId(parsed.data.floors[0].id);}else toast.error('O projeto salvo não pôde ser lido. O exemplo foi aberto.');}}
      catch{toast.error('O armazenamento local não está disponível. Você pode exportar seu projeto.');}
      try{const sensitivity=localStorage.getItem(LOOK_SETTINGS_KEY);if(sensitivity!==null)setLookSensitivity(normalizeLookSensitivity(Number(sensitivity)));}catch{}
      if(window.matchMedia('(max-width:650px)').matches)setLibraryOpen(false);
      loaded.current=true;save();
    });
    return()=>{cancelled=true;};
  },[save]);
  useEffect(()=>{if(!loaded.current)return;const timeout=setTimeout(()=>save(),500);return()=>clearTimeout(timeout);},[project,save]);
  const exportProject=useCallback(()=>{
    const blob=new Blob([JSON.stringify(projectRef.current,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`${projectRef.current.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'habitat'}.habitat.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast.success('Projeto exportado.');
  },[]);
  const importProject=async(file:File)=>{
    if(file.size>5*1024*1024){toast.error('O arquivo deve ter até 5 MB.');return;}
    try{const parsed=ProjectSchema.safeParse(JSON.parse(await file.text()));if(!parsed.success){toast.error(`Arquivo inválido: ${parsed.error.issues[0]?.message}`);return;}replace(parsed.data);toast.success('Projeto importado.');}catch{toast.error('Selecione um arquivo JSON de projeto válido.');}
  };
  const onLightUpdate=(id:string,light:NonNullable<Entity['light']>)=>commit(updateEntity(projectRef.current,id,{light}));
  const onToggleLight=useCallback((id:string)=>{const next=toggleLight(projectRef.current,id);if(next!==projectRef.current)commit(next);},[commit]);
  const onAllLights=(on:boolean)=>{const ids=new Set(projectRef.current.entities.filter(e=>e.floorId===floorId&&isLitRoom(e)).map(e=>e.id));commit({...projectRef.current,entities:projectRef.current.entities.map(e=>ids.has(e.id)?{...e,light:{...lightSettings(e),on}}:e)});};
  const installLights=()=>{const next=installRoomLighting(projectRef.current,floorId);if(next===projectRef.current){toast.info('Os cômodos deste andar já estão equipados.');return;}if(commit(next))toast.success('Luzes e interruptores instalados.');};
  const edit=(patch:Partial<Entity>)=>{if(!selected)return;
    if(selected.switchWallId&&['x','z','y','w','h','d'].some(key=>key in patch)){
      const item={...selected,...patch},wall=project.entities.find(e=>e.id===selected.switchWallId)!;
      const mount=switchMountPosition(project,wall.id,{x:item.x,z:item.z,y:(item.y??1.1)+item.h/2},{item,side:Math.sign(localPoint(wall,selected.x,selected.z).z)||1,ignoreId:selected.id});
      if(!mount){toast.info('Escolha uma posição livre, fora de portas e janelas.');return;}patch={...patch,...mount};
    }
    if(selected.wallMountId&&['x','z','y','w','h','d'].some(key=>key in patch)){
      const item={...selected,...patch},wall=project.entities.find(e=>e.id===selected.wallMountId)!;
      const mount=wallMountPosition(project,wall.id,item,{x:item.x,z:item.z,y:(item.y??0)+item.h/2},{side:Math.sign(localPoint(wall,selected.x,selected.z).z)||1,ignoreId:item.id});
      if(!mount){toast.info('O objeto não cabe nesta parte da parede.');return;}patch={...patch,...mount};
    }
    if(selected.supportId){const item={...selected,...patch},support=project.entities.find(e=>e.id===selected.supportId)!;const mounted=supportPosition(support,item,item,false,selected.supportRatio??1);if(!mounted){toast.info('O objeto não cabe na superfície de apoio.');return;}patch={...patch,...mounted};}
    if(selected.ceilingRoomId){const item={...selected,...patch},room=project.entities.find(e=>e.id===item.ceilingRoomId)!;const height=ceilingHeight(project.entities,room);if(height!==null)patch={...patch,y:height-item.h-.002};}
    commit(updateEntity(projectRef.current,selected.id,patch));};
  const onMove=useCallback((id:string,point:MovePoint)=>{
    const item=projectRef.current.entities.find(e=>e.id===id);
    if(!item || item.x===point.x&&item.z===point.z&&(point.y===undefined||item.y===point.y))return false;
    return commit(updateEntity(projectRef.current,id,point));
  },[commit]);
  const onRotate=useCallback((id:string,rotation:number)=>{
    const item=projectRef.current.entities.find(e=>e.id===id);
    if(!item||item.hostId||item.switchWallId||item.wallMountId||item.roofWallIds||item.rotation===rotation)return false;
    return commit(updateEntity(projectRef.current,id,{rotation}));
  },[commit]);
  const removeSelected=useCallback(()=>{if(!selectedId)return;commit(removeEntity(projectRef.current,selectedId));setSelectedId(null);},[commit,selectedId]);
  const duplicateSelected=()=>{
    if(!selected)return;
    if(selected.kind==='door'||selected.kind==='window'){toast.info('Para duplicar uma abertura, coloque uma nova na parede.');return;}
    if(selected.kind==='roof'){toast.info('Desenhe outro telhado sobre as paredes para obter um novo encaixe.');return;}
    let copy={...selected,id:uid(),name:`${selected.name} · cópia`,x:selected.x+.5,z:selected.z+.5};
    const wallId=selected.switchWallId??selected.wallMountId;
    if(wallId){const wall=project.entities.find(e=>e.id===wallId)!;const local=localPoint(wall,selected.x,selected.z),step=selected.switchWallId?.15:selected.w+.05;const mount=[step,-step].map(delta=>{const point={...worldPoint(wall,local.x+delta,local.z),y:(selected.y??0)+selected.h/2};return selected.switchWallId?switchMountPosition(project,wall.id,point,{item:copy,side:Math.sign(local.z)}):wallMountPosition(project,wall.id,copy,point,{side:Math.sign(local.z)});}).find(Boolean);if(!mount){toast.info('Não há espaço livre junto ao objeto.');return;}copy={...copy,...mount};}
    if(selected.supportId){const support=project.entities.find(e=>e.id===selected.supportId)!;const mount=supportPosition(support,copy,copy,false,selected.supportRatio??1);if(!mount){toast.info('O objeto não cabe nesta superfície.');return;}copy={...copy,...mount};}
    if(selected.ceilingRoomId){const room=project.entities.find(e=>e.id===selected.ceilingRoomId)!;if(!inside(room,copy.x,copy.z)){copy={...copy,x:selected.x,z:selected.z};}}
    const descendants=new Set([selected.id]);let grew=true;while(grew){grew=false;for(const e of project.entities){const parent=e.hostId??e.switchWallId??e.wallMountId??e.supportId??e.ceilingRoomId;if(parent&&descendants.has(parent)&&!descendants.has(e.id)){descendants.add(e.id);grew=true;}}}
    const remap=new Map([...descendants].map(id=>[id,id===selected.id?copy.id:uid()])),dx=copy.x-selected.x,dz=copy.z-selected.z;
    const children=project.entities.filter(e=>e.id!==selected.id&&descendants.has(e.id)).map(e=>({...e,id:remap.get(e.id)!,x:e.x+dx,z:e.z+dz,hostId:e.hostId?remap.get(e.hostId)??e.hostId:undefined,switchWallId:e.switchWallId?remap.get(e.switchWallId)??e.switchWallId:undefined,wallMountId:e.wallMountId?remap.get(e.wallMountId)??e.wallMountId:undefined,supportId:e.supportId?remap.get(e.supportId)??e.supportId:undefined,ceilingRoomId:e.ceilingRoomId?remap.get(e.ceilingRoomId)??e.ceilingRoomId:undefined,roomId:e.roomId?remap.get(e.roomId)??e.roomId:undefined}));
    if(commit({...projectRef.current,entities:[...projectRef.current.entities,copy,...children]}))setSelectedId(copy.id);
  };
  const activateTool=(kind:Kind)=>{
    if(kind==='terrain'&&activeFloor.elevation>0){changeFloor(project.floors.reduce((a,b)=>a.elevation<b.elevation?a:b).id);toast.info('A área externa será desenhada no térreo.');}
    setRepositionId(null);setPlacementHint(null);setPlacing(kind);setPlacement(null);setDrawStart(null);setSelectedId(null);setTool(AREA_KINDS.includes(kind)?'area':['fence','railing'].includes(kind)?'line':['wall','room','roof'].includes(kind)?kind as Tool:'place');if(view==='walk'){setView('3d');setRealMode(false);}
    if(kind==='lightSwitch')setCutaway(false);
    if(['wall','room','roof','fence','railing',...AREA_KINDS].includes(kind))toast.info(kind==='wall'||['fence','railing'].includes(kind)?'Clique no início e no fim.':'Clique em dois cantos da área.');
  };
  const onPick=(pick:Pick)=>{
    if(tool==='select'||tool==='move'){setSelectedId(pick.entityId);if(pick.entityId)setInspectorOpen(true);return;}
    const point={x:snap(pick.point.x,snapping),z:snap(pick.point.z,snapping)};
    if(tool==='place'){
      const placed=suggestedPlacement(project,placing,floorId,pick,{item:placement,rotation,snapping,plan:view==='plan'});
      if(!placed){toast.info(WALL_MOUNT_KINDS.includes(placing)||['lightSwitch','door','window'].includes(placing)?'Clique em uma parte livre da parede. O objeto precisa caber fora das aberturas.':placing==='ceilingLight'?'Clique dentro de um cômodo fechado para encaixar no teto.':'Escolha uma superfície onde o objeto caiba.');return;}
      if(['lamp','ceilingLight'].includes(placing)){const room=circuitRoom(project,placed);if(room)placed.roomId=room.id;}
      const next=repositionId?updateEntity(projectRef.current,repositionId,placed):{...projectRef.current,entities:[...projectRef.current.entities,placed]};
      if(commit(next)){setSelectedId(placed.id);setInspectorOpen(true);toast.success(repositionId?'Encaixe atualizado.':`${placed.name} colocado(a).`);if(placement||repositionId){setTool('select');setPlacement(null);setRepositionId(null);setPlacementHint(null);}}
    }else if(!drawStart)setDrawStart(point);
    else{
      let additions:Entity[]=[];
      if(tool==='wall'){const wall=wallFromPoints(floorId,drawStart,point);if(wall)additions=[wall];}
      if(tool==='line'){const line=wallFromPoints(floorId,drawStart,point);if(line)additions=[entity(placing,floorId,line.x,line.z,{w:line.w,rotation:line.rotation})];}
      if(tool==='room')additions=roomFromPoints(floorId,drawStart,point);
      if(tool==='roof'||tool==='area'){const w=Math.abs(point.x-drawStart.x),d=Math.abs(point.z-drawStart.z);if(w>=1&&d>=1){const item=entity(tool==='roof'?'roof':placing,floorId,(point.x+drawStart.x)/2,(point.z+drawStart.z)/2,{w,d});if(tool==='roof'){const fitted=fitRoof(project,item);if(!fitted){toast.info('Desenhe sobre as paredes para sugerir o encaixe do telhado.');return;}additions=[fitted];}else additions=[item];}}
      if(!additions.length){toast.info('Desenhe uma área maior. Paredes: mínimo 0,5 m; áreas: mínimo 1 × 1 m.');return;}
      if(commit({...projectRef.current,entities:[...projectRef.current.entities,...additions]}))setSelectedId(additions[0].id);setDrawStart(null);
    }
  };
  const addFloor=(copy=false)=>{
    if(project.floors.length>=20){toast.error('Limite de 20 andares atingido.');return;}
    if(copy){const next=duplicateFloor(projectRef.current,floorId);if(commit(next.project))setFloorId(next.floorId);}
    else{const next={id:uid(),name:`${project.floors.length}º andar`,elevation:Math.max(...project.floors.map(f=>f.elevation))+3.2};if(commit({...projectRef.current,floors:[...projectRef.current.floors,next]}))setFloorId(next.id);}
    setSelectedId(null);setDrawStart(null);setRoomFilter('all');
  };
  const changeFloor=(id:string)=>{setFloorId(id);setSelectedId(null);setDrawStart(null);setRoomFilter('all');};
  const chooseRoom=(room:Entity)=>{setSelectedId(room.id);setFocusId(room.id);setTool('select');setDrawStart(null);setInspectorOpen(true);};
  const changeView=(value:View,real=false)=>{if(real&&engineRef.current?.software){engineRef.current.pauseInput();setRealUnavailable(true);return;}if(real&&!engineRef.current){toast.info('Aguarde o carregamento do editor.');return;}setRealMode(real);setSwitchTarget(null);setView(value);setRepositionId(null);setPlacement(null);setPlacementHint(null);setTool('select');setDrawStart(null);setRotation(0);};

  const currentActions=useRef({undo,redo,removeSelected,save,exportProject,rotation,selected,edit,view});
  useEffect(()=>{currentActions.current={undo,redo,removeSelected,save,exportProject,rotation,selected,edit,view};});
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement).closest('input,textarea,select,[role="dialog"],[role="combobox"],[contenteditable="true"]'))return;
      const actions=currentActions.current;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)actions.redo();else actions.undo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();actions.save(true);return;}
      if(e.key==='Escape'){setRepositionId(null);setPlacement(null);setPlacementHint(null);setTool('select');setDrawStart(null);setSelectedId(null);return;}
      if(actions.view==='walk')return;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();actions.removeSelected();}
      if(e.key.toLowerCase()==='r'){if(actions.selected){if(!actions.selected.hostId&&!actions.selected.switchWallId&&!actions.selected.wallMountId&&!actions.selected.roofWallIds)actions.edit({rotation:actions.selected.rotation+90});}else setRotation(r=>(r+90)%360);}
      if(e.key.toLowerCase()==='m'){setTool('move');setDrawStart(null);}
      if(e.key.toLowerCase()==='v'){setTool('select');setDrawStart(null);}
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[]);

  // A feature-detected WebMCP bridge reuses the document and editor actions.
  useEffect(()=>{
    type ToolContext={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>unknown};
    const context=(document as Document & {modelContext?:ToolContext}).modelContext;if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const register=(name:string,description:string,inputSchema:object,readOnlyHint:boolean,execute:(input:unknown)=>unknown)=>{
      try{Promise.resolve(context.registerTool({name,description,inputSchema,annotations:{readOnlyHint},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Unsupported registries do not affect the editor. */}
    };
    register('read_habitat_project','Read the current building, floors, and objects.',{type:'object',properties:{},additionalProperties:false},true,()=>({name:projectRef.current.name,floors:projectRef.current.floors,entities:projectRef.current.entities}));
    register('set_habitat_view','Switch the editor to 3D, floor plan, or first-person walking.',{type:'object',properties:{view:{type:'string',enum:['3d','plan','walk']}},required:['view'],additionalProperties:false},false,input=>{
      const v=(input as {view?:View})?.view;if(!v||!['3d','plan','walk'].includes(v))throw new Error('Invalid view');setView(v);setTool('select');setDrawStart(null);return{view:v};
    });
    register('add_habitat_objects','Place furniture or appliances on a floor using meter coordinates.',{type:'object',properties:{floorId:{type:'string'},objects:{type:'array',minItems:1,maxItems:50,items:{type:'object',properties:{kind:{type:'string',enum:CATALOG.filter(i=>!['wall','room','door','window','roof','stairs'].includes(i.kind)).map(i=>i.kind)},x:{type:'number'},z:{type:'number'}},required:['kind','x','z'],additionalProperties:false}}},required:['floorId','objects'],additionalProperties:false},false,input=>{
      const v=input as {floorId?:string;objects?:{kind:Kind;x:number;z:number}[]};
      if(!v?.floorId||!projectRef.current.floors.some(f=>f.id===v.floorId)||!Array.isArray(v.objects)||!v.objects.length||v.objects.length>50)throw new Error('Invalid floor or objects');
      const allowed=CATALOG.filter(i=>i.section!=='structure').map(i=>i.kind);
      if(v.objects.some(o=>!allowed.includes(o.kind)||!Number.isFinite(o.x)||!Number.isFinite(o.z)))throw new Error('Invalid object');
      const additions=v.objects.map(o=>entity(o.kind,v.floorId!,o.x,o.z));
      if(!commit({...projectRef.current,entities:[...projectRef.current.entities,...additions]}))throw new Error('Invalid document');
      return{created:additions.map(e=>({id:e.id,kind:e.kind,floorId:e.floorId}))};
    });
    return()=>lifecycle.abort();
  },[commit]);

  const engineState:EngineState=useMemo(()=>({project,floorId,view,realMode,realQuality,realExposure,lighting,isolate,cutaway,grid,selectedId,tool,placing,drawStart,snapping,focusId,rotation,lookSensitivity,placement,suggestion:attachmentSuggestion}),[project,floorId,view,realMode,realQuality,realExposure,lighting,isolate,cutaway,grid,selectedId,tool,placing,drawStart,snapping,focusId,rotation,lookSensitivity,placement,attachmentSuggestion]);
  const changeLookSensitivity=(value:number)=>{const next=normalizeLookSensitivity(value);setLookSensitivity(next);try{localStorage.setItem(LOOK_SETTINGS_KEY,String(next));}catch{}};
  const setEngine=useCallback((engine:HabitatEngine|null)=>{engineRef.current=engine;if(engine&&pendingReal.current){pendingReal.current=false;if(engine.software)setRealUnavailable(true);else{setRealUnavailable(false);setRealMode(true);setView('walk');setTool('select');setDrawStart(null);setRotation(0);}}},[]);
  const toolLabel=tool==='select'?'Selecionar':tool==='move'?'Mover':placement?.name??catalogFor(placing).name;
  const movingName=dragStatus?project.entities.find(e=>e.id===dragStatus.entityId)?.name:'elemento';
  const guidance=view==='walk'?'WASD para andar · Shift para correr · Segure e arraste para olhar':dragStatus?dragStatus.phase==='rotating'?`Girando ${movingName} · ${dragStatus.rotation?.toLocaleString('pt-BR')}° · Solte para concluir · Esc cancela`:dragStatus.phase==='holding'?`Segure para mover ${movingName}…`:`Movendo ${movingName} · Solte para colocar · Esc para cancelar`:tool==='move'?'Arraste um elemento para mover · V para selecionar e navegar':tool==='select'?`Segure um elemento para mover · Arraste direto para ${view==='plan'?'navegar':'orbitar'} · Scroll para aproximar`:tool==='place'?(placing==='ceilingLight'?'Clique no cômodo · O plafon encaixa na altura do teto':WALL_MOUNT_KINDS.includes(placing)?'Clique na parede · Encaixe automático de face e altura':placing==='lightSwitch'?'Clique na face da parede · Prévia verde indica o encaixe · Esc cancela':placing==='door'||placing==='window'?'Clique em uma parede para inserir a abertura':'Clique no piso ou no tampo de um móvel · Prévia verde indica o encaixe · Esc cancela'):drawStart?'Clique no segundo ponto para concluir · Esc para cancelar':'Clique no primeiro ponto · Esc para cancelar';

  return <main className={`studio ${view==='walk'?'walking':''} ${realMode?'real-mode':''}`}>
    <Toaster position="bottom-center"/>
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><House size={22}/></div><div><strong>habitat<span>studio</span></strong><small>CONSTRUIR & EXPLORAR</small></div></div>
      <div className="project-heading"><span className="header-divider"/><Pencil size={14}/><Input aria-label="Nome do projeto" value={project.name} maxLength={120} onChange={e=>{if(e.target.value.trim())commit({...projectRef.current,name:e.target.value});}}/><span className="version-chip">v0.7</span></div>
      <div className="header-actions"><Button variant="outline" className="location-open-button" onClick={()=>{engineRef.current?.pauseInput();setLocationOpen(true);}}><MapIcon size={16}/><span>Local real</span></Button><span className={`save-state ${storageError?'warning':''}`} title={storageError||'Salvo apenas neste navegador'}>{saved?<Check size={14}/>:<Save size={14}/>}<span>{storageError?'Exportar para salvar':saved?'Salvo localmente':'Salvando…'}</span></span><Button variant="ghost" size="icon" title="Importar projeto" aria-label="Importar projeto" onClick={()=>importRef.current?.click()}><Upload/></Button><Button variant="outline" className="export-button" onClick={exportProject}><Download/><span>Exportar</span></Button><Button variant="ghost" size="icon" title="Ajuda e atalhos" aria-label="Ajuda e atalhos" onClick={()=>setDialog('help')}><CircleHelp/></Button></div>
      <input type="file" accept=".json,application/json" hidden ref={importRef} onChange={e=>{const file=e.target.files?.[0];if(file)void importProject(file);e.currentTarget.value='';}}/>
    </header>

    <div className="workbench">
      <aside className={`library-panel ${libraryOpen?'open':'collapsed'}`} aria-label="Biblioteca de elementos">
        <div className="panel-heading"><h2>Biblioteca</h2><Button variant="ghost" size="icon-sm" aria-label="Recolher biblioteca" onClick={()=>setLibraryOpen(false)}><PanelLeftClose size={16}/></Button></div>
        <p className="panel-intro">Tudo para dar forma ao seu espaço.</p>
        <Tabs value={category} onValueChange={setCategory} className="library-tabs">
          <TabsList className="catalog-tabs"><TabsTrigger value="structure">Construir</TabsTrigger><TabsTrigger value="furniture">Mobiliar</TabsTrigger><TabsTrigger value="appliances">Equipar</TabsTrigger><TabsTrigger value="outdoor">Área externa</TabsTrigger><TabsTrigger value="woodwork">Marcenaria</TabsTrigger></TabsList>
          {sections.map(section=><TabsContent value={section.id} key={section.id} className="catalog-content"><div className="eyebrow">{section.label}<span>{CATALOG.filter(i=>i.section===section.id).length} itens</span></div><div className="catalog-grid">{CATALOG.filter(i=>i.section===section.id).map(item=>{const Icon=icons[item.kind],active=!['select','move'].includes(tool)&&placing===item.kind;return <button className={`catalog-card ${active?'active':''}`} key={item.kind} onClick={()=>activateTool(item.kind)} title={item.hint} aria-pressed={active} data-testid={`catalog-${item.kind}`}><div className={`catalog-icon ${item.section}`}><Icon size={30} strokeWidth={1.35}/></div><strong>{item.name}</strong><span>{item.kind==='wall'?'Desenhar':item.kind==='room'?'Criar área':['roof','slab','pergola'].includes(item.kind)?'Cobrir área':`${item.w.toFixed(1)} × ${item.d.toFixed(1)} m`}</span></button>;})}</div></TabsContent>)}
        </Tabs>
        <div className="library-bottom"><Button variant="outline" className="import-product-button" onClick={()=>setProductOpen(true)}><Link2 size={17}/>Produto por link</Button><div className="library-note"><SquareMousePointer size={18}/><p>{guidance}</p></div><Button variant="outline" className="generate-button" onClick={()=>setDialog('building')}><Building2 size={17}/>Gerar prédio</Button><Button variant="ghost" className="new-project" onClick={()=>setDialog('empty')}><Plus size={15}/>Novo projeto</Button></div>
      </aside>

      <section className="viewport-shell" aria-label="Editor arquitetônico">
        <div className="viewport-heading"><div><House size={16}/><span>{activeFloor.name}</span><span className="breadcrumb-dot">/</span><span className="muted">{view==='walk'?'Exploração':isolate?'Andar ativo':'Projeto completo'}</span></div><div className="view-switch" role="group" aria-label="Modo de visualização"><button className={view==='3d'?'active':''} onClick={()=>changeView('3d')} aria-pressed={view==='3d'}><Box size={15}/>3D</button><button className={view==='plan'?'active':''} onClick={()=>changeView('plan')} aria-pressed={view==='plan'}><Grid2X2 size={15}/>Planta</button><button className={view==='walk'&&!realMode?'active walk-mode':''} onClick={()=>changeView('walk')} aria-pressed={view==='walk'&&!realMode}><Footprints size={15}/><span>Caminhar</span></button><button className={realMode?'active real-button':'real-button'} onClick={()=>changeView('walk',true)} aria-pressed={realMode} aria-label="Modo real"><Sparkles size={15}/><span>Real</span></button></div></div>
        <div className="scene-area">
          <Button className="open-lighting" variant="outline" size="sm" onClick={()=>{engineRef.current?.pauseInput();setLightingOpen(true);}}><Lightbulb size={16}/>Luzes</Button>
          <Viewport key={viewportGeneration} state={engineState} callbacks={{onContextStatus:setContextStatus,onPlacementHint:setPlacementHint,onRealStatus:setMaterialStatus,onToggleLight,onSwitchTarget:setSwitchTarget,onPick,onHover:setCursor,onLook:setLooking,onError:m=>toast.info(m),onPosition:setPosition,onMove,onRotate,onDragState:setDragStatus}} onEngine={setEngine}/>
          {!libraryOpen&&view!=='walk'&&<Button className="open-library" variant="outline" size="icon" aria-label="Abrir biblioteca" onClick={()=>setLibraryOpen(true)}><PanelLeftOpen/></Button>}
          {view!=='walk'&&<div className="scene-toolbar" aria-label="Ferramentas de edição"><Button variant={tool==='select'?'default':'ghost'} size="icon" aria-label="Selecionar" title="Selecionar (V)" onClick={()=>{setTool('select');setDrawStart(null);}}><MousePointer2 size={18}/></Button><Button variant={tool==='move'?'default':'ghost'} size="sm" className="move-tool-button" aria-label="Mover elemento" title="Mover elemento (M)" onClick={()=>{setTool('move');setDrawStart(null);}}><Move size={18}/><span>Mover</span></Button><span/><Button variant="ghost" size="icon" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!historyStats.past} onClick={undo}><Undo2 size={18}/></Button><Button variant="ghost" size="icon" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!historyStats.future} onClick={redo}><Redo2 size={18}/></Button><span/><Button variant="ghost" size="sm" className="move-tool-button" aria-label="Girar elemento" title="Girar 90° (R); arraste a alça do objeto para outros ângulos" disabled={Boolean(selected?.hostId||selected?.switchWallId||selected?.wallMountId||selected?.roofWallIds)||!selected&&['select','move'].includes(tool)} onClick={()=>selected?edit({rotation:selected.rotation+90}):setRotation(r=>(r+90)%360)}><RotateCw size={18}/><span>Girar</span></Button><Button variant="ghost" size="icon" aria-label="Excluir elemento" title="Excluir (Delete)" disabled={!selected} onClick={removeSelected}><Trash2 size={17}/></Button></div>}
          {view!=='walk'&&<div className="scene-options"><label><Switch checked={cutaway} onCheckedChange={setCutaway} aria-label="Corte de paredes"/><span title="As partes altas ficam transparentes, mantendo a referência de altura">Corte</span></label><label><Switch checked={isolate} onCheckedChange={setIsolate} aria-label="Isolar andar"/><span>Isolar andar</span></label></div>}
          {view!=='walk'&&<div className="scene-context"><span className="context-icon"><Layers3 size={16}/></span><div><strong>{activeFloor.name}</strong><span>{floorEntities.filter(e=>e.kind==='room'&&e.w>=2&&e.d>=2).length} espaços · {floorEntities.length} elementos</span></div></div>}
          {view!=='walk'&&<div className="scene-navigation"><div className="compass"><span>N</span><div style={{transform:`rotate(${-((project.location?.enabled?project.location.heading:0)??0)}deg)`}}><ArrowUp size={22}/></div></div><div className="zoom-controls"><Button variant="ghost" size="icon" aria-label="Aproximar" onClick={()=>engineRef.current?.zoom(1)}><Plus size={17}/></Button><Button variant="ghost" size="icon" aria-label="Afastar" onClick={()=>engineRef.current?.zoom(-1)}><Minus size={17}/></Button><Button variant="ghost" size="icon" aria-label="Enquadrar projeto" onClick={()=>{setFocusId(null);engineRef.current?.home();}}><Scan size={17}/></Button></div></div>}
          {project.location?.enabled&&<LocationStatus status={contextStatus} walking={view==='walk'} onEdit={()=>{engineRef.current?.pauseInput();setLocationOpen(true);}} onRetry={()=>engineRef.current?.retryContext()} onOverview={()=>{setGrid(false);engineRef.current?.contextOverview();}}/>}
          {realMode&&<RealControls lighting={lighting} onLighting={setLighting} quality={realQuality} onQuality={setRealQuality} exposure={realExposure} onExposure={setRealExposure} status={materialStatus} onEdit={()=>changeView('3d')}/>}
          {view==='walk'&&switchTarget&&<Button className="switch-interaction" onClick={()=>onToggleLight(switchTarget.id)}><Lightbulb size={16}/>{switchTarget.on?'Desligar':'Ligar'} {switchTarget.name}<kbd>E</kbd></Button>}
          {view==='walk'&&<><div className="crosshair" aria-hidden="true"/><div className="walk-message"><Footprints size={21}/><div><strong>{realMode?'Modo real · explorar o projeto':'Você está dentro do projeto'}</strong><span>{looking?'Solte para parar de girar':'Segure e arraste para olhar'}</span></div></div><div className="walk-floors"><span>Ir para</span>{project.floors.map(f=><Button key={f.id} size="sm" variant={floorId===f.id?'default':'outline'} onClick={()=>changeFloor(f.id)}>{f.name}</Button>)}</div><div className="walk-mouse-settings" role="group" aria-label="Configuração do mouse"><label htmlFor="walk-look-sensitivity"><MousePointer2 size={14}/><span>Sensibilidade</span><output>{Math.round(lookSensitivity*100)}%</output></label><input id="walk-look-sensitivity" type="range" min={25} max={200} step={5} value={Math.round(lookSensitivity*100)} aria-label="Sensibilidade do mouse" aria-valuetext={`${Math.round(lookSensitivity*100)} por cento`} title="Ajuste a velocidade de giro da câmera" onChange={e=>changeLookSensitivity(Number(e.target.value)/100)}/></div><div className="walk-pad"><Button aria-label="Andar para frente" onClick={()=>engineRef.current?.step(1,0)} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);engineRef.current?.setTouchMove(1,0);}} onPointerUp={()=>engineRef.current?.setTouchMove(0,0)} onPointerCancel={()=>engineRef.current?.setTouchMove(0,0)}><ArrowUp/></Button><div>{[[-1,ArrowLeft],[0,ArrowDown],[1,ArrowRight]].map(([dir,Icon])=>{const I=Icon as typeof ArrowLeft;return <Button key={String(dir)} aria-label={dir===-1?'Andar à esquerda':dir===1?'Andar à direita':'Andar para trás'} onClick={()=>engineRef.current?.step(dir===0?-1:0,dir as number)} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);engineRef.current?.setTouchMove(dir===0?-1:0,dir as number);}} onPointerUp={()=>engineRef.current?.setTouchMove(0,0)} onPointerCancel={()=>engineRef.current?.setTouchMove(0,0)}><I/></Button>;})}</div></div></>}
          {view!=='walk'&&<Button variant="outline" size="icon" className="mobile-inspector-button" aria-label="Abrir propriedades" onClick={()=>setInspectorOpen(o=>!o)}><SlidersHorizontal/></Button>}
          {view!=='walk'&&placementHint&&<div className={`placement-hint ${placementHint.valid?'valid':'invalid'}`} role="status"><span>{placementHint.valid?'Encaixe sugerido':'Escolha outro apoio'}</span>{placementHint.text}</div>}
          <div className="scene-help" role="status" aria-live="polite"><MousePointer2 size={13}/><span>{guidance}</span></div>
        </div>
        <footer className="status-bar"><div><span className="tool-indicator"/>{toolLabel}<span className="status-divider"/><span className="coordinates">X {(view==='walk'?position.x:cursor.x).toFixed(2)}<span>Z {(view==='walk'?position.z:cursor.z).toFixed(2)}</span>{view==='walk'&&<span>Y {position.feet.toFixed(2)}</span>}</span></div><div>{view!=='walk'&&<><button className={snapping?'enabled':''} aria-pressed={snapping} onClick={()=>setSnapping(v=>!v)} aria-label="Encaixe: 0,25 m e 15 graus" title="Encaixe: posição a cada 0,25 m; rotação a cada 15°"><Maximize size={13}/>Encaixe</button><button className={grid?'enabled':''} aria-pressed={grid} onClick={()=>setGrid(v=>!v)} title="Exibir grade"><LayoutGrid size={13}/></button></>}<span className="unit-label">Metros</span></div></footer>
      </section>

      <aside className={`inspector-panel ${inspectorOpen?'open':''}`} aria-label="Propriedades e andares">
        <div className="panel-heading"><h2>{selected?'Propriedades':'Seu projeto'}</h2><Button variant="ghost" size="icon-sm" className="close-inspector" aria-label="Fechar propriedades" onClick={()=>setInspectorOpen(false)}><X size={16}/></Button><span className="panel-tag">{selected?'ELEMENTO':'VISÃO GERAL'}</span></div>
        <div className="inspector-scroll">
          {selected?<div className="properties"><div className="selected-heading"><div className="selected-icon">{(()=>{const Icon=icons[selected.kind];return <Icon size={22}/>;})()}</div><div><strong>{catalogFor(selected.kind).name}</strong><span>{activeFloor.name}</span></div><Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" onClick={()=>setSelectedId(null)}><X size={15}/></Button></div>
            {!['wall','room','terrain','lawn','paving','stairs','pool'].includes(selected.kind)&&<AttachmentControls item={selected} project={project} suggestion={attachmentSuggestion} onApply={()=>{if(attachmentSuggestion)commit(updateEntity(projectRef.current,selected.id,attachmentSuggestion));}} onReposition={()=>{setRepositionId(selected.id);setPlacement(selected);setPlacing(selected.kind);setRotation(selected.rotation);setTool('place');setDrawStart(null);setPlacementHint(null);toast.info('Clique no novo apoio. A prévia verde mostra o encaixe.');}}/>}
            {selected.kind==='door'&&<div className="door-fit-controls"><Button variant="outline" size="sm" onClick={()=>edit({doorHinge:selected.doorHinge==='right'?'left':'right'})}>Dobradiça: {selected.doorHinge==='right'?'direita':'esquerda'}</Button><Button variant="outline" size="sm" onClick={()=>edit({doorSide:selected.doorSide===-1?1:-1})}>Inverter lado da abertura</Button></div>}
            {['room','lamp','ceilingLight'].includes(selected.kind)&&<LightControls item={selected} onChange={light=>onLightUpdate(selected.id,light)}/>}
            {['lightSwitch','lamp','ceilingLight'].includes(selected.kind)&&<label className="text-field">Cômodo do circuito<Select value={selected.roomId??'none'} onValueChange={id=>edit({roomId:id==='none'?undefined:id})}><SelectTrigger aria-label="Cômodo do circuito"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{selected.kind==='lightSwitch'?'Não vinculado':'Automático pela posição'}</SelectItem>{floorEntities.filter(e=>isLitRoom(e)).map(room=><SelectItem value={room.id} key={room.id}>{room.name}{room.apartment?` · ${room.apartment}`:''}</SelectItem>)}</SelectContent></Select>{selected.kind==='lightSwitch'&&<Button variant="outline" size="sm" disabled={!selected.roomId} onClick={()=>onToggleLight(selected.id)}><Lightbulb size={14}/>Acionar interruptor</Button>}</label>}
            {(selected.switchWallId||selected.wallMountId)&&(()=>{const wall=project.entities.find(e=>e.id===(selected.wallMountId??selected.switchWallId))!;const local=localPoint(wall,selected.x,selected.z);return <div className="switch-mount-controls"><NumberField label="Deslocamento na parede" value={local.x} min={-(wall.w-selected.w)/2+.02} max={(wall.w-selected.w)/2-.02} step={.05} onChange={offset=>edit(worldPoint(wall,offset,local.z))}/><Button variant="outline" size="sm" onClick={()=>{const point={x:selected.x,z:selected.z,y:(selected.y??0)+selected.h/2},mount=selected.wallMountId?wallMountPosition(project,wall.id,selected,point,{side:-Math.sign(local.z),ignoreId:selected.id}):switchMountPosition(project,wall.id,point,{item:selected,side:-Math.sign(local.z),ignoreId:selected.id});if(mount)commit(updateEntity(projectRef.current,selected.id,mount));else toast.info('Esta posição está ocupada na outra face.');}}>Trocar face da parede</Button><Button variant="outline" size="sm" onClick={()=>{setCutaway(false);setTool('move');engineRef.current?.focus(selected.id);}}>Mover na parede</Button></div>;})()}
            <label className="text-field">Nome<Input value={selected.name} maxLength={120} onChange={e=>edit({name:e.target.value})}/></label>
            <label className="text-field">Apartamento / unidade<Input placeholder="Ex.: Apto 101" value={selected.apartment} maxLength={80} onChange={e=>edit({apartment:e.target.value})}/></label>
            <div className="property-section-title">Posição & dimensões</div><div className="field-grid"><NumberField label="Posição X" value={selected.x} min={-150} max={150} disabled={Boolean(selected.hostId||selected.switchWallId||selected.wallMountId||selected.roofWallIds)} onChange={x=>edit({x})}/><NumberField label="Posição Z" value={selected.z} min={-150} max={150} disabled={Boolean(selected.hostId||selected.switchWallId||selected.wallMountId||selected.roofWallIds)} onChange={z=>edit({z})}/><NumberField label="Largura" value={selected.w} onChange={w=>edit({w})}/><NumberField label={selected.kind==='wall'?'Espessura':'Profundidade'} value={selected.d} disabled={Boolean(selected.hostId||selected.switchWallId||selected.wallMountId||selected.roofWallIds)} onChange={d=>edit({d})}/><NumberField label="Altura" value={selected.h} max={30} onChange={h=>edit({h})}/><NumberField label="Rotação" value={selected.rotation} min={-36000} max={36000} step={15} disabled={Boolean(selected.hostId||selected.switchWallId||selected.wallMountId||selected.roofWallIds)} onChange={rotation=>edit({rotation})}/></div>
            <div className="field-grid"><NumberField label="Elevação" value={selected.y??0} min={0} max={30} step={.05} disabled={Boolean(selected.hostId||selected.supportId||selected.ceilingRoomId||selected.roofWallIds)||['wall','room','stairs','terrain','lawn','paving','pool'].includes(selected.kind)} onChange={y=>edit({y})}/><label className="finish-field"><span>Acabamento</span><Select value={selected.finish??'auto'} onValueChange={finish=>edit({finish:finish as Entity['finish']})}><SelectTrigger aria-label="Acabamento do material"><SelectValue/></SelectTrigger><SelectContent>{[['auto','Automático'],['wood','Madeira'],['stone','Pedra'],['fabric','Tecido'],['metal','Metal'],['paint','Pintura']].map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label></div><p className="property-note">Elevação: distância acima do piso. Os acabamentos aparecem no Modo real.</p>
            <p className="property-note">{selected.wallMountId?'O objeto acompanha a parede. Mover na parede permite ajustar posição e altura.':selected.supportId?'O objeto acompanha o móvel de apoio. Use Reposicionar com encaixe para trocar de superfície.':selected.roofWallIds?'A base e os limites do telhado acompanham as paredes de apoio.':selected.switchWallId?'O interruptor fica encaixado na parede. Segure e arraste para deslizar e ajustar a altura. Use Deslocamento na parede para precisão. Encaixe: 5 cm.':selected.hostId?'A abertura acompanha a posição e a rotação da parede. Segure e arraste para deslizar pela parede.':'Arraste a alça circular para girar. Encaixe ativo: passos de 15°; Shift libera o ângulo. Use o campo Rotação para um valor exato. Segure sobre o elemento para mover.'}</p>
            {selected.product&&<div className="imported-product-info"><strong>Produto importado</strong><p>{selected.product.brand} {selected.product.model}</p><p>{(selected.w*100).toLocaleString('pt-BR')} × {(selected.h*100).toLocaleString('pt-BR')} × {(selected.d*100).toLocaleString('pt-BR')} cm <span>(L × A × P)</span></p><p>Modelo proporcional · medidas {selected.w!==selected.product.dimensions.w||selected.h!==selected.product.dimensions.h||selected.d!==selected.product.dimensions.d?'alteradas no projeto':selected.product.measurementSource==='page'?'da página':selected.product.measurementSource==='manual'?'preenchidas':'revisadas'}</p><a href={selected.product.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>Ver produto na loja</a></div>}
            <label className="color-field"><span>Cor do material</span><input type="color" value={selected.color} aria-label="Cor do material" onChange={e=>edit({color:e.target.value})}/><span>{selected.color.toUpperCase()}</span></label>
            <div className="property-actions"><Button variant="outline" size="sm" onClick={duplicateSelected}><Copy size={14}/>Duplicar</Button><Button variant="outline" size="sm" onClick={()=>{setFocusId(null);engineRef.current?.focus(selected.id);}}><Scan size={14}/>Focar</Button><Button variant="ghost" size="icon-sm" aria-label="Excluir selecionado" onClick={removeSelected}><Trash2 size={15}/></Button></div>
          </div>:<div className="project-overview"><div className="overview-illustration"><Building2 size={30} strokeWidth={1.3}/></div><strong>{project.name}</strong><span>Seu espaço, de fora para dentro.</span><div className="project-metrics"><div><b>{project.floors.length.toString().padStart(2,'0')}</b><span>Andares</span></div><div><b>{totalArea.toLocaleString('pt-BR',{maximumFractionDigits:0})}</b><span>m² de piso</span></div><div><b>{project.entities.length}</b><span>Elementos</span></div></div></div>}
          <div className="floors-section"><div className="section-heading"><h3>Andares</h3><Button variant="ghost" size="icon-sm" aria-label="Adicionar andar vazio" title="Adicionar andar vazio" onClick={()=>addFloor()}><Plus size={16}/></Button></div><div className="floor-list">{[...project.floors].reverse().map(f=><button key={f.id} className={`floor-row ${f.id===floorId?'active':''}`} onClick={()=>changeFloor(f.id)} aria-pressed={f.id===floorId}><Layers3 size={16}/><span>{f.name}</span><small>{f.elevation.toFixed(1)} m</small>{f.id===floorId&&<Check size={14}/>}</button>)}</div><Button variant="outline" size="sm" className="add-penthouse" disabled={project.floors.length>=20} onClick={()=>setDialog('penthouse')}><Building2 size={15}/>Adicionar cobertura</Button><Button variant="ghost" size="sm" className="duplicate-floor" onClick={()=>addFloor(true)}><Copy size={13}/>Duplicar andar ativo</Button></div>
          <div className="rooms-section"><div className="section-heading"><h3>Espaços</h3><span>{visibleRooms.length}</span></div>{apartments.length>0&&<Select value={roomFilter} onValueChange={setRoomFilter}><SelectTrigger className="apartment-select" aria-label="Filtrar por apartamento"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos os apartamentos</SelectItem>{apartments.map(a=><SelectItem value={a} key={a}>{a}</SelectItem>)}</SelectContent></Select>}
            {visibleRooms.length?<div className="room-list">{visibleRooms.map(room=><button key={room.id} onClick={()=>chooseRoom(room)} className={`room-row ${selectedId===room.id?'active':''}`}><span className="room-color" style={{background:room.color}}/><div><strong>{room.name}</strong><span>{room.apartment||'Área comum'} · {(room.w*room.d).toFixed(1)} m²</span></div><Scan size={13}/></button>)}</div>:<p className="empty-rooms">Crie um cômodo na biblioteca para começar este andar.</p>}
          </div>
        </div>
        <div className="inspector-footer"><Ruler size={14}/><span>1 unidade = 1 metro</span></div>
      </aside>
    </div>

    <Dialog open={realUnavailable} onOpenChange={setRealUnavailable}><DialogContent><DialogHeader><DialogTitle>Renderização realista indisponível</DialogTitle><DialogDescription>Este navegador abriu o editor na visualização simplificada. Texturas, sombras e reflexos do Modo Real precisam de WebGL 2.</DialogDescription></DialogHeader><p className="real-unavailable-note">Ative a aceleração de hardware nas configurações do navegador e reinicie-o. Depois, abra este projeto em uma versão atual do Chrome, Edge, Firefox ou Safari. Seu projeto continua salvo neste navegador.</p><DialogFooter><Button variant="outline" onClick={()=>setRealUnavailable(false)}>Continuar no editor</Button><Button onClick={()=>{pendingReal.current=true;setRealUnavailable(false);setViewportGeneration(n=>n+1);}}>Tentar novamente</Button></DialogFooter></DialogContent></Dialog>
    <LightingPanel open={lightingOpen} onOpenChange={setLightingOpen} project={project} floorId={floorId} onFloorChange={changeFloor} onUpdate={onLightUpdate} onInstall={installLights} onAll={onAllLights}/>
    {locationOpen&&<LocationDialog project={project} onClose={()=>setLocationOpen(false)} onApply={location=>{if(commit({...projectRef.current,location})){setLocationOpen(false);toast.success(location.enabled?'Projeto posicionado. Carregando o entorno gratuito…':'Localização salva com o entorno oculto.');}}} onRemove={()=>{if(commit({...projectRef.current,location:undefined}))setLocationOpen(false);}}/>}
    <ProductImporter open={productOpen} onOpenChange={setProductOpen} onReady={item=>{setRepositionId(null);setPlacementHint(null);setPlacement(item);setPlacing(item.kind);setTool('place');setDrawStart(null);setSelectedId(null);setRotation(0);if(view==='walk'){setView('3d');setRealMode(false);}toast.info(WALL_MOUNT_KINDS.includes(item.kind)?'Clique na parede para encaixar o produto nas medidas revisadas.':'Clique no piso ou no tampo de um móvel para posicionar o produto nas medidas revisadas.');}}/>
    <Dialog open={dialog!==null} onOpenChange={open=>{if(!open)setDialog(null);}}><DialogContent className="studio-dialog"><DialogHeader><DialogTitle>{dialog==='building'?'Criar um prédio completo':dialog==='empty'?'Começar um projeto':dialog==='penthouse'?'Adicionar cobertura ao prédio':'Construir. Mobiliar. Explorar.'}</DialogTitle><DialogDescription>{dialog==='building'?'Uma base com dois apartamentos por andar, cômodos mobiliados, portas, janelas, escadas e cobertura.':dialog==='penthouse'?'Acrescenta um novo pavimento no topo, com terraço, guarda-corpo, pergolado e acesso por escada. O telhado do último andar será substituído.':dialog==='empty'?'Escolha a base. Ela substitui o projeto aberto; a ação pode ser desfeita.':'Use a biblioteca para desenhar espaços e colocar elementos. Todas as medidas estão em metros.'}</DialogDescription></DialogHeader>
      {dialog==='penthouse'&&<div className="penthouse-options"><label>Tipo de cobertura<Select value={penthouseStyle} onValueChange={value=>setPenthouseStyle(value as 'apartment'|'terrace')}><SelectTrigger aria-label="Tipo de cobertura"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="apartment">Apartamento com terraço</SelectItem><SelectItem value="terrace">Terraço livre</SelectItem></SelectContent></Select></label><p>Usa os limites das paredes e cômodos do último andar. Você poderá mover, pintar e redimensionar todos os elementos depois.</p></div>}
      {dialog==='empty'&&<div className="project-template-list" role="group" aria-label="Tipo de projeto">{[{id:'house',label:'Casa com quintal',hint:'Casa mobiliada, jardim, pátio e piscina',Icon:House},{id:'building',label:'Prédio',hint:'Apartamentos mobiliados em vários andares',Icon:Building2},{id:'terrain',label:'Terreno',hint:'Lote de 24 × 30 m para começar do zero',Icon:MapIcon},{id:'blank',label:'Projeto em branco',hint:'Um andar vazio para desenhar livremente',Icon:Square}].map(({id,label,hint,Icon})=><button key={id} aria-pressed={projectTemplate===id} className={projectTemplate===id?'active':''} onClick={()=>setProjectTemplate(id)}><Icon size={23}/><div><strong>{label}</strong><span>{hint}</span></div>{projectTemplate===id&&<Check size={17}/>}</button>)}</div>}
      {(dialog==='building'||dialog==='empty'&&projectTemplate==='building')&&<><NumberField label="Andares" value={buildingFloors} min={1} max={8} step={1} onChange={n=>setBuildingFloors(Math.round(n))}/><p className="dialog-note">Substitui o projeto aberto. A ação pode ser desfeita.</p></>}
      {dialog==='help'&&<div className="help-content"><p><b>Paredes, cômodos e telhados</b><span>Selecione na biblioteca e clique em dois pontos do piso.</span></p><p><b>Portas e janelas</b><span>Selecione na biblioteca e clique sobre uma parede.</span></p><p><b>Área externa</b><span>Desenhe terrenos, gramados, pátios e piscinas entre dois cantos. Cercas usam dois pontos. Deixe uma abertura para o portão; ele fica aberto para caminhar.</span></p><p><b>Produto por link</b><span>Cole o link da loja, revise largura, altura e profundidade em centímetros e clique no piso para posicionar. O modelo mantém a escala e o link de origem.</span></p><p><b>Mover elementos</b><span>No modo Selecionar, segure sobre um elemento por um instante e depois arraste. Arrastar diretamente navega. O botão Mover (M) permite arrastar sem esperar; V volta à seleção. Solte para colocar ou pressione Esc para cancelar. Portas e janelas deslizam pela parede.</span></p><p><b>Girar elementos</b><span>Selecione um elemento e arraste a alça circular. Com Encaixe ativo, o ângulo avança de 15° em 15°; segure Shift para girar livremente. Digite um ângulo exato em Rotação, ou use Girar (R) para 90°. Com a alça focada, as setas ajustam 15° (Shift: 1°). Esc cancela e Ctrl+Z desfaz. Portas e janelas giram junto com a parede.</span></p><p><b>Encaixe automático</b><span>Ar-condicionado, armário aéreo, coifa e painel encaixam na face da parede. Plafons usam a altura real do teto. Clique no tampo de um móvel para apoiar plantas de mesa, suculentas, flores e outros objetos. A prévia verde e a indicação de base mostram a sugestão antes de colocar. Objetos apoiados acompanham seu suporte ao mover ou girar. Reposicionar com encaixe troca o apoio. O telhado ajusta limites e base às paredes desenhadas. No corte, a parte alta das paredes fica transparente para manter a referência de altura.</span></p><p><b>Cobertura e marcenaria</b><span>Use Adicionar cobertura no painel de andares para criar um apartamento com terraço ou um terraço livre. Laje plana, pergolado e guarda-corpo também estão em Construir. A aba Marcenaria contém balcões, aéreos, gaveteiros, estantes, guarda-roupas, painéis e bancadas. Elevação ajusta a altura de instalação.</span></p><p><b>Luzes e interruptores</b><span>Abra Luzes para ligar ou desligar cada cômodo, ajustar intensidade e cor, ou instalar plafons e interruptores. No catálogo, clique na face livre da parede para encaixar o Interruptor. A prévia verde mostra onde ficará. Mover na parede aproxima a câmera; arraste para deslizar e mudar a altura. Deslocamento na parede e Elevação permitem ajustes exatos; Trocar face da parede muda o lado. Plafon é colocado no teto. Vincule o cômodo em Propriedades. Caminhando, clique no interruptor a até 2,5 m ou mire nele e pressione E. Arrastar continua girando a câmera.</span></p><p><b>Modo real</b><span>Real abre a caminhada com madeira, pedra, tecido e pintura texturizados, sombras e reflexos. Alta acrescenta sombras de contato e reflexos do ambiente; Leve reduz o custo gráfico. Alterne Dia/Noite e ajuste Exposição. Editar retorna ao projeto. O Modo Real exige WebGL e aceleração gráfica; o editor e Caminhar continuam disponíveis sem eles. Acabamentos e cores continuam editáveis; as medidas são preservadas.</span></p><p><b>Caminhar</b><span>WASD movimenta, Shift corre. Segure o botão esquerdo e arraste para olhar, ou use as setas. Ajuste a sensibilidade no canto inferior direito. As escadas conectam andares; use “Ir para” para acesso direto.</span></p><div className="shortcut-grid"><span><kbd>R</kbd>Girar 90°</span><span><kbd>Del</kbd>Excluir</span><span><kbd>Ctrl Z</kbd>Desfazer</span><span><kbd>Esc</kbd>Cancelar / parar de olhar</span></div><p className="local-storage-note">O salvamento é local, neste navegador. Exporte um arquivo para guardar uma cópia ou abrir em outro dispositivo.</p></div>}
      <DialogFooter><Button variant="outline" onClick={()=>setDialog(null)}>{dialog==='help'?'Entendi':'Cancelar'}</Button>{dialog==='penthouse'&&<Button onClick={()=>{try{const next=addPenthouse(projectRef.current,penthouseStyle);if(commit(installRoomLighting(next.project,next.floorId))){changeFloor(next.floorId);changeView('3d');setSelectedId(null);setDialog(null);toast.success('Cobertura adicionada. Use Modo real para explorar.');}}catch(error){toast.error((error as Error).message);}}}><Building2 size={16}/>Adicionar cobertura</Button>}{dialog==='building'&&<Button onClick={()=>{replace(installRoomLighting(createBuilding(buildingFloors)));setDialog(null);toast.success('Prédio criado. Entre em Caminhar para explorar.');}}><Building2 size={16}/>Criar prédio</Button>}{dialog==='empty'&&<Button onClick={()=>{replace(installRoomLighting(projectTemplate==='house'?createHouse():projectTemplate==='terrain'?createTerrain():projectTemplate==='building'?createBuilding(buildingFloors):emptyProject()));setDialog(null);toast.success('Projeto criado.');}}>Criar projeto</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </main>;
}
