// Cloudflare Worker: fetch a URL, parse JSON-LD for a Recipe, return minimal fields.
// Deploy: https://developers.cloudflare.com/workers/get-started/guide/
// Set route like: https://prept.<your-subdomain>.workers.dev/parse
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) return new Response(JSON.stringify({ error: 'Missing url param' }), { status: 400, headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    try {
      const res = await fetch(target, { headers: { 'user-agent': 'PreptBot/0.1' }});
      if (!res.ok) return new Response(JSON.stringify({ error: 'Fetch failed' }), { status: 502, headers: cors() });
      const html = await res.text();
      const recipe = extractRecipeFromHTML(html);
      if (!recipe) return new Response(JSON.stringify({ error: 'No recipe found' }), { status: 404, headers: cors() });
      return new Response(JSON.stringify({ recipe }), { headers: cors() });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: cors() });
    }
  }
}

function cors(){ return { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' } }

function extractRecipeFromHTML(html){
  // Find <script type="application/ld+json"> blocks and parse the first Recipe.
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts){
    try {
      const json = JSON.parse(m[1].trim());
      // Could be an array, graph, or object
      const candidates = []
      if (Array.isArray(json)) candidates.push(...json);
      else if (json['@graph']) candidates.push(...json['@graph']);
      else candidates.push(json);

      const found = candidates.find(n => n && (n['@type']==='Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe'))));
      if (found){
        return {
          '@type': 'Recipe',
          name: found.name || 'Untitled Recipe',
          recipeYield: found.recipeYield || found.recipeServings || '4',
          recipeIngredient: found.recipeIngredient || []
        };
      }
    } catch(e){ /* ignore */ }
  }
  return null;
}
