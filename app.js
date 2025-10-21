// Basic Prept logic: load sample or import via backend (optional).
const WORKER_BASE = "https://prept-parse.zacharyhutz.workers.dev/?url=";

const form = document.getElementById('import-form');
const urlInput = document.getElementById('url');
const loadSampleBtn = document.getElementById('load-sample');

const recipeSection = document.getElementById('recipe');
const titleEl = document.getElementById('recipe-title');
const ingredientsList = document.getElementById('ingredients-list');
const groceryList = document.getElementById('grocery-list');
const servingsInput = document.getElementById('servings');
const messages = document.getElementById('messages');

// Steps
const stepsSection = document.getElementById('instructions');
const stepsList = document.getElementById('steps-list');

// --- Initialize safely ---
(function ensureInit(){
  function init() {
    if (!form) {
      console.error('Prept: #import-form not found — check index.html id="import-form".');
      return;
    }
    if (!form.__preptBound) {
      form.addEventListener('submit', onSubmit);
      form.__preptBound = true;
      console.log('Prept: submit handler bound.');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Utility: show message
function say(msg){
  messages.textContent = msg;
  setTimeout(()=>messages.textContent='', 5000);
}

// Scale a numeric quantity at start of ingredient line, e.g. "1 1/2 cups"
function scaleLine(line, factor){
  const match = line.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/?\s*\d+)?)\b(.*)$/);
  if(!match || !match[1].trim()) return line;
  const qtyStr = match[1].replace(/\s+/g,' ').trim();
  let qty = 0;
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

  // Ingredients
  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  ingredientsList.innerHTML = '';
  ings.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ingredientsList.appendChild(li);
  });

  // Steps (expects array of strings)
  const instr = Array.isArray(schema.recipeInstructions) ? schema.recipeInstructions : [];
  stepsList.innerHTML = '';
  if (instr.length) {
    instr.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      stepsList.appendChild(li);
    });
    stepsSection.classList.remove('hidden');
  } else {
    stepsSection.classList.add('hidden');
  }

  buildGroceryList();
  recipeSection.classList.remove('hidden');
}

// Build grocery list
function buildGroceryList(){
  groceryList.innerHTML = '';
  const factor = (parseInt(servingsInput.value) || 1) / (getBaseServings() || 1);
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent);
  const scaled = lines.map(l => scaleLine(l, factor));
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
  return parseInt(servingsInput.getAttribute('data-base')) || parseInt(servingsInput.defaultValue) || 4;
}

window.addEventListener('load', ()=>{
  servingsInput.setAttribute('data-base', servingsInput.value);
});

servingsInput.addEventListener('input', buildGroceryList);

// Load sample
loadSampleBtn.addEventListener('click', async ()=>{
  try{
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    const node = Array.isArray(data) ? data.find(d => d['@type']==='Recipe') : (data['@type']==='Recipe' ? data : null);
    if(!node){ say('Sample missing a Recipe object.'); return; }
    renderRecipe(node);
  }catch(e){
    console.error(e); say('Could not load sample data.');
  }
});

// --- Form Submit Handler ---
async function onSubmit(e){
  e.preventDefault();
  const url = urlInput.value.trim();
  if(!url){ say('Enter a recipe URL.'); return; }
  if(!WORKER_BASE){ say('No backend configured.'); return; }

  try {
    window.__preptSetLoading?.(true);
    const res = await fetch(WORKER_BASE + encodeURIComponent(url));
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch {
      say('Worker returned non-JSON: ' + text.slice(0,120) + '…');
      return;
    }
    if(!res.ok){
      say(`Worker error ${res.status}: ${payload.error || 'Unknown error'}`);
      ingredientsList.innerHTML = '<li class="empty">No ingredients</li>';
      stepsList.innerHTML = '';
      stepsSection.classList.add('hidden');
      return;
    }
    if(!payload || !payload.recipe){
      say('No recipe found at that URL. Try a different site.');
      ingredientsList.innerHTML = '<li class="empty">No ingredients</li>';
      stepsList.innerHTML = '';
      stepsSection.classList.add('hidden');
      return;
    }
    renderRecipe(payload.recipe);
  } catch (err) {
    console.error(err);
    say('Network error talking to the Worker.');
  } finally {
    window.__preptSetLoading?.(false);
  }
}

