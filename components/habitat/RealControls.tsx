'use client';
import { Sun, Moon, Pencil, SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { RealQuality, RealPerformanceStatus } from '@/lib/habitat/real-performance';
import type { MaterialStatus } from '@/lib/habitat/real-materials';

export default function RealControls({lighting,onLighting,quality,onQuality,exposure,onExposure,status,performance,onEdit}:{lighting:'day'|'night';onLighting:(value:'day'|'night')=>void;quality:RealQuality;onQuality:(value:RealQuality)=>void;exposure:number;onExposure:(value:number)=>void;status:MaterialStatus;performance:RealPerformanceStatus;onEdit:()=>void}){
  return <details className="real-controls">
    <summary><SlidersHorizontal size={16}/><span>Aparência do modo real</span><ChevronDown size={15}/></summary>
    <div className="real-settings-body" role="group" aria-label="Aparência do modo real">
    <button aria-pressed={lighting==='day'} onClick={()=>onLighting('day')}><Sun size={16}/>Dia</button>
    <button aria-pressed={lighting==='night'} onClick={()=>onLighting('night')}><Moon size={16}/>Noite</button>
    <button onClick={onEdit}><Pencil size={15}/>Editar</button>
    <label className="real-quality">Qualidade<select aria-label="Qualidade do modo real" value={quality} onChange={e=>onQuality(e.target.value as RealQuality)}><option value="auto">Automática</option><option value="performance">Máxima fluidez</option><option value="balanced">Leve</option><option value="high">Alta</option></select></label>
    <p className="real-performance-note">{quality==='auto'?`A nitidez se ajusta durante a caminhada: ${Math.round(performance.scale*100)}%.`:quality==='high'?'Efeitos adicionais e reflexos locais. Exige mais da placa de vídeo.':quality==='performance'?'Prioriza a fluidez com texturas e sombras mais leves.':'Texturas e sombras com menos efeitos.'}{performance.fps!==null&&<span>Última medição: {performance.fps} FPS</span>}</p>
    <label className="real-exposure" htmlFor="real-exposure"><span>Exposição<output>{exposure.toFixed(2)}×</output></span><input id="real-exposure" aria-label="Exposição do modo real" type="range" min={.6} max={1.6} step={.05} value={exposure} onChange={e=>onExposure(Number(e.target.value))}/></label>
    <span role="status" aria-live="polite">{status.state==='loading'?`Carregando materiais… ${status.loaded}/${status.total}`:status.state==='partial'?'Algumas texturas não carregaram; usando materiais básicos.':'Materiais carregados'}</span>
    </div>
  </details>;
}
