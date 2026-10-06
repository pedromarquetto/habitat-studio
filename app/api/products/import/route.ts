import { fetchProduct } from '@/lib/habitat/product-fetch';

export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'};
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Abra a importação pelo Habitat Studio.'},{status:403,headers});
  if(Number(request.headers.get('content-length'))>4096)return Response.json({error:'O link é grande demais.'},{status:400,headers});
  try{
    const raw=await request.text();if(raw.length>4096)return Response.json({error:'O link é grande demais.'},{status:400,headers});
    const body=JSON.parse(raw);if(!body||typeof body.url!=='string')return Response.json({error:'Informe o link do produto.'},{status:400,headers});
    return Response.json(await fetchProduct(body.url),{headers});
  }catch(error){
    const timeout=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);
    const known=error instanceof Error&&/^(Cole |Use |Não foi possível |O endereço |A loja |Esse link |A página )/.test(error.message);
    const message=timeout?'A loja demorou para responder. Você pode preencher as medidas manualmente.':error instanceof SyntaxError?'Informe um link válido.':known?(error as Error).message:'Não foi possível ler essa loja. Você pode preencher as medidas manualmente.';
    return Response.json({error:message},{status:422,headers});
  }
}
