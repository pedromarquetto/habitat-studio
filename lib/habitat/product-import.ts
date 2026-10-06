import type { Kind } from './domain';

export type DimensionKey = 'width' | 'height' | 'depth';
export interface ProductDraft {
  url:string; name:string; kind:Kind; imageUrl?:string; brand?:string; model?:string;
  dimensions:Record<DimensionKey,number|null>; evidence:Partial<Record<DimensionKey,string>>; warnings:string[];
}
type JsonObject=Record<string,unknown>;
const keys:DimensionKey[]=['width','height','depth'];
const labels={width:'Largura',height:'Altura',depth:'Profundidade'};
const units:Record<string,number>={cm:1,cmt:1,centimetro:1,centimetros:1,centimeter:1,centimeters:1,mm:.1,mmt:.1,milimetro:.1,millimeter:.1,m:100,mtr:100,metro:100,metros:100,meter:100,meters:100,in:2.54,inh:2.54,inch:2.54,inches:2.54,'"':2.54,ft:30.48,fot:30.48,foot:30.48,feet:30.48};
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const decode=(v:string)=>v.replace(/&(?:amp|quot|apos|nbsp|lt|gt|times);/g,s=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&nbsp;':' ','&lt;':'<','&gt;':'>','&times;':'×'}[s]!)).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';});
const text=(html:string)=>decode(html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function attribute(tag:string,name:string){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,'i'));return match?decode(match[1]??match[2]):'';}
function metadata(html:string,key:string){for(const m of html.matchAll(/<meta\b[^>]*>/gi))if((attribute(m[0],'property')||attribute(m[0],'name')).toLowerCase()===key)return attribute(m[0],'content');return '';}
function object(v:unknown):JsonObject|null{return v!==null&&typeof v==='object'&&!Array.isArray(v)?v as JsonObject:null;}
function clean(v:unknown){return typeof v==='string'?text(v).slice(0,120):'';}
export function publicProductUrl(value:string):URL {
  let u:URL;try{u=new URL(value);}catch{throw new Error('Cole um link completo da página do produto.');}
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||value.length>2048||!host.includes('.')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||/(^|\.)(localhost|local|internal|lan|test|invalid|example|onion|home|arpa)$/.test(host))throw new Error('Use o link de uma página pública de produto, em HTTP ou HTTPS.');
  u.hostname=host;u.hash='';return u;
}
function imageUrl(value:unknown,base:string):string|undefined {
  if(Array.isArray(value))value=value[0];if(object(value))value=object(value)!.url??object(value)!.contentUrl;
  if(typeof value!=='string'||value.length>2048)return;try{return publicProductUrl(new URL(decode(value),base).href).href;}catch{return;}
}
export function parseMeasurement(value:unknown,unitHint=''):number|null {
  const node=object(value);if(node)return parseMeasurement(node.value,String(node.unitCode??node.unitText??unitHint));
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const raw=normalize(String(value)).trim();
  const m=raw.match(/^(\d+(?:[.,]\d+)?)\s*([a-z"]*)$/);if(!m)return null;
  const unit=normalize(m[2]||unitHint).replace(/^.*\//,'').trim();const factor=units[unit];
  if(!factor)return null;const n=Number(m[1].replace(',','.'))*factor;
  return Number.isFinite(n)&&n>=5&&n<=10000?Math.round(n*1000)/1000:null;
}
function dimensionName(label:string):DimensionKey|null {
  const s=normalize(label);if(/(?:com\s+embalagem|packag|shipping|nicho|intern[ao]|door\s+open|porta\s+aberta)/.test(s))return null;
  if(/\b(largura|width|ancho)\b/.test(s))return 'width';if(/\b(altura|height|alto)\b/.test(s))return 'height';if(/\b(profundidade|depth|profundidad)\b/.test(s))return 'depth';return null;
}
function unitIn(v:string){return normalize(v).match(/\b(cm|mm|m|in|inch|inches|ft|centimetros?|metros?)\b/)?.[1]??'';}
export function productKind(name:string):Kind {
  const n=normalize(name);for(const [pattern,kind] of [[/micro.?ondas|microwave/,'microwave'],[/lava.?loucas|dishwasher/,'dishwasher'],[/lavadora|washing machine|lava e seca/,'washingMachine'],[/secadora|dryer/,'dryer'],[/cooktop|induction hob/,'cooktop'],[/coifa|range hood/,'hood'],[/ar.?condicionado|air conditioner/,'airConditioner'],[/\bforno\b|\boven\b/,'oven'],[/armario aereo|wall cabinet/,'wallCabinet'],[/balcao|base cabinet/,'baseCabinet'],[/gaveteiro|drawer unit/,'drawerUnit'],[/estante|bookshelf/,'bookshelf'],[/painel ripado|slat panel/,'closetPanel'],[/bancada|countertop/,'countertop'],[/guarda.?roupa|wardrobe/,'wardrobe'],[/geladeira|refrigerador|refrigerator|fridge|freezer/,'fridge'],[/fogao|stove|range cooker/,'stove'],[/sofa|couch/,'sofa'],[/poltrona|armchair/,'armchair'],[/\bcama\b|\bbed\b/,'bed'],[/armario|cabinet/,'cabinet'],[/\bmesa\b|\btable\b/,'table'],[/cadeira|chair/,'chair'],[/\bpia\b|\bsink\b/,'sink'],[/vaso sanitario|toilet/,'toilet'],[/luminaria|lamp/,'lamp']] as const)if(pattern.test(n))return kind;return 'object';
}

/** Extract only explicit product measurements. Missing units/order remain unset. */
export function parseProductPage(html:string,url:string):ProductDraft {
  const draft:ProductDraft={url,name:'',kind:'object',dimensions:{width:null,height:null,depth:null},evidence:{},warnings:[]};
  const set=(key:DimensionKey,value:unknown,unit:string,description:string)=>{const cm=parseMeasurement(value,unit);if(cm!==null&&draft.dimensions[key]===null&&!(key==='height'&&cm>3000)){draft.dimensions[key]=cm;draft.evidence[key]=`${description}: ${cm} cm`.slice(0,250);}};
  const products:JsonObject[]=[];const storefront:JsonObject[]=[];
  const visit=(v:unknown,callback:(v:JsonObject)=>void,depth=0)=>{if(depth>25)return;if(Array.isArray(v)){for(const i of v)visit(i,callback,depth+1);}else if(object(v)){callback(v as JsonObject);for(const i of Object.values(v as JsonObject))visit(i,callback,depth+1);}};
  for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const type=attribute(s[1],'type');const id=attribute(s[1],'id');if(type!=='application/ld+json'&&id!=='__NEXT_DATA__')continue;
    try{
      const data=JSON.parse(s[2]);
      if(id==='__NEXT_DATA__'){
        const root=object(data),props=object(object(root?.props)?.pageProps),payload=object(props?.data);
        const primary=object(payload?.product??props?.product??root?.product)??(Array.isArray(root?.specifications)?root:null);
        if(primary)visit(primary,v=>{if(typeof v.name==='string'&&(Array.isArray(v.values)||v.value!==undefined))storefront.push(v);});
      }else visit(data,v=>{const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];if(types.some(t=>t==='Product'||t==='ProductModel'||t==='IndividualProduct'))products.push(v);});
    }catch{/* Malformed optional structured data falls back to visible specifications. */}
  }
  const match=products.find(p=>typeof p.url==='string'&&p.url.split('?')[0]===url.split('?')[0])??products[0];
  const prop=(label:string,value:unknown,unit='')=>{const key=dimensionName(label);if(key)set(key,value,unit||unitIn(label),label);};
  if(match){
    draft.name=clean(match.name);draft.imageUrl=imageUrl(match.image,url);draft.brand=clean(object(match.brand)?.name??match.brand)||undefined;draft.model=clean(match.model??match.mpn??match.sku)||undefined;
    for(const key of keys)set(key,match[key],'',`${labels[key]} informada pela loja`);
    const extra=Array.isArray(match.additionalProperty)?match.additionalProperty:[match.additionalProperty];for(const v of extra){const p=object(v);if(p)prop(clean(p.name),p.value,String(p.unitCode??p.unitText??''));}
  }
  // VTEX/Next stores explicitly labelled, unpackaged specification values here.
  for(const p of storefront)prop(String(p.name),Array.isArray(p.values)?p.values[0]:p.value,String(p.unitCode??p.unitText??''));
  draft.name=(draft.name||metadata(html,'og:title')||text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'')||text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'')||'Produto importado').slice(0,120);
  draft.imageUrl??=imageUrl(metadata(html,'og:image'),url);draft.kind=productKind(draft.name);
  const visible=text(html);
  for(const key of keys){
    const label=key==='width'?'largura|width':key==='height'?'altura|height':'profundidade|depth';
    const pattern=new RegExp(`\\b(${label})(?:\\s+(?:do\\s+produto|sem\\s+embalagem))?\\s*(?:\\((cm|mm|m|in|ft)\\))?\\s*[:|]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(cm|mm|m|inches|inch|in|ft)?(?=[\\s;,.)]|$)`,'gi');
    for(const m of visible.matchAll(pattern)){const before=normalize(visible.slice(Math.max(0,m.index!-100),m.index));if(/(?:com embalagem|packaging|shipping)(?![\s\S]*(?:sem embalagem|do produto))/.test(before))continue;set(key,m[3],m[4]||m[2]||'',m[0]);}
  }
  // Combined dimensions require a declared order (A×L×P, W×H×D, etc.).
  const combo=visible.match(/(?:dimens[oõ]es|dimensions|medidas)[^.;]{0,45}?\(?\b([ALPHWD])\s*[x×]\s*([ALPHWD])\s*[x×]\s*([ALPHWD])\b\)?\s*[:|\-]?\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m|in|ft)\b/i);
  if(combo&&!/com embalagem|packaging|shipping|nicho/.test(normalize(combo[0]))){const axis:Record<string,DimensionKey>={A:'height',H:'height',L:'width',W:'width',P:'depth',D:'depth'};if(new Set(combo.slice(1,4).map(v=>axis[v.toUpperCase()])).size===3)for(let i=0;i<3;i++)set(axis[combo[i+1].toUpperCase()],combo[i+4],combo[7],combo[0]);}
  if(keys.some(key=>draft.dimensions[key]===null))draft.warnings.push('Complete as medidas que a página não informou. Use as dimensões do produto sem embalagem.');
  draft.warnings.push('Confira as medidas antes de inserir. A forma 3D é uma representação proporcional do tipo de produto.');return draft;
}
export function parseProductText(specifications:string,url:string,name='Produto'){
  const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return parseProductPage(`<h1>${escape(name)}</h1><p>${escape(specifications.slice(0,20000))}</p>`,url);
}
