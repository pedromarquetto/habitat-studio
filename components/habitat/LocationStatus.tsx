'use client';
import { MapPin, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContextStatus } from '@/lib/habitat/geography';
export default function LocationStatus({status,onEdit,onRetry,onOverview,walking}:{status:ContextStatus;onEdit:()=>void;onRetry:()=>void;onOverview:()=>void;walking:boolean}){
  return <div className="location-status" aria-label="Entorno real">
    <button className="location-status-title" onClick={onEdit}><MapPin size={16}/><strong>Local real</strong></button>
    <div role="status">{status.state==='loading'?<span><LoaderCircle size={14} className="spin"/>Carregando ruas e vizinhos…</span>:status.state==='error'?<span className="location-error">{status.message}</span>:<span>{status.buildings} prédios · {status.roads} vias</span>}</div>
    <small>{status.terrain==='loading'?'Carregando relevo…':status.terrain==='real'?`Relevo aproximado · altitude ${status.altitude??'…'} m`:'Sem relevo disponível · terreno plano'}{status.estimated>0&&` · ${status.estimated} alturas estimadas`}</small>
    {status.state==='ready'&&status.message&&<small>{status.message}</small>}
    <div className="location-status-actions">{!walking&&<Button variant="outline" size="sm" onClick={onOverview}>Ver entorno</Button>}{(status.state==='error'||status.terrain==='flat')&&<Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>}</div>
    <div className="location-credits"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://mapterhorn.com/attribution" target="_blank" rel="noreferrer">© Mapterhorn</a></div>
  </div>;
}
