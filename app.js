// Plait v0.4.8 — Open saved recipe from Saved page + checklist + step splitting
const WORKER_BASE = "https://prept-parse.zacharyhutz.workers.dev/?url=";
const STORAGE_KEY = "plait.savedRecipes";

const form = document.getElementById('import-form');
const urlInput = document.getElementById('url');
const loadSampleBtn = document.getElementById('load-sample');

const recipeSection = document.getElementById('recipe');
const titleEl = document.getElementById('recipe-title');
const ingredientsList = document.getElementById('ingredients-list');
const servingsInput = document.getElementById('servings');
const messages = document.getElementById('messages');
const copyBtn = document.getElementById('copy-ingredients');
const saveBtn = document.getElementById('save-recipe');

const stepsSection = document.getElementById('instructions');
const stepsList = document.getElementById('steps-list');

// Cook Mode state
let isCookMode = false;
let currentStepIndex = 0;

// Cook Mode elements (assigned in init after DOM is ready)
let stepsToggleBtn, stepFocus, stepFocusBody, stepPrev, stepNext, stepCounter;

// Views & nav
const viewHome = document.getElementById('view-home');
const viewSaved = document.getElementById('view-saved');
const savedList = document.getElementById('saved-list');
const savedEmpty = document.getElementById('saved-empty');
const navHome = document.getElementById('nav-home');
const navSaved = document.getElementById('nav-saved');
const refreshSavedBtn = document.getElementById('refresh-saved');

let BASE_SERVINGS = 4;
let parsedIngredients = [];
let currentRecipeSchema = null;
let currentSourceUrl = null;

(function ensureInit(){
  function init() {
    if (!form) { console.warn('Plait: #import-form not found — proceeding with partial init.'); }
    if (!form.__plaitBound) { form.addEventListener('submit', onSubmit); form.__plaitBound = true; }

    copyBtn?.addEventListener('click', copyIngredients);
    servingsInput?.addEventListener('input', onServingsChange);
    stepsList?.addEventListener('click', onStepsClick);

    
    // Cook Mode hookups: select elements now (DOM is ready)
    stepsToggleBtn = document.getElementById('steps-toggle');
    stepFocus = document.getElementById('step-focus');
    stepFocusBody = document.getElementById('step-focus-body');
    stepPrev = document.getElementById('step-prev');
    stepNext = document.getElementById('step-next');
    stepCounter = document.getElementById('step-counter');

    // Listeners
    stepsToggleBtn?.addEventListener('click', toggleCookMode);
    stepPrev?.addEventListener('click', ()=> stepGoto(currentStepIndex - 1));
    stepNext?.addEventListener('click', ()=> stepGoto(currentStepIndex + 1));
    stepFocusBody?.addEventListener('click', onStepsClick);

    window.addEventListener('keydown', (e)=>{ if(isCookMode){ if(e.key==='ArrowLeft') stepGoto(currentStepIndex-1); if(e.key==='ArrowRight') stepGoto(currentStepIndex+1);} });
// Ingredient checklist styling
    ingredientsList?.addEventListener('change', (e)=>{
      if (e.target && e.target.matches('input[type="checkbox"]')) {
        const li = e.target.closest('li');
        li?.classList.toggle('checked', e.target.checked);
      }
    });

    // Saved: save button + render + open-on-click
    saveBtn?.addEventListener('click', onSaveRecipe);
    refreshSavedBtn?.addEventListener('click', renderSavedList);
    savedList?.addEventListener('click', onSavedListClick);

    // Sidebar nav
    navHome?.addEventListener('click', (e)=>{ e.preventDefault(); showHome(); });
    navSaved?.addEventListener('click', (e)=>{ e.preventDefault(); showSaved(); });

    // Basic hash routing
    if (location.hash === '#/saved') showSaved(); else if (location.hash === '#/groceries') showGroceries(); else showHome();
    window.addEventListener('hashchange', ()=>{
      if (location.hash === '#/saved') showSaved(); else if (location.hash === '#/groceries') showGroceries(); else showHome();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

function say(msg){ messages.textContent = msg; setTimeout(()=>messages.textContent='', 3500); }

// ---------- parsing helpers ----------
const UNIT_WORDS = [
  "teaspoon","teaspoons","tsp","tablespoon","tablespoons","tbsp",
  "cup","cups","ounce","ounces","oz","pound","pounds","lb","lbs",
  "gram","grams","g","kilogram","kilograms","kg","milliliter","milliliters","ml",
  "liter","liters","l","clove","cloves","pinch","pinches","dash","dashes",
  "can","cans","package","packages","packet","packets"
];
const DESCRIPTORS = new Set([
  "fresh","large","small","medium","extra","extra-large","xl","jumbo","optional",
  "chopped","minced","diced","shredded","sliced","crushed","softened","melted",
  "divided","room-temperature","room","temperature","to","taste","rinsed","drained",
  "packed","granulated","powdered","ground"
]);

const ACTION_VERBS = new Set([
  "add","adjust","bake","beat","blend","boil","braise","break","bring","broil",
  "brush","brown","char","chill","chop","combine","cool","cover","crack","drain",
  "drizzle","fold","fry","garnish","grate","grease","grill","heat","knead","let",
  "marinate","mash","microwave","mix","peel","place","poach","pour","preheat",
  "press","reduce","roast","sauté","saute","season","sear","serve","set","sift",
  "simmer","slice","spoon","spread","sprinkle","stir","stir-fry","strain","toss",
  "transfer","turn","warm","whisk","wipe","wrap","remove","top","zest","ladle","shred","cover","pull"
]);
const LEADING_FILLERS = new Set(["then","next","now","and"]);

function parseIngredient(line){
  let raw = line.trim();
  const m = raw.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s+(.*)$/);
  let qty = null, unit = "", rest = raw;
  if(m && m[1].trim()){
    const qtyStr = m[1].replace(/\s+/g,' ').trim();
    qty = toNumber(qtyStr);
    rest = m[2].trim();
  }
  let tokens = rest.split(/\s+/);
  if(tokens.length){
    const maybeUnit = tokens[0].toLowerCase();
    if(UNIT_WORDS.includes(maybeUnit)){ unit = tokens.shift(); }
  }
  const name = tokens.join(' ').trim() || rest;
  const key = normalizeKey(name);
  const variants = buildNameVariants(name);
  const keys = variants.map(v => normalizeKey(v));
  return { raw, qty, unit, name, key, variants, keys };
}

function buildNameVariants(name){
  const noParen = name.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
  const beforeComma = noParen.split(',')[0].trim();
  const filtered = beforeComma
    .split(/\s+/)
    .filter(tok => !DESCRIPTORS.has(tok.toLowerCase()))
    .join(' ')
    .replace(/\s+/g,' ')
    .trim();
  const parts = filtered.split(/\s+/).filter(Boolean);
  const head = parts.length ? parts[parts.length-1] : filtered;
  const singular = toSingular(filtered);
  const headSing = toSingular(head);
  const set = new Set([name, noParen, beforeComma, filtered, singular, head, headSing].map(s=>s.trim()).filter(Boolean));
  return [...set].sort((a,b)=> b.length - a.length);
}

function toSingular(phrase){
  const arr = (phrase||'').trim().split(/\s+/);
  if(!arr.length) return phrase||'';
  let s = arr[arr.length-1];
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

function normalizeKey(s){ return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function htmlEscape(s){ return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// ---------- step-splitting ----------
function sentenceSplit(text){
  const parts = [];
  let last = 0;
  const re = /([.!?])\s+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const seg = text.slice(last, m.index + 1).trim();
    if (seg) parts.push(seg);
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [text.trim()];
}

function startsWithVerbOrSecondWordVerb(sentence){
  const cleaned = sentence.replace(/^[“"'\s]+/, '').trim();
  if (!cleaned) return false;
  const tokens = cleaned.split(/\s+/);
  const first = tokens[0].toLowerCase().replace(/^[^a-z]+|[^a-z]+$/gi,'');
  const second = (tokens[1] || '').toLowerCase().replace(/^[^a-z]+|[^a-z]+$/gi,'');
  if (ACTION_VERBS.has(first)) return true;
  if (LEADING_FILLERS.has(first) && ACTION_VERBS.has(second)) return true;
  return false;
}

function splitInstructionsArray(instructions){
  const arr = Array.isArray(instructions) ? instructions : [];
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const sentences = sentenceSplit(item);
    let bucket = [];
    for (const s of sentences) {
      if (startsWithVerbOrSecondWordVerb(s)) {
        if (bucket.length) out.push(bucket.join(' ').trim());
        bucket = [s];
      } else {
        bucket.push(s);
      }
    }
    if (bucket.length) out.push(bucket.join(' ').trim());
  }
  return out.filter(Boolean);
}

// ---------- rendering ----------
function renderRecipe(schema){
  currentRecipeSchema = schema;
  const name = schema.name || 'Untitled Recipe';
  BASE_SERVINGS = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  titleEl.textContent = name;
  servingsInput.value = BASE_SERVINGS;
  servingsInput.setAttribute('data-base', BASE_SERVINGS);

  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  parsedIngredients = ings.map(parseIngredient);

  renderIngredients();
  
  
  currentStepIndex = 0;
currentStepIndex = 0;
const splitSteps = splitInstructionsArray(schema.recipeInstructions);
  renderSteps(splitSteps);
  recipeSection?.classList.remove('hidden');

  // Scroll to the recipe on open
  setTimeout(()=> recipeSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function renderIngredients(){
  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  ingredientsList.innerHTML = '';
  parsedIngredients.forEach((obj, idx) => {
    const li = document.createElement('li');
    li.className = 'ingredient-item';

    let qtyStr = '';
    if(typeof obj.qty === 'number'){ 
      const scaled = obj.qty * factor;
      qtyStr = formatAmount(scaled);
    }
    const unitStr = obj.unit ? (' ' + obj.unit) : '';
    const textLine = [(qtyStr || '').trim(), unitStr.trim(), obj.name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim() || obj.raw;

    const id = `ing-${idx}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.className = 'ing-check';

    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = textLine;

    li.appendChild(checkbox);
    li.appendChild(label);
    li.setAttribute('data-key', obj.key);
    ingredientsList.appendChild(li);
  });
}

function renderSteps(instructions){
  if(!stepsList || !stepsSection){ console.warn('Plait: steps DOM not found; skipping step rendering.'); return; }
  const arr = Array.isArray(instructions) ? instructions : [];
  stepsList.innerHTML = '';

  const variantMap = [];
  for(const ing of parsedIngredients){
    for(const v of ing.variants){
      const key = normalizeKey(v);
      if(!key) continue;
      variantMap.push({ text: v, key, ingRef: ing });
    }
  }
  variantMap.sort((a,b)=> b.text.length - a.text.length);

  const items = [];
  for (const step of arr) {
    let escaped = htmlEscape(step);
    const matches = [];
    for (const { text, key } of variantMap) {
      const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(text)}(?![A-Za-z])`, 'gi');
      let m;
      while ((m = re.exec(escaped))) {
        matches.push({ start: m.index, end: m.index + m[0].length, label: m[0], key });
      }
    }
    matches.sort((a,b)=> a.start - b.start || b.label.length - a.label.length);
    const filtered = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
    }
    let result = '';
    let pos = 0;
    for (const m of filtered) {
      result += escaped.slice(pos, m.start);
      result += `<span class="ing-ref" data-key="${m.key}" role="button" tabindex="0">${m.label}</span>`;
      pos = m.end;
    }
    result += escaped.slice(pos);
    const li = document.createElement('li');
    li.innerHTML = result;
    items.push(li);
  }
  for(const li of items) stepsList.appendChild(li);
  stepsSection.classList.toggle('hidden', stepsList.children.length === 0);

  
  updateStepsView();
updateStepsView();
}

// ---------- click on highlighted ingredient -> show amount in toast ----------
function onStepsClick(e){
  const el = e.target.closest?.('.ing-ref');
  if(!el) return;
  const key = el.getAttribute('data-key');
  const ing = parsedIngredients.find(i => i.keys.includes(key)) || parsedIngredients.find(i => i.key === key);
  if(!ing){ return; }
  const factor = (parseInt(servingsInput.value) || BASE_SERVINGS) / (BASE_SERVINGS || 1);
  const qty = (typeof ing.qty === 'number') ? ing.qty * factor : null;
  const amount = (qty == null) ? '—' : formatAmount(qty);
  const unit = ing.unit || '(unit)';
  showIngredientModal(`${ing.name} — ${amount} ${unit}`.trim());
}

// Friendly fraction formatting (nearest 1/8)
function formatAmount(n){
  const rounded = Math.round(n * 8) / 8;
  const whole = Math.floor(rounded + 1e-9);
  const frac = rounded - whole;
  const map = { 0: '', 0.125:'1/8', 0.25:'1/4', 0.375:'3/8', 0.5:'1/2', 0.625:'5/8', 0.75:'3/4', 0.875:'7/8' };
  const fracStr = map[Number(frac.toFixed(3))] || '';
  return (whole > 0 ? whole : '') + (whole>0 && fracStr ? ' ' : '') + (fracStr || (whole? '' : '0'));
}

// ---------- saving ----------
function onSaveRecipe(){
  if(!currentRecipeSchema){ say('Import a recipe first.'); return; }
  const saved = getSaved();
  const entry = serializeRecipe(currentRecipeSchema, currentSourceUrl);
  const exists = saved.find(r => r.name === entry.name && r.ingredients?.length === entry.ingredients?.length);
  if (exists){ say('Already saved.'); return; }
  saved.push(entry);
  setSaved(saved);
  say('Saved!');
  renderSavedList(); // keep saved page fresh
}

function serializeRecipe(schema, sourceUrl){
  const name = schema.name || 'Untitled Recipe';
  const ingredients = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  const instr = Array.isArray(schema.recipeInstructions) ? schema.recipeInstructions : [];
  const servings = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  return {
    id, name, servings, ingredients, instructions: instr, sourceUrl: sourceUrl || '',
    savedAt: new Date().toISOString()
  };
}

function getSaved(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function setSaved(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

// Render Saved list with clickable items
function renderSavedList(){
  const saved = getSaved();
  savedList.innerHTML = '';
  if(!saved.length){ savedEmpty.style.display = 'block'; return; }
  savedEmpty.style.display = 'none';

  saved
    .sort((a,b)=> new Date(b.savedAt) - new Date(a.savedAt))
    .forEach(r => {
      const li = document.createElement('li');
      // left side: clickable name
     const open = document.createElement('span');
     open.className = 'saved-open';
     open.setAttribute('data-id', r.id);
     open.textContent = r.name;


      // right side: servings (muted)
      const right = document.createElement('span');
      right.className = 'muted';
      right.textContent = (r.servings ? `${r.servings} servings` : '');

      li.appendChild(open);
      li.appendChild(right);
      savedList.appendChild(li);
    });
}

// Click handler for Saved list
function onSavedListClick(e){
  const btn = e.target.closest('.saved-open');
  if(!btn) return;
  const id = btn.getAttribute('data-id');
  const saved = getSaved();
  const rec = saved.find(r => r.id === id);
  if(!rec) { say('Saved recipe not found.'); return; }
  openSavedRecipe(rec);
}

// Open a saved recipe into the Import view
function openSavedRecipe(rec){
  // Rebuild a minimal schema-like object
  const schema = {
    "@type": "Recipe",
    name: rec.name,
    recipeYield: String(rec.servings || 4),
    recipeIngredient: Array.isArray(rec.ingredients) ? rec.ingredients : [],
    recipeInstructions: Array.isArray(rec.instructions) ? rec.instructions : []
  };
  currentSourceUrl = rec.sourceUrl || '';
  renderRecipe(schema);
  showHome();
}

// ---------- navigation ----------
function showHome(){
  viewHome.classList.remove('hidden');
  viewSaved.classList.add('hidden');
  if (location.hash !== '' && location.hash !== '#/') history.replaceState(null,'','#/');
}
function showSaved(){
  viewHome.classList.add('hidden');
  viewSaved.classList.remove('hidden');
  if (location.hash !== '#/saved') history.replaceState(null,'','#/saved');
  renderSavedList();
}

// ---------- submit/import ----------
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
    currentSourceUrl = url;
    renderRecipe(payload.recipe);
  } catch (err) {
    console.error('Fetch to worker failed:', err);
    say(err?.name === 'AbortError' ? 'Worker timed out.' : 'Network error (see console).');
  } finally {
    window.__preptSetLoading?.(false);
  }
}

function onServingsChange(){ renderIngredients(); }

// Copy ingredients (uses current scaled list)
async function copyIngredients(){
  const lines = [...ingredientsList.querySelectorAll('li')].map(li => li.textContent.trim());
  try{ await navigator.clipboard.writeText(lines.join('\n')); say('Ingredients copied!'); }catch{ say('Could not copy.'); }
}

// Sample loader
loadSampleBtn?.addEventListener('click', async ()=>{
  try{
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    const node = Array.isArray(data) ? data.find(d => d['@type']==='Recipe') : (data['@type']==='Recipe' ? data : null);
    if(!node){ say('Sample missing a Recipe object.'); return; }
    currentSourceUrl = '';
    renderRecipe(node);
  }catch(e){ console.error(e); say('Could not load sample data.'); }
});


// ---------- Cook Mode (step-by-step) ----------
function toggleCookMode(){
  isCookMode = !isCookMode;
  if(isCookMode){ currentStepIndex = Math.min(currentStepIndex, Math.max(0, stepsList.children.length - 1)); }
  stepsToggleBtn.textContent = isCookMode ? 'List Mode' : 'Cook Mode';
  updateStepsView();
}

function updateStepsView(){
  if(!stepsList || !stepFocus || !stepFocusBody) return;
  if(isCookMode){
    stepsList.classList.add('hidden');
    stepFocus.classList.remove('hidden');
    renderStepFocus();
  } else {
    stepFocus.classList.add('hidden');
    stepsList.classList.remove('hidden');
  }
}

function renderStepFocus(){
  const total = stepsList.children.length;
  if(total === 0){
    stepFocusBody.innerHTML = '';
    if(stepCounter) stepCounter.textContent = '';
    if(stepPrev) stepPrev.disabled = true;
    if(stepNext) stepNext.disabled = true;
    return;
  }
  if(currentStepIndex < 0) currentStepIndex = 0;
  if(currentStepIndex > total - 1) currentStepIndex = total - 1;

  if(stepCounter){ stepCounter.textContent = `Step ${currentStepIndex + 1} of ${total}`; }

  const li = stepsList.children[currentStepIndex];
  stepFocusBody.innerHTML = li.innerHTML;

  if(stepPrev) stepPrev.disabled = (currentStepIndex === 0);
  if(stepNext) stepNext.disabled = (currentStepIndex === total - 1);
}

function stepGoto(idx){
  currentStepIndex = idx;
  renderStepFocus();
}

// ---------- centered modal for ingredient amounts ----------
const ingredientBackdrop = document.getElementById('ingredient-backdrop');
const ingredientModal = document.getElementById('ingredient-modal');
const ingredientModalClose = document.getElementById('ingredient-modal-close');
const ingredientModalBody = document.getElementById('ingredient-modal-body');

function showIngredientModal(msg){
  if(!ingredientModal || !ingredientBackdrop) return;
  ingredientModalBody.textContent = msg;
  ingredientModal.classList.remove('hidden');
  ingredientBackdrop.classList.add('show');
  ingredientBackdrop.setAttribute('aria-hidden','false');
  ingredientModalClose?.focus?.();
}
function hideIngredientModal(){
  ingredientModal?.classList.add('hidden');
  ingredientBackdrop?.classList.remove('show');
  ingredientBackdrop?.setAttribute('aria-hidden','true');
}
ingredientModalClose?.addEventListener('click', hideIngredientModal);
ingredientBackdrop?.addEventListener('click', hideIngredientModal);
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hideIngredientModal(); });


// Delegated fallback for Cook Mode controls (robust to dynamic DOM)
function __plaitCookDelegatedClick(e){
  const t = e.target;
  if (t.closest?.('#steps-toggle')) { e.preventDefault(); toggleCookMode(); }
  else if (t.closest?.('#step-prev')) { e.preventDefault(); stepGoto(currentStepIndex - 1); }
  else if (t.closest?.('#step-next')) { e.preventDefault(); stepGoto(currentStepIndex + 1); }
}
document.addEventListener('click', __plaitCookDelegatedClick);

// Groceries
const GROCERIES_KEY = 'plait.groceries';
const navGroceries = document.getElementById('nav-groceries');
const viewGroceries = document.getElementById('view-groceries');
const groceriesRoot = document.getElementById('groceries-root');
const groceriesEmpty = document.getElementById('groceries-empty');
const addToGroceriesBtn = document.getElementById('add-to-groceries');
const clearGroceriesBtn = document.getElementById('clear-groceries');

navGroceries?.addEventListener('click', (e)=>{ e.preventDefault(); showGroceries(); });
addToGroceriesBtn?.addEventListener('click', addCurrentIngredientsToGroceries);
clearGroceriesBtn?.addEventListener('click', ()=>{ setGroceries([]); renderGroceries(); say('Cleared.'); });

function getGroceries(){ try{ return JSON.parse(localStorage.getItem(GROCERIES_KEY)||'[]'); }catch{ return []; } }
function setGroceries(arr){ localStorage.setItem(GROCERIES_KEY, JSON.stringify(arr)); }

function showGroceries(){
  viewHome.classList.add('hidden');
  viewSaved.classList.add('hidden');
  viewGroceries.classList.remove('hidden');
  if(location.hash !== '#/groceries') history.replaceState(null,'','#/groceries');
  renderGroceries();
}

function addCurrentIngredientsToGroceries(){
  if(!parsedIngredients || !parsedIngredients.length){ say('No ingredients to add.'); return; }
  const lines = parsedIngredients.map(obj => {
    const qtyStr = (typeof obj.qty === 'number') ? obj.qty : '';
    const unitStr = obj.unit || '';
    const name = obj.name || obj.raw || '';
    return { raw: [qtyStr, unitStr, name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim(), name, unit: unitStr, qty: obj.qty || null, checked:false };
  });
  const existing = getGroceries();
  for(const it of lines){
    if(!existing.find(e => e.raw.toLowerCase() == it.raw.toLowerCase())) existing.push(it);
  }
  setGroceries(existing);
  say('Added to Groceries.');
}

function renderGroceries(){
  const items = getGroceries();
  groceriesRoot.innerHTML = '';
  if(!items.length){ groceriesEmpty.style.display='block'; return; }
  groceriesEmpty.style.display='none';
  const sections = categorizeGroceries(items);
  const order = ['Produce','Meat','Seafood','Dairy','Bakery','Pantry','Frozen','Beverages','Household','Other'];
  for(const name of order){
    const arr = sections[name]||[]; if(!arr.length) continue;
    const sec = document.createElement('div'); sec.className='gro-section';
    const h = document.createElement('h4'); h.textContent = name; sec.appendChild(h);
    const ul = document.createElement('ul'); ul.className='gro-list';
    for(const it of arr){
      const li = document.createElement('li'); li.className='gro-item' + (it.checked?' checked':'');
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=!!it.checked;
      const id = 'g-'+Math.random().toString(36).slice(2,8); cb.id=id;
      cb.addEventListener('change', ()=>{ it.checked = cb.checked; setGroceries(items); li.classList.toggle('checked', it.checked); });
      const label = document.createElement('label'); label.setAttribute('for', id); label.textContent = it.raw;
      li.appendChild(cb); li.appendChild(label); ul.appendChild(li);
    }
    sec.appendChild(ul); groceriesRoot.appendChild(sec);
  }
}

function categorizeGroceries(items){
  const map = {
    Produce: [/\b(apple|banana|orange|lemon|lime|cilantro|onion|garlic|tomato|pepper|jalape[ñn]o|lettuce|spinach|kale|carrot|potato|avocado|herb|basil|parsley|scallion|chive|cabbage|cucumber|zucchini|poblano|chile|chili)\b/i],
    Meat: [/\b(chicken|beef|pork|steak|ground beef|sausage|bacon|turkey)\b/i],
    Seafood: [/\b(shrimp|salmon|tuna|cod|tilapia|fish)\b/i],
    Dairy: [/\b(milk|cream|butter|cheese|yogurt|sour cream|half[- ]and[- ]half|mozzarella|cheddar|parmesan|cream cheese)\b/i],
    Bakery: [/\b(bread|bun|roll|bagel|tortilla|pita)\b/i],
    Pantry: [/\b(flour|sugar|salt|pepper|cumin|paprika|chili powder|oil|olive oil|vinegar|broth|stock|pasta|rice|beans|salsa|spice|seasoning|baking|yeast|vanilla|canned|can)\b/i],
    Frozen: [/\b(frozen|ice cream|peas|corn|fries)\b/i],
    Beverages: [/\b(juice|soda|coffee|tea)\b/i],
    Household: [/\b(paper towel|napkin|foil|wrap|soap|detergent)\b/i],
  };
  const sections = { Produce:[], Meat:[], Seafood:[], Dairy:[], Bakery:[], Pantry:[], Frozen:[], Beverages:[], Household:[], Other:[] };
  for(const it of items){
    let placed = false;
    for(const [sec, regs] of Object.entries(map)){
      if(regs.some(rx => rx.test(it.raw))){ sections[sec].push(it); placed = true; break; }
    }
    if(!placed) sections.Other.push(it);
  }
  return sections;
}
