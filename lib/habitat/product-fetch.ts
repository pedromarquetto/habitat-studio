import { parseProductPage, publicProductUrl, type ProductDraft } from './product-import';

const LIMIT=2*1024*1024;
export function publicAddress(address:string){
  if(address.includes(':'))return /^[23][0-9a-f]{0,3}:/i.test(address)&&!/^2001:(?:db8|0):/i.test(address);
  const p=address.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b,c]=p;return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
async function resolvePublic(host:string,fetcher:typeof fetch,signal:AbortSignal){
  const replies=await Promise.all(['A','AAAA'].map(async type=>{
    let r:Response;try{r=await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal});}catch(error){if(signal.aborted)throw error;throw new Error('Não foi possível verificar o endereço da loja. Tente novamente ou preencha as medidas manualmente.');}
    if(!r.ok)throw new Error('Não foi possível verificar o endereço da loja. Tente novamente.');
    const data=await r.json() as {Status?:number;Answer?:{type:number;data:string}[]};if(data.Status!==0)throw new Error('O endereço da loja não foi encontrado.');
    return (data.Answer??[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);
  }));const addresses=replies.flat();if(!addresses.length||addresses.some(a=>!publicAddress(a)))throw new Error('Use o link de uma loja com endereço público.');
}
export async function fetchProduct(url:string,fetcher:typeof fetch=fetch):Promise<ProductDraft>{
  let current=publicProductUrl(url);const signal=AbortSignal.timeout(12000);
  for(let redirects=0;redirects<=3;redirects++){
    await resolvePublic(current.hostname,fetcher,signal);
    let response:Response;try{response=await fetcher(current.href,{redirect:'manual',signal,headers:{accept:'text/html,application/xhtml+xml','user-agent':'HabitatStudio/0.2 ProductDimensionReader'}});}catch(error){if(signal.aborted)throw error;throw new Error('Não foi possível acessar a página da loja. Você pode preencher as medidas manualmente.');}
    if([301,302,303,307,308].includes(response.status)){
      await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('A loja retornou um redirecionamento incompleto.');current=publicProductUrl(new URL(location,current).href);continue;
    }
    if(!response.ok){await response.body?.cancel();throw new Error('A loja bloqueou a leitura ou a página não está disponível. Você pode preencher as medidas manualmente.');}
    if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new Error('Esse link não é uma página de produto. Cole a página da loja.');}
    if(Number(response.headers.get('content-length'))>LIMIT){await response.body?.cancel();throw new Error('A página é grande demais para leitura. Preencha as medidas manualmente.');}
    const reader=response.body?.getReader();if(!reader)throw new Error('A loja retornou uma página vazia.');
    const decoder=new TextDecoder();let size=0,html='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>LIMIT)throw new Error('A página é grande demais para leitura. Preencha as medidas manualmente.');html+=decoder.decode(chunk.value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
    return parseProductPage(html,current.href);
  }
  throw new Error('A loja redirecionou muitas vezes. Use o link final do produto.');
}
