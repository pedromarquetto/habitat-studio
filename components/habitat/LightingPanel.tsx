'use client';
import { Lightbulb, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { lightSettings, isLitRoom } from '@/lib/habitat/lighting';
import type { Entity, Project } from '@/lib/habitat/domain';

export function LightControls({item,onChange}:{item:Entity;onChange:(light:NonNullable<Entity['light']>)=>void}){
  const light=lightSettings(item);
  return <div className="light-settings">
    <label className="light-power"><span><Lightbulb size={16}/>{light.on?'Ligada':'Desligada'}</span><Switch checked={light.on} onCheckedChange={on=>onChange({...light,on})} aria-label={`Luz de ${item.name}`}/></label>
    <label className="light-intensity"><span>Intensidade <output>{Math.round(light.intensity*100)}%</output></span><input type="range" min="0" max="200" step="5" value={Math.round(light.intensity*100)} aria-label={`Intensidade de ${item.name}`} onChange={e=>onChange({...light,intensity:Number(e.target.value)/100})}/></label>
    <label className="light-color"><span>Cor da luz</span><input type="color" value={light.color} aria-label={`Cor da luz de ${item.name}`} onChange={e=>onChange({...light,color:e.target.value})}/></label>
  </div>;
}
export default function LightingPanel({open,onOpenChange,project,floorId,onFloorChange,onUpdate,onInstall,onAll}:{open:boolean;onOpenChange:(open:boolean)=>void;project:Project;floorId:string;onFloorChange:(id:string)=>void;onUpdate:(id:string,light:NonNullable<Entity['light']>)=>void;onInstall:()=>void;onAll:(on:boolean)=>void}){
  const rooms=project.entities.filter(e=>e.floorId===floorId&&isLitRoom(e));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="lighting-dialog"><DialogHeader><DialogTitle><Lightbulb size={20}/>Iluminação</DialogTitle><DialogDescription>Controle as luzes de cada cômodo. No Modo Real, veja o efeito de dia ou à noite.</DialogDescription></DialogHeader>
    <Select value={floorId} onValueChange={onFloorChange}><SelectTrigger aria-label="Andar da iluminação"><SelectValue/></SelectTrigger><SelectContent>{project.floors.map(f=><SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
    <div className="light-actions"><Button variant="outline" size="sm" disabled={!rooms.length} onClick={()=>onAll(true)}>Ligar todas</Button><Button variant="outline" size="sm" disabled={!rooms.length} onClick={()=>onAll(false)}>Desligar todas</Button></div>
    <div className="light-room-list">{rooms.map(room=><section className="light-room" key={room.id}><div className="light-room-title"><strong>{room.name}</strong><span>{room.apartment||'Área comum'}</span></div><LightControls item={room} onChange={light=>onUpdate(room.id,light)}/><small>{project.entities.filter(e=>e.kind==='lightSwitch'&&e.roomId===room.id).length} interruptor(es)</small></section>)}{!rooms.length&&<p>Crie um cômodo para configurar a iluminação.</p>}</div>
    <Button disabled={!rooms.length} onClick={onInstall}><SlidersHorizontal size={16}/>Instalar luzes e interruptores</Button><p className="property-note">Adiciona um plafon e um interruptor em cada cômodo deste andar. Interruptores precisam de uma parede. Você pode mover e configurar os itens depois.</p>
  </DialogContent></Dialog>;
}
