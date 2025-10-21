// Plait v0.4.1 (null-safe)
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

// Steps (may be null if HTML section was removed/renamed)
const stepsSection = document.getElementById('instructions');
const stepsList = document.getElementById('steps-list');
const popover = document.getElementById('popover');

let BASE_SERVINGS = 4;
let parsedIngredients = [];

// ---- init
(function ensureInit(){
  function init() {
    if (!form) { console.error('Plait: #import-form not found.'); return; }
    if (!form.__plaitBound) { form.addEventListener('submit', onSubmit); form.__plaitBound = true; console.log('Plait: submit handler bound.'); }
    copyBtn?.addEventListener('click', copyIngredients);
    servingsInput?.addEventListener('input', onServingsChange);
    stepsList?.addEventListener('click', onStepsClick);
    window.addEventListener('click', (e)=>{ if(popover && !popover.classList.contains('hidden') && !e.target.closest('.ing-ref')) hidePopover(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

function say(msg){ messages.textContent = msg; setTimeout(()=>messages.textContent='', 5000); }

// --------- parsing helpers
const UNIT_WORDS = ["teaspoon","teaspoons","tsp","tablespoon","tablespoons","tbsp","cup","cups","ounce","ounces","oz","pound","pounds","lb","lbs","gram","grams","g","kilogram","kilograms","kg","milliliter","milliliters","ml","liter","liters","l","clove","cloves","pinch","pinches","dash","dashes","can","cans","package","packages","packet","packets"];

function parseIngredient(line){
  let raw = line.trim();
  const m = raw.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s+(.*)$/);
  let qty = null, unit = "", rest = raw;
  if(m && m[1].trim()){ const qtyStr = m[1].replace(/\s+/g,' ').trim(); qty = toNumber(qtyStr); rest = m[2].trim(); }
  let tokens = rest.split(/\s+/);
  if(tokens.length){ const maybeUnit = tokens[0].toLowerCase(); if(UNIT_WORDS.includes(maybeUnit)){ unit = tokens.shift(); } }
  const name = tokens.join(' ').trim() || rest;
  const key = normalizeKey(name);
  return { raw, qty, unit, name, key };
}

function toNumber(q){ if(!q) return null; if(q.includes('/')){ const parts = q.split(' '); if(parts.length === 2){ const whole = parseFloat(parts[0])||0; const f = parts[1].split('/'); return whole + (parseFloat(f[0])/parseFloat(f[1])); } const f = q.split('/'); return parseFloat(f[0])/parseFloat(f[1]); } const n = parseFloat(q); return isNaN(n)?null:n; }
function normalizeKey(s){ return s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim(); }
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function htmlEscape(s){ return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// --------- rendering
function renderRecipe(schema){
  const name = schema.name || 'Untitled Recipe';
  BASE_SERVINGS = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  titleEl.textContent = name;
  servingsInput.value = BASE_SERVINGS;
  servingsInput.setAttribute('data-base', BASE_SERVINGS);

  // model
  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  parsedIngredients = ings.map(parseIngredient);

  renderIngredients();
  renderSteps(schema.recipeInstructions);

  recipeSection?.classList.remove('hidden');
}

function renderIngredients(){
  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  ingredientsList.innerHTML = '';
  parsedIngredients.forEach(obj => {
    const li = document.createElement('li');
    let qtyStr = '';
    if(typeof obj.qty === 'number'){ const scaled = +(obj.qty * factor).toFixed(2); qtyStr = String(scaled); }
    const unitStr = obj.unit ? (' ' + obj.unit) : '';
    const txt = [(qtyStr || '').trim(), unitStr.trim(), obj.name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    li.textContent = txt || obj.raw;
    li.setAttribute('data-key', obj.key);
    ingredientsList.appendChild(li);
  });
}

function renderSteps(instructions){
  if(!stepsList || !stepsSection){
    console.warn('Plait: steps DOM not found; skipping step rendering.');
    return;
  }
  const arr = Array.isArray(instructions) ? instructions : [];
  stepsList.innerHTML = '';
  const names = parsedIngredients.map(i => i.name).filter(Boolean).sort((a,b)=> b.length - a.length);
  const patterns = names.map(n => ({ name:n, key:normalizeKey(n), re:new RegExp(`\\b${escapeRegExp(n)}\\b`,'gi') }));
  arr.forEach(step => {
    let htmlStep = htmlEscape(step);
    for(const p of patterns){ htmlStep = htmlStep.replace(p.re, m=> `<button class="ing-ref" data-key="${p.key}" title="Show amount">${m}</button>`); }
    const li = document.createElement('li'); li.innerHTML = htmlStep; stepsList.appendChild(li);
  });
  stepsSection.classList.toggle('hidden', stepsList.children.length === 0);
}

// --------- events
async function onSubmit(e){
  e.preventDefault();
  const url = urlInput.value.trim();
  if(!url){ say('Enter a recipe URL.'); return; }

  const requestUrl = WORKER_BASE + encodeURIComponent(url);
  console.log('[Import] Request URL:', requestUrl);

  try {
    const res = await fetch(requestUrl);
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { console.error('[Import] Worker non-JSON:', text.slice(0,400)); say('Worker returned non-JSON (see console).'); return; }

    if(!res.ok){ console.error('[Import] Worker error:', res.status, payload); say(`Worker error ${res.status}: ${payload.error || 'Unknown error'}`); return; }
    if(!payload || !payload.recipe){ console.error('[Import] No recipe in payload:', payload); say('No recipe found at that URL.'); return; }

    renderRecipe(payload.recipe);
  } catch (err) {
    console.error('[Import] Fetch threw:', err.name, err.message, err);
    say(err?.name === 'AbortError' ? 'Worker timed out.' : `Network error: ${err?.message || 'see console'}`);
  }
}

function onServingsChange(){ renderIngredients(); }

async function copyIngredients(){
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent.trim());
  try{ await navigator.clipboard.writeText(lines.join('\n')); say('Ingredients copied!'); }catch{ say('Could not copy.'); }
}

function onStepsClick(e){
  const btn = e.target.closest?.('.ing-ref'); if(!btn) return;
  const key = btn.getAttribute('data-key'); const ing = parsedIngredients.find(i => i.key === key); if(!ing){ hidePopover(); return; }
  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  let qtyText = (typeof ing.qty === 'number') ? String(+(ing.qty * factor).toFixed(2)) : '—';
  const unitText = ing.unit || '(unit)';
  const content = `<div class="title">${htmlEscape(ing.name)}</div><div>${qtyText} ${htmlEscape(unitText)}</div><div class="note">Based on current servings</div>`;
  showPopover(content, e.clientX, e.clientY);
}

function showPopover(html, x, y){
  if(!popover) return;
  popover.innerHTML = html; popover.classList.remove('hidden');
  const pad = 10; const w = innerWidth, h = innerHeight; const width = 240, height = 90;
  let left = Math.min(x + pad, w - width - pad); let top = Math.min(y + pad, h - height - pad);
  popover.style.left = left + 'px'; popover.style.top = top + 'px';
}
function hidePopover(){ popover?.classList.add('hidden'); }

// sample loader
loadSampleBtn?.addEventListener('click', async ()=>{
  try{
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    const node = Array.isArray(data) ? data.find(d => d['@type']==='Recipe') : (data['@type']==='Recipe' ? data : null);
    if(!node){ say('Sample missing a Recipe object.'); return; }
    renderRecipe(node);
  }catch(e){ console.error(e); say('Could not load sample data.'); }
});

