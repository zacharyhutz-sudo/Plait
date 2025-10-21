// Plait v0.4 — Features:
// - No grocery list panel
// - Ingredients scale when servings changes
// - Copy Ingredients button
// - Highlight ingredients in steps; click to see qty + unit

const WORKER_BASE = "https://prept-parse.zacharyhutz.workers.dev/?url=";

const form = document.getElementById('import-form');
const urlInput = document.getElementById('url');
const loadSampleBtn = document.getElementById('load-sample');

const recipeSection = document.getElementById('recipe');
const titleEl = document.getElementById('recipe-title');
const ingredientsList = document.getElementById('ingredients-list');
const servingsInput = document.getElementById('servings');
const messages = document.getElementById('messages');
const copyBtn = document.getElementById('copy-ingredients');

// Steps
const stepsSection = document.getElementById('instructions');
const stepsList = document.getElementById('steps-list');
const popover = document.getElementById('popover');

// Parsed ingredient model (after import)
let BASE_SERVINGS = 4;
let parsedIngredients = []; // [{raw, qty, unit, name, key}]

// --- Initialize safely ---
(function ensureInit(){
  function init() {
    if (!form) {
      console.error('Plait: #import-form not found — check index.html id="import-form".');
      return;
    }
    if (!form.__plaitBound) {
      form.addEventListener('submit', onSubmit);
      form.__plaitBound = true;
      console.log('Plait: submit handler bound.');
    }
    copyBtn?.addEventListener('click', copyIngredients);
    servingsInput.addEventListener('input', onServingsChange);
    stepsList.addEventListener('click', onStepsClick);
    window.addEventListener('click', (e)=>{
      if(!popover.classList.contains('hidden') && !e.target.closest('.ing-ref')){
        hidePopover();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

function say(msg){
  messages.textContent = msg;
  setTimeout(()=>messages.textContent='', 5000);
}

// ---------- INGREDIENT PARSING ----------

const UNIT_WORDS = [
  "teaspoon","teaspoons","tsp","tablespoon","tablespoons","tbsp",
  "cup","cups","ounce","ounces","oz","pound","pounds","lb","lbs",
  "gram","grams","g","kilogram","kilograms","kg","milliliter","milliliters","ml",
  "liter","liters","l","clove","cloves","pinch","pinches","dash","dashes",
  "can","cans","package","packages","packet","packets"
];

function parseIngredient(line){
  // Very lightweight parser: qty (incl. mixed frac), unit (optional), name (rest)
  // Examples:
  // "1 1/2 cups flour" -> {qty:1.5, unit:'cups', name:'flour'}
  // "3/4 tsp salt" -> {qty:0.75, unit:'tsp', name:'salt'}
  // "2 large eggs" -> {qty:2, unit:'', name:'large eggs'}
  let raw = line.trim();
  // qty
  const m = raw.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s+(.*)$/);
  let qty = null, unit = "", rest = raw;
  if(m && m[1].trim()){
    const qtyStr = m[1].replace(/\s+/g,' ').trim();
    qty = toNumber(qtyStr);
    rest = m[2].trim();
  }
  // unit (first token if in UNIT_WORDS)
  let tokens = rest.split(/\s+/);
  if(tokens.length){
    const maybeUnit = tokens[0].toLowerCase();
    if(UNIT_WORDS.includes(maybeUnit)){
      unit = tokens.shift();
    }
  }
  const name = tokens.join(' ').trim() || rest;
  const key = normalizeKey(name);
  return { raw, qty, unit, name, key };
}

function toNumber(qtyStr){
  if(!qtyStr) return null;
  if(qtyStr.includes('/')){
    const parts = qtyStr.split(' ');
    if(parts.length === 2){
      const whole = parseFloat(parts[0]) || 0;
      const frac = parts[1].split('/');
      return whole + (parseFloat(frac[0]) / parseFloat(frac[1]));
    } else {
      const frac = qtyStr.split('/');
      return parseFloat(frac[0]) / parseFloat(frac[1]);
    }
  }
  const n = parseFloat(qtyStr);
  return isNaN(n) ? null : n;
}

function normalizeKey(s){
  return s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}

// ---------- RENDERING ----------

function renderRecipe(schema){
  const name = schema.name || 'Untitled Recipe';
  BASE_SERVINGS = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  titleEl.textContent = name;
  servingsInput.value = BASE_SERVINGS;
  servingsInput.setAttribute('data-base', BASE_SERVINGS);

  // Parse ingredients into model
  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  parsedIngredients = ings.map(parseIngredient);

  renderIngredients();
  renderSteps(schema.recipeInstructions);

  recipeSection.classList.remove('hidden');
}

function renderIngredients(){
  // Scale using current servings vs base
  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  ingredientsList.innerHTML = '';
  parsedIngredients.forEach(obj => {
    const li = document.createElement('li');
    let qtyStr = '';
    if(typeof obj.qty === 'number'){
      const scaled = +(obj.qty * factor).toFixed(2);
      qtyStr = scaled % 1 === 0 ? String(scaled) : String(scaled);
    }
    const unitStr = obj.unit ? (' ' + obj.unit) : '';
    const txt = [(qtyStr || '').trim(), unitStr.trim(), obj.name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    li.textContent = txt || obj.raw;
    li.setAttribute('data-key', obj.key);
    ingredientsList.appendChild(li);
  });
}

function renderSteps(instructions){
  const arr = Array.isArray(instructions) ? instructions : [];
  stepsList.innerHTML = '';
  // Build replacement map (longest names first)
  const names = parsedIngredients.map(i => i.name).filter(Boolean);
  names.sort((a,b)=> b.length - a.length);

  const patterns = names.map(n => ({
    name: n,
    key: normalizeKey(n),
    re: new RegExp(`\\b${escapeRegExp(n)}\\b`, 'gi')
  }));

  arr.forEach(step => {
    let htmlStep = htmlEscape(step);
    for(const p of patterns){
      htmlStep = htmlStep.replace(p.re, (m)=> `<button class="ing-ref" data-key="${p.key}" title="Show amount">${m}</button>`);
    }
    const li = document.createElement('li');
    li.innerHTML = htmlStep;
    stepsList.appendChild(li);
  });

  stepsSection.classList.toggle('hidden', stepsList.children.length === 0);
}

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function htmlEscape(s){ return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// ---------- EVENTS ----------

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
      return;
    }
    if(!payload || !payload.recipe){
      say('No recipe found at that URL. Try a different site.');
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

function onServingsChange(){
  renderIngredients();
}

async function copyIngredients(){
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent.trim());
  const text = lines.join('\n');
  try{
    await navigator.clipboard.writeText(text);
    say('Ingredients copied!');
  }catch{
    say('Could not copy — your browser blocked clipboard.');
  }
}

function onStepsClick(e){
  const btn = e.target.closest('.ing-ref');
  if(!btn) return;
  const key = btn.getAttribute('data-key');
  const ing = parsedIngredients.find(i => i.key === key);
  if(!ing){ hidePopover(); return; }

  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  let qtyText = '';
  if(typeof ing.qty === 'number'){
    const scaled = +(ing.qty * factor).toFixed(2);
    qtyText = scaled % 1 === 0 ? String(scaled) : String(scaled);
  } else {
    qtyText = '—'; // unknown
  }
  const unitText = ing.unit || '(unit)';
  const content = `<div class="title">${htmlEscape(ing.name)}</div>
    <div>${qtyText} ${htmlEscape(unitText)}</div>
    <div class="note">Based on current servings</div>`;
  showPopover(content, e.clientX, e.clientY);
}

function showPopover(html, x, y){
  popover.innerHTML = html;
  popover.classList.remove('hidden');
  // Position near cursor, keep inside viewport
  const pad = 10;
  const { innerWidth:w, innerHeight:h } = window;
  const rect = { width: 240, height: 80 };
  let left = Math.min(x + pad, w - rect.width - pad);
  let top = Math.min(y + pad, h - rect.height - pad);
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
}

function hidePopover(){
  popover.classList.add('hidden');
}

// ---------- SAMPLE LOADER ----------

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
