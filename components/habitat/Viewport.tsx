'use client';
import { useEffect, useRef, useState } from 'react';
import type { HabitatEngine, EngineCallbacks, EngineState } from '@/lib/habitat/engine';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Viewport({state,callbacks,onEngine}:{state:EngineState;callbacks:EngineCallbacks;onEngine:(engine:HabitatEngine|null)=>void}){
  const container=useRef<HTMLDivElement>(null),engine=useRef<HabitatEngine|null>(null);
  const latest=useRef({state,callbacks,onEngine});
  useEffect(()=>{latest.current={state,callbacks,onEngine};},[state,callbacks,onEngine]);
  const [error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    import('@/lib/habitat/engine').then(({HabitatEngine})=>{
      if(cancelled||!container.current)return;
      try{
        const instance=new HabitatEngine(container.current,{
          onPick:p=>latest.current.callbacks.onPick(p),onHover:p=>latest.current.callbacks.onHover(p),
          onLook:v=>latest.current.callbacks.onLook(v),onError:m=>latest.current.callbacks.onError(m),onPosition:p=>latest.current.callbacks.onPosition(p),
        });
        engine.current=instance;instance.update(latest.current.state);latest.current.onEngine(instance);setReady(true);
      }catch{setError('Não foi possível iniciar o 3D. Ative a aceleração de hardware do navegador e tente novamente.');}
    }).catch(()=>setError('Não foi possível carregar o editor. Recarregue a página.'));
    return()=>{cancelled=true;engine.current?.dispose();engine.current=null;latest.current.onEngine(null);};
  },[]);
  useEffect(()=>{engine.current?.update(state);},[state]);
  return <div className="canvas-host" ref={container} data-testid="viewport">
    {!ready&&!error&&<div className="canvas-loading"><LoaderCircle className="spin" size={26}/><span>Preparando seu espaço…</span></div>}
    {error&&<div className="canvas-error" role="alert"><AlertTriangle size={28}/><p>{error}</p><Button onClick={()=>location.reload()}>Tentar novamente</Button></div>}
  </div>;
}
