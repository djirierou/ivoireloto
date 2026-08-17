// Vercel / Netlify serverless function to proxy lotobonheur.ci
// Éviter CORS en fetch côté serveur
export const config = {
  runtime: 'edge', // for Vercel edge, fallback to node
};

export default async function handler(req) {
  const target = 'https://lotobonheur.ci/resultats';
  try{
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LotoAnalytics/2.1; +https://ivoireloto/)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      next: {revalidate: 300} // cache 5 min if Next.js
    });
    if(!upstream.ok){
      return new Response(JSON.stringify({error:`upstream ${upstream.status}`}), {status:502, headers:{'Content-Type':'application/json'}});
    }
    const html = await upstream.text();
    // Basic check
    if(!html.includes('Gagnants') && !html.includes('Machine') && html.length<1000){
      return new Response(JSON.stringify({error:'contenu inattendu'}), {status:502});
    }
    return new Response(html, {
      status:200,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'public, s-maxage=300, stale-while-revalidate=60',
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Methods':'GET',
      }
    });
  }catch(e){
    return new Response(JSON.stringify({error:e.message}), {status:500, headers:{'Content-Type':'application/json'}});
  }
}

// For Netlify compatibility
export async function handlerNetlify(event){
  return handler(new Request('https://example.com'));
}
