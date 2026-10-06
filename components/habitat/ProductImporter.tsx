'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link2, LoaderCircle, Ruler } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CATALOG, entity, type Entity, type Kind } from '@/lib/habitat/domain';
import { parseProductText, publicProductUrl, type DimensionKey, type ProductDraft } from '@/lib/habitat/product-import';
const ProductPreview=lazy(()=>import('./ProductPreview'));

const fields:[DimensionKey,string][]=[['width','Largura'],['height','Altura'],['depth','Profundidade']];
const blank={width:'',height:'',depth:''};
export default function ProductImporter({open,onOpenChange,onReady}:{open:boolean;onOpenChange:(open:boolean)=>void;onReady:(item:Partial<Entity>&{kind:Kind})=>void}){
  const [url,setUrl]=useState(''),[draft,setDraft]=useState<ProductDraft|null>(null),[name,setName]=useState(''),[kind,setKind]=useState<Kind>('fridge');
  const [dims,setDims]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState('');const request=useRef<AbortController|null>(null);
  const [specifications,setSpecifications]=useState(''),[fromText,setFromText]=useState(false);
  useEffect(()=>()=>request.current?.abort(),[]);
  const values={width:Number(dims.width.replace(',','.')),height:Number(dims.height.replace(',','.')),depth:Number(dims.depth.replace(',','.'))};
  const complete=fields.every(([key])=>Number.isFinite(values[key])&&values[key]>=5&&values[key]<=(key==='height'?3000:10000));
  const item=useMemo(()=>{
    if(!complete||!draft)return null;
    const dimensions={w:Number(dims.width.replace(',','.'))/100,h:Number(dims.height.replace(',','.'))/100,d:Number(dims.depth.replace(',','.'))/100};
    return entity(kind,'preview',0,0,{name:'Produto',...dimensions,product:{url:draft.url,dimensions,measurementSource:'manual',evidence:[]}});
  },[complete,kind,dims,draft]);
  const manual=()=>{try{const link=publicProductUrl(url.trim()).href;setDraft({url:link,name:'',kind:'fridge',dimensions:{width:null,height:null,depth:null},evidence:{},warnings:[]});setName('');setKind('fridge');setDims(blank);setError('');}catch(e){setError((e as Error).message);}};
  const analyze=async()=>{
    let link:string;try{link=publicProductUrl(url.trim()).href;}catch(e){setError((e as Error).message);return;}
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setDraft(null);setDims(blank);setName('');setFromText(false);
    try{const r=await fetch('/api/products/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:link}),signal:controller.signal});const data=await r.json() as ProductDraft & {error?:string};if(!r.ok)throw new Error(data.error||'Não foi possível ler o produto.');
      const result=data as ProductDraft;setDraft(result);setName(result.name);setKind(result.kind);setDims({width:result.dimensions.width===null?'':String(result.dimensions.width),height:result.dimensions.height===null?'':String(result.dimensions.height),depth:result.dimensions.depth===null?'':String(result.dimensions.depth)});
    }catch(e){if(controller.signal.aborted)return;setError(e instanceof Error?e.message:'Não foi possível ler o produto.');setDraft({url:link,name:'',kind:'fridge',dimensions:{width:null,height:null,depth:null},evidence:{},warnings:[]});setKind('fridge');}
    finally{if(request.current===controller){setBusy(false);request.current=null;}}
  };
  const add=()=>{if(!draft||!item||!name.trim())return;const changed=fields.some(([key])=>values[key]!==draft.dimensions[key]);const anyFound=fields.some(([key])=>draft.dimensions[key]!==null);
    onReady({kind,name:name.trim().slice(0,120),w:item.w,h:item.h,d:item.d,color:item.color,product:{url:draft.url,imageUrl:draft.imageUrl,brand:draft.brand,model:draft.model,dimensions:{w:item.w,h:item.h,d:item.d},measurementSource:!anyFound||fromText?'manual':changed?'mixed':'page',evidence:Object.values(draft.evidence).filter((v):v is string=>Boolean(v))}});onOpenChange(false);
  };
  const close=(value:boolean)=>{if(!value){request.current?.abort();request.current=null;setBusy(false);}onOpenChange(value);};
  return <Dialog open={open} onOpenChange={close}><DialogContent className="studio-dialog product-dialog"><DialogHeader><DialogTitle>Trazer um produto para o projeto</DialogTitle><DialogDescription>Cole o link da loja e confira as medidas antes de posicionar o produto em 3D.</DialogDescription></DialogHeader>
    <form className="product-url-form" onSubmit={e=>{e.preventDefault();void analyze();}}><label htmlFor="product-url">Link do produto</label><div><Input id="product-url" type="url" placeholder="https://loja.com.br/geladeira" value={url} maxLength={2048} disabled={busy} onChange={e=>{setUrl(e.target.value);setDraft(null);setDims(blank);setError('');}} required/><Button type="submit" disabled={busy||!url.trim()}>{busy?<LoaderCircle className="spin" size={16}/>:<Link2 size={16}/>}<span>{busy?'Lendo…':'Buscar medidas'}</span></Button></div></form>
    {error&&<p className="product-error" role="alert">{error}</p>}
    {busy&&<p className="product-note" role="status">Lendo o nome, a foto e as medidas informadas pela loja…</p>}
    {draft&&!busy&&<div className="product-review"><div className="product-visuals"><div className="product-preview-wrap">{item?<Suspense fallback={<div className="product-preview-empty">Preparando a prévia…</div>}><ProductPreview item={item}/></Suspense>:<div className="product-preview-empty"><Ruler size={30}/><span>Preencha as três medidas para visualizar</span></div>}<span className="preview-caption">Modelo proporcional · arraste para girar</span></div>{draft.imageUrl&&<div className="product-reference"><Image unoptimized width={74} height={85} src={draft.imageUrl} alt={`Foto de referência: ${draft.name||'produto'}`} referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/><span>Foto da loja</span></div>}</div>
      <div className="product-form"><label>Nome do produto<Input aria-label="Nome do produto importado" value={name} maxLength={120} placeholder="Ex.: Geladeira Consul CRM44MB" onChange={e=>setName(e.target.value)}/></label><label>Forma do modelo<select aria-label="Tipo do produto importado" value={kind} onChange={e=>setKind(e.target.value as Kind)}>{CATALOG.filter(c=>c.section==='appliances'||c.section==='furniture').map(c=><option value={c.kind} key={c.kind}>{c.name}</option>)}</select></label>
        <div className="product-dimensions">{fields.map(([key,label])=><label key={key}>{label}<div><Input type="number" aria-label={`${label} do produto em centímetros`} min={5} max={key==='height'?3000:10000} step="any" value={dims[key]} onChange={e=>setDims(v=>({...v,[key]:e.target.value}))}/><span>cm</span></div><small>{draft.dimensions[key]===null?'Preencher':values[key]===draft.dimensions[key]?fromText?'Extraída do texto':'Encontrada na página':'Editada por você'}</small></label>)}</div>
        <p className="product-note">Use as medidas sem embalagem. Reserve também as folgas de instalação indicadas pelo fabricante.</p>
        {Object.keys(draft.evidence).length>0&&<details className="product-evidence"><summary>Ver medidas encontradas</summary>{Object.entries(draft.evidence).map(([key,value])=><p key={key}>{value}</p>)}</details>}
        <details className="product-paste-specs"><summary>Colar medidas da ficha técnica</summary><Textarea aria-label="Medidas copiadas da loja" maxLength={20000} value={specifications} placeholder="Altura: 184,7 cm; Largura: 62,2 cm; Profundidade: 72,4 cm" onChange={e=>setSpecifications(e.target.value)}/><Button variant="outline" size="sm" disabled={!specifications.trim()} onClick={()=>{const parsed=parseProductText(specifications,draft.url,name);setDraft({...draft,dimensions:parsed.dimensions,evidence:parsed.evidence});setDims({width:parsed.dimensions.width===null?'':String(parsed.dimensions.width),height:parsed.dimensions.height===null?'':String(parsed.dimensions.height),depth:parsed.dimensions.depth===null?'':String(parsed.dimensions.depth)});setFromText(true);setError(fields.some(([key])=>parsed.dimensions[key]===null)?'Algumas medidas não foram reconhecidas. Complete os campos acima.':'');}}>Extrair do texto</Button></details>
        <a className="product-source" href={draft.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>Conferir na loja</a>
      </div></div>}
    <p className="product-note">A forma 3D representa o tipo do produto nas medidas informadas. A foto da loja fica como referência.</p>
    <DialogFooter><Button variant="outline" onClick={()=>close(false)}>Cancelar</Button>{!draft&&!busy&&<Button variant="outline" disabled={!url.trim()} onClick={manual}>Preencher manualmente</Button>}<Button disabled={!draft||!complete||!name.trim()||busy} onClick={add}>Posicionar no projeto</Button></DialogFooter>
  </DialogContent></Dialog>;
}
