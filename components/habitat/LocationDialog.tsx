'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Minus, LocateFixed, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocationSchema, localToGeo, parseCoordinates, tilePoint, tileToGeo, type GeoPoint, type ProjectLocation } from '@/lib/habitat/geography';
import type { Project } from '@/lib/habitat/domain';

function PointMap({location,onPoint}:{location:ProjectLocation;onPoint:(point:GeoPoint)=>void}){
  const [center,setCenter]=useState<GeoPoint>({lat:location.latitude,lon:location.longitude}),[zoom,setZoom]=useState(17),[width,setWidth]=useState(520),[failed,setFailed]=useState(false),[offset,setOffset]=useState({x:0,y:0});
  const container=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number}|null>(null);
  useEffect(()=>{setCenter({lat:location.latitude,lon:location.longitude});},[location.latitude,location.longitude]);
  useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(()=>setWidth(node.clientWidth));observer.observe(node);return()=>observer.disconnect();},[]);
  const size=256,height=240,point=tilePoint(center,zoom),left=point.x*size-width/2,top=point.y*size-height/2,n=2**zoom;
  const tiles=[];for(let y=Math.floor(top/size);y*size<top+height;y++)for(let x=Math.floor(left/size);x*size<left+width;x++)if(y>=0&&y<n)tiles.push({x,y});
  const pin=tilePoint({lat:location.latitude,lon:location.longitude},zoom),polygon=[{x:-location.lotWidth/2,z:-location.lotDepth/2},{x:location.lotWidth/2,z:-location.lotDepth/2},{x:location.lotWidth/2,z:location.lotDepth/2},{x:-location.lotWidth/2,z:location.lotDepth/2}].map(p=>{const t=tilePoint(localToGeo(p,location),zoom);return`${t.x*size-left},${t.y*size-top}`;}).join(' ');
  const pan=(x:number,y:number)=>{setCenter(tileToGeo(point.x+x,Math.max(.2,Math.min(n-.2,point.y+y)),zoom));};
  const controls=(event:React.PointerEvent)=>event.stopPropagation();
  return <div className="location-map" ref={container} role="region" aria-label="Mapa: clique para posicionar o projeto; arraste para navegar" tabIndex={0} onKeyDown={event=>{const directions:Record<string,[number,number]>={ArrowUp:[0,-.5],ArrowDown:[0,.5],ArrowLeft:[-.5,0],ArrowRight:[.5,0]};if(directions[event.key]){event.preventDefault();pan(...directions[event.key]);}if(event.key==='Enter'){event.preventDefault();onPoint(center);}}}
    onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(drag.current?.id===event.pointerId)setOffset({x:event.clientX-drag.current.x,y:event.clientY-drag.current.y});}}
    onPointerCancel={()=>{drag.current=null;setOffset({x:0,y:0});}}
    onPointerUp={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;drag.current=null;setOffset({x:0,y:0});const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>5){pan(-dx/size,-dy/size);}else{const bounds=event.currentTarget.getBoundingClientRect(),p=tileToGeo((left+event.clientX-bounds.left)/size,(top+event.clientY-bounds.top)/size,zoom);onPoint({lat:Math.max(-80,Math.min(80,p.lat)),lon:p.lon});}}}>
    <div className="location-map-content" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} aria-hidden="true">
      {tiles.map(t=><img key={`${zoom}/${t.x}/${t.y}`} src={`https://tile.openstreetmap.org/${zoom}/${((t.x%n)+n)%n}/${t.y}.png`} alt="" draggable={false} referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(true)} style={{left:t.x*size-left,top:t.y*size-top}}/>)}
      <svg width={width} height={height}><polygon points={polygon} fill="#3b8f6433" stroke="#236141" strokeWidth="2"/></svg>
      <div className="location-pin" style={{left:pin.x*size-left,top:pin.y*size-top}}><MapPin size={28}/></div>
    </div>
    <div className="map-zoom" onPointerDown={controls} onPointerUp={controls}><Button size="icon-sm" variant="outline" aria-label="Aproximar mapa" disabled={zoom>=19} onClick={()=>setZoom(z=>z+1)}><Plus size={16}/></Button><Button size="icon-sm" variant="outline" aria-label="Afastar mapa" disabled={zoom<=3} onClick={()=>setZoom(z=>z-1)}><Minus size={16}/></Button><Button size="icon-sm" variant="outline" aria-label="Centralizar no projeto" onClick={()=>setCenter({lat:location.latitude,lon:location.longitude})}><LocateFixed size={16}/></Button></div>
    <div className="map-pan" onPointerDown={controls} onPointerUp={controls}>{[[0,-.5,ArrowUp,'Norte'],[-.5,0,ArrowLeft,'Oeste'],[.5,0,ArrowRight,'Leste'],[0,.5,ArrowDown,'Sul']].map(([x,y,Icon,label])=>{const I=Icon as typeof ArrowUp;return <Button key={String(label)} size="icon-sm" variant="outline" aria-label={`Mover mapa para ${label}`} onClick={()=>pan(x as number,y as number)}><I size={14}/></Button>;})}</div>
    {failed&&<span className="map-fallback">Mapa indisponível. Você pode informar as coordenadas abaixo.</span>}
    <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={controls} onPointerUp={controls}>© OpenStreetMap contributors</a>
  </div>;
}

export default function LocationDialog({project,onClose,onApply,onRemove}:{project:Project;onClose:()=>void;onApply:(location:ProjectLocation)=>void;onRemove:()=>void}){
  const dimensions=project.entities.reduce((acc,e)=>{const a=e.rotation*Math.PI/180;return{w:Math.max(acc.w,2*Math.abs(e.x)+Math.abs(Math.cos(a))*e.w+Math.abs(Math.sin(a))*e.d+4),d:Math.max(acc.d,2*Math.abs(e.z)+Math.abs(Math.sin(a))*e.w+Math.abs(Math.cos(a))*e.d+4)};},{w:20,d:20});
  const [draft,setDraft]=useState<ProjectLocation>(()=>project.location??{latitude:-30.0347,longitude:-51.2177,heading:0,enabled:true,lotWidth:Math.min(200,Math.ceil(dimensions.w)),lotDepth:Math.min(200,Math.ceil(dimensions.d)),baseOffset:0,radius:250});
  const [latitude,setLatitude]=useState(String(draft.latitude)),[longitude,setLongitude]=useState(String(draft.longitude)),[raw,setRaw]=useState(''),[error,setError]=useState('');
  const choose=(p:GeoPoint)=>{setDraft(v=>({...v,latitude:p.lat,longitude:p.lon}));setLatitude(p.lat.toFixed(6));setLongitude(p.lon.toFixed(6));setError('');};
  const coordinates=()=>{if(!latitude.trim()||!longitude.trim())return null;const p={lat:Number(latitude.replace(',','.')),lon:Number(longitude.replace(',','.'))};return Number.isFinite(p.lat)&&Math.abs(p.lat)<=80&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180?p:null;};
  const apply=()=>{const p=coordinates(),parsed=LocationSchema.safeParse({...draft,latitude:p?.lat,longitude:p?.lon});if(!parsed.success){setError('Confira as coordenadas e as medidas do lote.');return;}onApply(parsed.data);};
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="location-dialog"><DialogHeader><DialogTitle><MapPin size={21}/>Construir em um local real</DialogTitle><DialogDescription>Clique no mapa para escolher o centro do seu projeto. Arraste para navegar. Gratuito, sem chave de API.</DialogDescription></DialogHeader>
    <div className="location-dialog-scroll">
      {!project.location&&<p className="location-example">Ponto inicial de exemplo: Porto Alegre. Escolha o seu terreno antes de aplicar.</p>}
      <PointMap location={draft} onPoint={choose}/>
      <label className="location-link">Coordenadas ou link do mapa<Input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="-30.0347, -51.2177 ou link com coordenadas" maxLength={4096}/></label>
      <Button variant="outline" size="sm" onClick={()=>{const p=parseCoordinates(raw);if(p)choose(p);else setError('Use latitude, longitude ou um link completo com coordenadas. Para links curtos, abra o mapa e copie as coordenadas do ponto.');}}>Usar localização do link</Button>
      <div className="location-fields"><label>Latitude<Input aria-label="Latitude" inputMode="decimal" value={latitude} onChange={e=>setLatitude(e.target.value)} onBlur={()=>{const p=coordinates();if(p)choose(p);}}/></label><label>Longitude<Input aria-label="Longitude" inputMode="decimal" value={longitude} onChange={e=>setLongitude(e.target.value)} onBlur={()=>{const p=coordinates();if(p)choose(p);}}/></label></div>
      <div className="location-fields">{([{key:'lotWidth',label:'Largura do lote (m)',min:5,max:200,step:1},{key:'lotDepth',label:'Profundidade do lote (m)',min:5,max:200,step:1},{key:'heading',label:'Orientação a partir do norte (°)',min:0,max:360,step:1},{key:'baseOffset',label:'Base acima do terreno (m)',min:-10,max:10,step:.25}] as const).map(field=><label key={field.key}>{field.label}<Input type="number" value={draft[field.key]} min={field.min} max={field.max} step={field.step} onChange={e=>setDraft(v=>({...v,[field.key]:Number(e.target.value)}))}/></label>)}</div>
      <label className="location-toggle"><span>Mostrar entorno no editor e na caminhada</span><Switch checked={draft.enabled} onCheckedChange={enabled=>setDraft(v=>({...v,enabled}))}/></label>
      <p className="location-note">O centro do desenho corresponde ao pino. O lote fica nivelado para apoiar a construção; prédios mapeados que cruzam o lote ficam ocultos na simulação. Ruas e vizinhos cobrem cerca de 250 m em cada direção.</p>
      <p className="location-note">O entorno usa volumes simplificados, com alturas estimadas quando não há medidas. O relevo é aproximado e não substitui um levantamento do terreno. As coordenadas escolhidas são enviadas aos serviços de mapas para carregar a área.</p>
      {error&&<p className="location-error" role="alert">{error}</p>}
    </div>
    <DialogFooter>{project.location&&<Button variant="ghost" onClick={onRemove}>Remover localização</Button>}<Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={apply}>Aplicar ao projeto</Button></DialogFooter>
  </DialogContent></Dialog>;
}
