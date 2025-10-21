// Basic Prept logic: load sample or import via backend (optional).
// If you set WORKER_BASE to your Cloudflare Worker endpoint, import will work.
// Example: const WORKER_BASE = "https://prept.yourname.workers.dev/parse?url=";
const WORKER_BASE = "";

const form = document.getElementById('import-form');
const urlInput = document.getElementById('url');
const loadSampleBtn = document.getElementById('load-sample');
const recipeSection = document.getElementById('recipe');
const titleEl = document.getElementById('recipe-title');
const ingredientsList = document.getElementById('ingredients-list');
const groceryList = document.getElementById('grocery-list');
const servingsInput = document.getElementById('servings');
const messages = document.getElementById('messages');

// Utility: show message
function say(msg){ messages.textContent = msg; setTimeout(()=>messages.textContent='', 5000); }

// Scale a numeric quantity at start of ingredient line, e.g. "2 cups flour"
function scaleLine(line, factor){
  // Match leading fraction/number like "1 1/2", "2", "0.5"
  const match = line.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/?\s*\d+)?)\b(.*)$/);
  if(!match || !match[1].trim()) return line; // no numeric start
  const qtyStr = match[1].replace(/\s+/g,' ').trim();
  let qty = 0;
  // Convert "1 1/2" or "3/4"
  if(qtyStr.includes('/')){
    const parts = qtyStr.split(' ');
    if(parts.length === 2){
      const whole = parseFloat(parts[0]) || 0;
      const frac = parts[1].split('/');
      qty = whole + (parseFloat(frac[0]) / parseFloat(frac[1]));
    } else {
      const frac = qtyStr.split('/');
      qty = parseFloat(frac[0]) / parseFloat(frac[1]);
    }
  } else {
    qty = parseFloat(qtyStr);
  }
  if(isNaN(qty)) return line;
  const scaled = +(qty * factor).toFixed(2);
  return line.replace(match[1], scaled.toString());
}

// Render recipe from schema.org JSON
function renderRecipe(schema){
  const name = schema.name || 'Untitled Recipe';
  const baseYield = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  titleEl.textContent = name;
  servingsInput.value = baseYield;

  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  ingredientsList.innerHTML = '';
  ings.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ingredientsList.appendChild(li);
  });

  // initial grocery list same as ingredients
  buildGroceryList();
  recipeSection.classList.remove('hidden');
}

// Very naive grouping; later you can normalize & categorize.
function buildGroceryList(){
  groceryList.innerHTML = '';
  const factor = (parseInt(servingsInput.value) || 1) / (getBaseServings() || 1);
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent);
  const scaled = lines.map(l => scaleLine(l, factor));
  // Group exact string matches
  const map = new Map();
  scaled.forEach(line => {
    const key = line.toLowerCase().trim();
    map.set(key, (map.get(key) || 0) + 1);
  });
  [...map.keys()].sort().forEach(k => {
    const li = document.createElement('li');
    li.textContent = k;
    groceryList.appendChild(li);
  });
}

function getBaseServings(){
  // Stored in titleEl dataset? or infer from initial value captured once.
  return parseInt(servingsInput.getAttribute('data-base')) || parseInt(servingsInput.defaultValue) || 4;
}

// Track base servings at load
window.addEventListener('load', ()=>{
  servingsInput.setAttribute('data-base', servingsInput.value);
});

servingsInput.addEventListener('input', buildGroceryList);

loadSampleBtn.addEventListener('click', async ()=>{
  try{
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    // Find a Recipe object
    const node = Array.isArray(data) ? data.find(d => d['@type']==='Recipe') : (data['@type']==='Recipe' ? data : null);
    if(!node){ say('Sample missing a Recipe object.'); return; }
    renderRecipe(node);
  }catch(e){
    console.error(e); say('Could not load sample data.');
  }
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const url = urlInput.value.trim();
  if(!url){ say('Enter a recipe URL.'); return; }
  if(!WORKER_BASE){
    say('No backend configured. Click "Load Sample" or set WORKER_BASE in app.js.');
    return;
  }
  try{
    const res = await fetch(WORKER_BASE + encodeURIComponent(url));
    if(!res.ok) throw new Error('Fetch failed');
    const payload = await res.json();
    if(!payload || !payload.recipe) throw new Error('No recipe found');
    renderRecipe(payload.recipe);
  }catch(err){
    console.error(err); say('Failed to import. Check the URL or backend.');
  }
});
