// Plait v0.4.3 — Better highlighting + same-size blue highlights
// - Fuzzy matching across variants: stripped descriptors, parentheses, head noun, singular/plural
// - Same font size for highlights (just blue)
// - Keeps popover amounts based on scaled servings

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

const stepsSection = document.getElementById('instructions');
const stepsList = document.getElementById('steps-list');
const popover = document.getElementById('popover');

let BASE_SERVINGS = 4;
let parsedIngredients = []; // {raw, qty, unit, name, key, keys[], variants[]}

// ---------- init ----------
(function ensureInit(){
  function init() {
    if (!form) { console.error('Plait: #import-form not found.'); return; }
    if (!form.__plaitBound) { form.addEventListener('submit', onSubmit); form.__plaitBound = true; }
    copyBtn?.addEventListener('click', copyIngredients);
    servingsInput?.addEventListener('input', onServingsChange);
    stepsList?.addEventListener('click', onStepsClick);
    window.addEventListener('click', (e)=>{ if(popover && !popover.classList.contains('hidden') && !e.target.closest('.ing-ref')) hidePopover(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

function say(msg){ messages.textContent = msg; setTimeout(()=>messages.textContent='', 5000); }

// ---------- parsing helpers ----------
const UNIT_WORDS = [
  "teaspoon","teaspoons","tsp","tablespoon","tablespoons","tbsp",
  "cup","cups","ounce","ounces","oz","pound","pounds","lb","lbs",
  "gram","grams","g","kilogram","kilograms","kg","milliliter","milliliters","ml",
  "liter","liters","l","clove","cloves","pinch","pinches","dash","dashes",
  "can","cans","package","packages","packet","packets"
];
// words we strip from names when building variants
const DESCRIPTORS = new Set([
  "fresh","large","small","medium","extra","extra-large","xl","jumbo","optional",
  "chopped","minced","diced","shredded","sliced","crushed","softened","melted",
  "divided","room-temperature","room","temperature","to","taste","rinsed","drained",
  "packed","granulated","powdered","ground"
]);

function parseIngredient(line){
  let raw = line.trim();

  // quantity + rest
  const m = raw.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s+(.*)$/);
  let qty = null, unit = "", rest = raw;
  if(m && m[1].trim()){
    const qtyStr = m[1].replace(/\s+/g,' ').trim();
    qty = toNumber(qtyStr);
    rest = m[2].trim();
  }

  // unit
  let tokens = rest.split(/\s+/);
  if(tokens.length){
    const maybeUnit = tokens[0].toLowerCase();
    if(UNIT_WORDS.includes(maybeUnit)){ unit = tokens.shift(); }
  }

  const name = tokens.join(' ').trim() || rest;
  const key = normalizeKey(name);

  // Build matching variants
  const variants = buildNameVariants(name);
  const keys = variants.map(v => normalizeKey(v));

  return { raw, qty, unit, name, key, keys, variants };
}

function buildNameVariants(name){
  // strip content after comma (descriptors) and parentheses
  const noParen = name.replace(/\([^)]*\)/g,'').trim();
  const beforeComma = noParen.split(',')[0].trim();

  // remove descriptor words
  const filtered = beforeComma
    .split(/\s+/)
    .filter(tok => !DESCRIPTORS.has(tok.toLowerCase()))
    .join(' ')
    .replace(/\s+/g,' ')
    .trim();

  // head noun (last word) if multi-word
  const parts = filtered.split(/\s+/).filter(Boolean);
  const head = parts.length ? parts[parts.length-1] : filtered;

  // add simple singular forms
  const singular = toSingular(filtered);
  const headSing = toSingular(head);

  // unique list, longest first for better specificity
  const set = new Set([name, noParen, beforeComma, filtered, singular, head, headSing].map(s=>s.trim()).filter(Boolean));
  return [...set].sort((a,b) => b.length - a.length);
}

function toSingular(wordOrPhrase){
  const w = (wordOrPhrase||'').trim();
  const arr = w.split(/\s+/);
  if(!arr.length) return w;
  const last = arr[arr.length-1];
  let s = last;
  if(/ies$/i.test(s)) s = s.replace(/ies$/i, 'y');
  else if(/(xes|ches|shes|ses)$/i.test(s)) s = s.replace(/es$/i, '');
  else if(/s$/i.test(s) && !/ss$/i.test(s)) s = s.replace(/s$/i,'');
  arr[arr.length-1] = s;
  return arr.join(' ');
}

function toNumber(q){
  if(!q) return null;
  if(q.includes('/')){
    const parts = q.split(' ');
    if(parts.length === 2){
      const whole = parseFloat(parts[0])||0;
      const f = parts[1].split('/');
      return whole + (parseFloat(f[0])/parseFloat(f[1]));
    }
    const f = q.split('/');
    return parseFloat(f[0])/parseFloat(f[1]);
  }
  const n = parseFloat(q);
  return isNaN(n)?null:n;
}

function normalizeKey(s){
  return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function htmlEscape(s){ return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// ---------- rendering ----------
function renderRecipe(schema){
  const name = schema.name || 'Untitled Recipe';
  BASE_SERVINGS = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  titleEl.textContent = name;
  servingsInput.value = BASE_SERVINGS;
  servingsInput.setAttribute('data-base', BASE_SERVINGS);

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

  // Build a list of unique (variant -> ingredientKey) mapping
  const variantMap = [];
  for(const ing of parsedIngredients){
    for(const v of ing.variants){
      const key = normalizeKey(v);
      if(!key) continue;
      variantMap.push({ text:v, key, ingRef:ing });
    }
  }

  // Sort longest first to match more specific phrases before head nouns
  variantMap.sort((a,b)=> b.text.length - a.text.length);

  // Build regexes with "soft" word boundaries (allow punctuation/hyphen)
  const patterns = variantMap.map(({text, key, ingRef}) => {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(text)}(?![A-Za-z])`, 'gi');
    return { re, key: key, ingRef };
  });

  arr.forEach(step => {
    let htmlStep = htmlEscape(step);

    // Apply replacements without double-wrapping: use a marker during pass
    patterns.forEach(p => {
      htmlStep = htmlStep.replace(p.re, (m) => `[[[PLAIT:${p.key}:${m}]]]`);
    });

    // Final pass: turn markers into buttons
    htmlStep = htmlStep.replace(/\[\[\[PLAIT:([^:]+):([^\]]+)\]\]\]/g, (_all, key, label) => {
      return `<button class="ing-ref" data-key="${key}" title="Show amount">${label}</button>`;
    });

    const li = document.createElement('li');
    li.innerHTML = htmlStep;
    stepsList.appendChild(li);
  });

  stepsSection.classList.toggle('hidden', stepsList.children.length === 0);
}

// ---------- events ----------
async function onSubmit(e){
  e.preventDefault();
  const url = urlInput.value.trim();
  if(!url){ say('Enter a recipe URL.'); return; }

  try {
    window.__preptSetLoading?.(true);
    const res = await fetch(WORKER_BASE + encodeURIComponent(url));
    const text = await res.text();
    let payload; try { payload = JSON.parse(text); } catch { console.error('Worker non-JSON:', text); say('Worker returned non-JSON (see console).'); return; }
    if(!res.ok){ console.error('Worker error:', res.status, payload); say(`Worker error ${res.status}: ${payload.error || 'Unknown error'}`); return; }
    if(!payload || !payload.recipe){ say('No recipe found at that URL.'); return; }
    renderRecipe(payload.recipe);
  } catch (err) {
    console.error('Fetch to worker failed:', err);
    say(err?.name === 'AbortError' ? 'Worker timed out.' : 'Network error (see console).');
  } finally {
    window.__preptSetLoading?.(false);
  }
}

function onServingsChange(){ renderIngredients(); }

async function copyIngredients(){
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent.trim());
  try{ await navigator.clipboard.writeText(lines.join('\n')); say('Ingredients copied!'); }catch{ say('Could not copy.'); }
}

function onStepsClick(e){
  const btn = e.target.closest?.('.ing-ref'); if(!btn) return;
  const key = btn.getAttribute('data-key');

  // find the best ingredient whose keys contain this key
  const ing = parsedIngredients.find(i => i.keys.includes(key)) || parsedIngredients.find(i => i.key === key);
  if(!ing){ hidePopover(); return; }

  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  const qtyText = (typeof ing.qty === 'number') ? String(+(ing.qty * factor).toFixed(2)) : '—';
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

// ---------- sample ----------
loadSampleBtn?.addEventListener('click', async ()=>{
  try{
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    const node = Array.isArray(data) ? data.find(d => d['@type']==='Recipe') : (data['@type']==='Recipe' ? data : null);
    if(!node){ say('Sample missing a Recipe object.'); return; }
    renderRecipe(node);
  }catch(e){ console.error(e); say('Could not load sample data.'); }
});
