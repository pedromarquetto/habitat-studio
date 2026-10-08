import { z } from 'zod';

export const LocationSchema = z.object({
  latitude:z.number().finite().min(-80).max(80), longitude:z.number().finite().min(-180).max(180),
  heading:z.number().finite().min(0).max(360), enabled:z.boolean(),
  lotWidth:z.number().finite().min(5).max(200), lotDepth:z.number().finite().min(5).max(200),
  baseOffset:z.number().finite().min(-10).max(10), radius:z.literal(250),
});
export type ProjectLocation = z.infer<typeof LocationSchema>;
export type GeoPoint = {lat:number;lon:number};
export type Point = {x:number;z:number};
export type GeographicFeature = {id:string;kind:'building'|'road'|'water'|'green';rings:GeoPoint[][];height:number;minHeight:number;estimated:boolean;width:number};
export type GeographicData = {features:GeographicFeature[];timestamp:string;truncated:boolean};
export type ContextStatus = {state:'idle'|'loading'|'ready'|'error';buildings:number;roads:number;estimated:number;terrain:'loading'|'real'|'flat';message?:string;altitude?:number};
export const EMPTY_CONTEXT:ContextStatus={state:'idle',buildings:0,roads:0,estimated:0,terrain:'flat'};
const METRES = 6378137*Math.PI/180;
export function geoToLocal(point:GeoPoint,location:ProjectLocation):Point {
  const east=(((point.lon-location.longitude+540)%360)-180)*METRES*Math.cos(location.latitude*Math.PI/180);
  const south=(location.latitude-point.lat)*METRES,a=location.heading*Math.PI/180;
  return {x:east*Math.cos(a)+south*Math.sin(a),z:-east*Math.sin(a)+south*Math.cos(a)};
}
export function localToGeo(point:Point,location:ProjectLocation):GeoPoint {
  const a=location.heading*Math.PI/180,east=point.x*Math.cos(a)-point.z*Math.sin(a),south=point.x*Math.sin(a)+point.z*Math.cos(a);
  const lon=location.longitude+east/(METRES*Math.cos(location.latitude*Math.PI/180));
  return {lat:location.latitude-south/METRES,lon:((lon+540)%360)-180};
}
export function parseCoordinates(raw:string):GeoPoint|null {
  const value=raw.trim();if(value.length>4096)return null;
  const patterns=[/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)[,%](-?\d+(?:\.\d+)?)/,/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,/[?&]mlat=(-?\d+(?:\.\d+)?).*?[?&]mlon=(-?\d+(?:\.\d+)?)/];
  let decoded=value;try{decoded=decodeURIComponent(value);}catch{}
  for(const pattern of patterns){const m=decoded.match(pattern);if(!m)continue;const lat=Number(m[1]),lon=Number(m[2]);if(Number.isFinite(lat)&&Math.abs(lat)<=80&&Number.isFinite(lon)&&Math.abs(lon)<=180)return{lat,lon};}
  return null;
}
export function tilePoint(point:GeoPoint,zoom:number):{x:number;y:number} {
  const n=2**zoom,a=Math.max(-85,Math.min(85,point.lat))*Math.PI/180;
  return{x:(point.lon+180)/360*n,y:(1-Math.log(Math.tan(a)+1/Math.cos(a))/Math.PI)/2*n};
}
export function tileToGeo(x:number,y:number,zoom:number):GeoPoint {
  const n=2**zoom;return {lon:((x/n*360+360)%360)-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI};
}
export function pointInRing(point:Point,ring:Point[]):boolean {
  let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }return inside;
}
function crosses(a:Point,b:Point,c:Point,d:Point):boolean {
  const cross=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.z,b.z)>=Math.min(c.z,d.z)&&Math.max(c.z,d.z)>=Math.min(a.z,b.z);
}
export function intersectsLot(ring:Point[],location:ProjectLocation):boolean {
  const w=location.lotWidth/2,d=location.lotDepth/2,corners=[{x:-w,z:-d},{x:w,z:-d},{x:w,z:d},{x:-w,z:d}];
  return ring.some(p=>Math.abs(p.x)<=w&&Math.abs(p.z)<=d)||corners.some(p=>pointInRing(p,ring))||ring.some((p,i)=>corners.some((c,j)=>crosses(p,ring[(i+1)%ring.length],c,corners[(j+1)%4])));
}
export function terrariumHeight(r:number,g:number,b:number){return r*256+g+b/256-32768;}
export function buildingHeight(tags:Record<string,string>):{height:number;minHeight:number;estimated:boolean} {
  const parse=(s:string|undefined)=>s&&/^\s*\d+(?:[.,]\d+)?\s*(?:m|meters|metres)?\s*$/.test(s)?Number.parseFloat(s.replace(',','.')):NaN;
  let height=parse(tags.height),estimated=false;
  if(!Number.isFinite(height)){const levels=parse(tags['building:levels']);height=Number.isFinite(levels)?levels*3:tags.building==='garage'?3:9;estimated=true;}
  const minHeight=parse(tags.min_height);height=Math.max(2,Math.min(250,height));return{height,minHeight:Number.isFinite(minHeight)?Math.max(0,Math.min(height-.5,minHeight)):0,estimated};
}

type OsmElement={type:string;id:number;tags?:Record<string,string>;geometry?:GeoPoint[];members?:{role:string;type:string;ref:number;geometry?:GeoPoint[]}[]};
function joinRings(segments:GeoPoint[][]):GeoPoint[][] {
  const todo=segments.map(s=>[...s]),rings:GeoPoint[][]=[];const same=(a:GeoPoint,b:GeoPoint)=>a.lat===b.lat&&a.lon===b.lon;
  while(todo.length){const ring=todo.pop()!;while(ring.length>1&&!same(ring[0],ring[ring.length-1])){const i=todo.findIndex(s=>same(s[0],ring[ring.length-1])||same(s[s.length-1],ring[ring.length-1]));if(i<0)break;const next=todo.splice(i,1)[0];if(!same(next[0],ring[ring.length-1]))next.reverse();ring.push(...next.slice(1));}if(ring.length>=4&&same(ring[0],ring[ring.length-1]))rings.push(ring);}
  return rings;
}
export function convertOsm(raw:unknown):GeographicData {
  const body=raw as {elements?:OsmElement[];osm3s?:{timestamp_osm_base?:string};remark?:string};
  if(!Array.isArray(body?.elements)||body.remark)throw new Error('O serviço de mapas não concluiu a consulta. Tente novamente.');
  const features:GeographicFeature[]=[],memberWays=new Set<number>();
  for(const el of body.elements)if(el.type==='relation'&&el.tags?.building)for(const m of el.members??[])if(m.type==='way')memberWays.add(m.ref);
  for(const el of body.elements){
    if(features.length>=1200)break;const tags=el.tags??{};if(el.type==='way'&&memberWays.has(el.id))continue;
    const kind:GeographicFeature['kind']|null=tags.building&&tags.building!=='no'?'building':tags.highway?'road':tags.natural==='water'||tags.landuse==='reservoir'?'water':tags.leisure==='park'||['forest','grass','meadow','recreation_ground'].includes(tags.landuse)||tags.natural==='wood'?'green':null;
    if(!kind)continue;
    const valid=(p:GeoPoint)=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
    let rings:GeoPoint[][]=[];
    if(el.type==='relation'){
      const outer=joinRings((el.members??[]).filter(m=>m.role!=='inner'&&m.geometry&&m.geometry.length<=1500&&m.geometry.every(valid)).map(m=>m.geometry!)).filter(r=>r.length<=1500);
      const inner=joinRings((el.members??[]).filter(m=>m.role==='inner'&&m.geometry&&m.geometry.length<=1500&&m.geometry.every(valid)).map(m=>m.geometry!)).filter(r=>r.length<=1500);
      for(let i=0;i<outer.length&&features.length<1200;i++){const ring=outer[i],holes=inner.filter(h=>pointInRing({x:h[0].lon,z:h[0].lat},ring.map(p=>({x:p.lon,z:p.lat})))).slice(0,8);if(holes.reduce((n,h)=>n+h.length,ring.length)>6000)continue;features.push({id:`relation-${el.id}-${i}`,kind,rings:[ring,...holes],...buildingHeight(tags),width:6});}continue;
    }
    if(el.type!=='way'||!el.geometry?.every(valid))continue;rings=[el.geometry];
    if(rings[0].length<(kind==='road'?2:4)||rings[0].length>1500)continue;
    if(kind!=='road'&&(rings[0][0].lat!==rings[0].at(-1)!.lat||rings[0][0].lon!==rings[0].at(-1)!.lon))continue;
    const lanes=Number(tags.lanes),width=Number.parseFloat(tags.width),roadWidth=Number.isFinite(width)?Math.min(30,Math.max(1,width)):['footway','path','pedestrian','steps'].includes(tags.highway)?2:Number.isFinite(lanes)?Math.min(30,Math.max(3,lanes*3)):6;
    features.push({id:`way-${el.id}`,kind,rings,...buildingHeight(tags),width:roadWidth});
  }
  return {features,timestamp:body.osm3s?.timestamp_osm_base??new Date().toISOString(),truncated:body.elements.length>5000||features.length>=1200};
}
