'use client';
import { Check, Move, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Entity, Project } from '@/lib/habitat/domain';
import { placementDescription } from '@/lib/habitat/placement';

export default function AttachmentControls({item,project,suggestion,onApply,onReposition}:{item:Entity;project:Project;suggestion:Entity|null;onApply:()=>void;onReposition:()=>void}){
  const mounted=Boolean(item.wallMountId||item.supportId||item.ceilingRoomId||item.hostId||item.switchWallId||item.roofWallIds);
  return <div className="attachment-controls">
    <strong><Ruler size={14}/>{mounted?'Encaixe atual':'Apoio do objeto'}</strong>
    <p>{placementDescription(item,project)}</p>
    <span>Base {(item.y??0).toLocaleString('pt-BR',{maximumFractionDigits:2})} m · Topo {((item.y??0)+item.h).toLocaleString('pt-BR',{maximumFractionDigits:2})} m</span>
    {suggestion&&<><p className="attachment-suggestion">Sugestão: {placementDescription(suggestion,project)}. A prévia azul mostra a posição.</p><Button variant="outline" size="sm" onClick={onApply}><Check size={14}/>Aplicar encaixe</Button></>}
    {!item.hostId&&item.kind!=='roof'&&<Button variant="outline" size="sm" onClick={onReposition}><Move size={14}/>Reposicionar com encaixe</Button>}
  </div>;
}
