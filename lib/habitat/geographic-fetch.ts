import { convertOsm, LocationSchema, localToGeo, type GeographicData } from './geography.ts';

const sources=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const cache=new Map<string,{until:number;value:GeographicData}>();
const pending=new Map<string,Promise<GeographicData>>();
export async function geographicData(input:unknown,externalSignal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<GeographicData>{
  const location=LocationSchema.parse(input);
  const key=`${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
  const saved=cache.get(key);if(saved&&saved.until>Date.now())return saved.value;
  if(!externalSignal&&pending.has(key))return pending.get(key)!;
  // One bounded neighborhood, requested by the user. No city-wide extraction.
  const north=localToGeo({x:0,z:-location.radius*1.5},{...location,heading:0}),south=localToGeo({x:0,z:location.radius*1.5},{...location,heading:0});
  const east=localToGeo({x:location.radius*1.5,z:0},{...location,heading:0}),west=localToGeo({x:-location.radius*1.5,z:0},{...location,heading:0});
  const bbox=`${south.lat},${west.lon},${north.lat},${east.lon}`;
  if(east.lon<west.lon)throw new Error('Escolha um ponto um pouco mais distante da linha de mudança de data.');
  const query=`[out:json][timeout:20][maxsize:16000000];(way[building][building!=no](${bbox});relation[building][type=multipolygon](${bbox});way[highway](${bbox});way[natural=water](${bbox});way[leisure=park](${bbox});way[landuse~"^(forest|grass|meadow|recreation_ground)$"](${bbox}););out tags geom;`;
  const work=(async()=>{
    for(const source of sources){
      try{
        if(externalSignal?.aborted)throw externalSignal.reason;
        const signal=externalSignal?AbortSignal.any([externalSignal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
        const response=await fetcher(source,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json',...(typeof window==='undefined'?{'User-Agent':'HabitatStudio/0.7 (+https://github.com/pedromarquetto/habitat-studio)'}:{})},body:new URLSearchParams({data:query}),signal,redirect:'error',referrerPolicy:'strict-origin-when-cross-origin'});
        if(!response.ok||!response.body){await response.body?.cancel();continue;}
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8_000_000){await reader.cancel();throw new Error('Área com dados demais. Escolha outro ponto.');}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        const value=convertOsm(JSON.parse(new TextDecoder().decode(bytes)));
        if(cache.size>=30)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+10*60_000,value});return value;
      }catch(error){if(externalSignal?.aborted||error instanceof Error&&error.message.startsWith('Área com'))throw error;}
    }
    throw new Error('Não foi possível carregar os dados abertos agora. Sua construção continua salva. Tente novamente.');
  })();
  pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
