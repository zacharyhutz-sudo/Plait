/**
 * Plait v0.5.2
 * Cleaned and organized for better maintainability.
 */

// --- Configuration & Constants ---
const WORKER_BASE = "https://prept-parse.zacharyhutz.workers.dev/?url=";
const STORAGE_KEY = "plait.savedRecipes";
const GROCERIES_KEY = "plait.groceries";

const UNIT_WORDS = [
  "teaspoon", "teaspoons", "tsp", "tablespoon", "tablespoons", "tbsp",
  "cup", "cups", "ounce", "ounces", "oz", "pound", "pounds", "lb", "lbs",
  "gram", "grams", "g", "kilogram", "kilograms", "kg", "milliliter", "milliliters", "ml",
  "liter", "liters", "l", "clove", "cloves", "pinch", "pinches", "dash", "dashes",
  "can", "cans", "package", "packages", "packet", "packets",
  "head", "heads", "stalk", "stalks", "ear", "ears", "slice", "slices"
];

const DESCRIPTORS = new Set([
  "fresh", "large", "small", "medium", "extra", "extra-large", "xl", "jumbo", "optional",
  "chopped", "minced", "diced", "shredded", "sliced", "crushed", "softened", "melted",
  "divided", "room-temperature", "room", "temperature", "to", "taste", "rinsed", "drained",
  "packed", "granulated", "powdered", "ground", "all-purpose", "kosher", "virgin",
  "toasted", "warm", "cold", "hot", "unsalted", "salted", "can", "cans", "bottle", "bottles", "jar", "jars"
]);

const ACTION_VERBS = new Set([
  "add", "adjust", "bake", "beat", "blend", "boil", "braise", "break", "bring", "broil",
  "brush", "brown", "char", "chill", "chop", "combine", "cool", "cover", "crack", "drain",
  "drizzle", "fold", "fry", "garnish", "grate", "grease", "grill", "heat", "knead", "let",
  "marinate", "mash", "microwave", "mix", "peel", "place", "poach", "pour", "preheat",
  "press", "reduce", "roast", "sauté", "saute", "season", "sear", "serve", "set", "sift",
  "simmer", "slice", "spoon", "spread", "sprinkle", "stir", "stir-fry", "strain", "toss",
  "transfer", "turn", "warm", "whisk", "wipe", "wrap", "remove", "top", "zest", "ladle", "shred", "pull"
]);

const LEADING_FILLERS = new Set(["then", "next", "now", "and"]);

// --- App State ---
const State = {
  baseServings: 4,
  parsedIngredients: [],
  currentRecipeSchema: null,
  currentSourceUrl: null,
  cook: {
    on: false,
    index: 0
  }
};

// --- DOM Elements ---
const El = {
  form: document.getElementById('import-form'),
  urlInput: document.getElementById('url'),
  loadSampleBtn: document.getElementById('load-sample'),
  recipeSection: document.getElementById('recipe'),
  titleEl: document.getElementById('recipe-title'),
  ingredientsList: document.getElementById('ingredients-list'),
  servingsInput: document.getElementById('servings'),
  messages: document.getElementById('messages'),
  copyBtn: document.getElementById('copy-ingredients'),
  saveBtn: document.getElementById('save-recipe'),
  exportRecipeBtn: document.getElementById('export-recipe'),
  stepsSection: document.getElementById('instructions'),
  stepsList: document.getElementById('steps-list'),
  viewHome: document.getElementById('view-home'),
  viewSaved: document.getElementById('view-saved'),
  savedList: document.getElementById('saved-list'),
  savedEmpty: document.getElementById('saved-empty'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  sidebarClose: document.getElementById('sidebar-close'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  navHome: document.getElementById('nav-home'),
  navSaved: document.getElementById('nav-saved'),
  refreshSavedBtn: document.getElementById('refresh-saved'),
  ingredientBackdrop: document.getElementById('ingredient-backdrop'),
  ingredientModal: document.getElementById('ingredient-modal'),
  ingredientModalClose: document.getElementById('ingredient-modal-close'),
  ingredientModalBody: document.getElementById('ingredient-modal-body'),
  navGroceries: document.getElementById('nav-groceries'),
  viewGroceries: document.getElementById('view-groceries'),
  groceriesRoot: document.getElementById('groceries-root'),
  groceriesEmpty: document.getElementById('groceries-empty'),
  addToGroceriesBtn: document.getElementById('add-to-groceries'),
  clearGroceriesBtn: document.getElementById('clear-groceries'),
  exportGroceriesBtn: document.getElementById('export-groceries'),
  // Cook Mode elements
  stepsToggleBtn: document.getElementById('steps-toggle'),
  stepFocus: document.getElementById('step-focus'),
  stepFocusBody: document.getElementById('step-focus-body'),
  stepPrev: document.getElementById('step-prev'),
  stepNext: document.getElementById('step-next'),
  stepCounter: document.getElementById('step-counter')
};

// --- Initialization ---
function init() {
  if (!El.form) {
    console.warn('Plait: #import-form not found — proceeding with partial init.');
  } else if (!El.form.__plaitBound) {
    El.form.addEventListener('submit', onSubmit);
    El.form.__plaitBound = true;
  }

  El.loadSampleBtn?.addEventListener('click', loadSample);
  El.copyBtn?.addEventListener('click', copyIngredients);
  El.servingsInput?.addEventListener('input', onServingsChange);
  El.stepsList?.addEventListener('click', onStepsClick);
  El.saveBtn?.addEventListener('click', onSaveRecipe);
  El.exportRecipeBtn?.addEventListener('click', onExportRecipe);
  El.refreshSavedBtn?.addEventListener('click', renderSavedList);
  El.savedList?.addEventListener('click', onSavedListClick);

  // Sidebar nav
  El.sidebarToggle?.addEventListener('click', toggleSidebar);
  El.sidebarClose?.addEventListener('click', closeSidebar);
  El.sidebarBackdrop?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && El.sidebar?.classList.contains('open')) closeSidebar();
  });

  El.navHome?.addEventListener('click', (e) => { e.preventDefault(); showHome(); });
  El.navSaved?.addEventListener('click', (e) => { e.preventDefault(); showSaved(); });

  // Ingredient checklist styling
  El.ingredientsList?.addEventListener('change', (e) => {
    if (e.target && e.target.matches('input[type="checkbox"]')) {
      const li = e.target.closest('li');
      li?.classList.toggle('checked', e.target.checked);
    }
  });

  // Groceries listeners
  El.navGroceries?.addEventListener('click', (e) => { e.preventDefault(); showGroceries(); });
  El.addToGroceriesBtn?.addEventListener('click', addCurrentIngredientsToGroceries);
  El.clearGroceriesBtn?.addEventListener('click', () => { setGroceries([]); renderGroceries(); showMessage('Cleared.'); });
  El.exportGroceriesBtn?.addEventListener('click', onExportGroceries);

  // Modal listeners
  El.ingredientModalClose?.addEventListener('click', hideIngredientModal);
  El.ingredientBackdrop?.addEventListener('click', hideIngredientModal);

  // Cook Mode setup
  cookSetup();

  // Loading state helper
  window.__preptSetLoading = (loading) => {
    const btn = document.getElementById('import-btn');
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
  };

  // Basic hash routing
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
}

function handleRouting() {
  const hash = location.hash;
  if (hash === '#/saved') showSaved();
  else if (hash === '#/groceries') showGroceries();
  else showHome();
}

// --- General Helpers ---
function showMessage(msg) {
  if (!El.messages) return;
  El.messages.textContent = msg;
  setTimeout(() => {
    if (El.messages.textContent === msg) El.messages.textContent = '';
  }, 3500);
}

function formatAmount(n) {
  const rounded = Math.round(n * 8) / 8;
  const whole = Math.floor(rounded + 1e-9);
  const frac = rounded - whole;
  const map = { 0: '', 0.125: '1/8', 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8' };
  const fracStr = map[Number(frac.toFixed(3))] || '';
  return (whole > 0 ? whole : '') + (whole > 0 && fracStr ? ' ' : '') + (fracStr || (whole ? '' : '0'));
}

function toNumber(q) {
  if (!q) return null;
  if (q.includes('/')) {
    const parts = q.trim().split(/\s+/);
    if (parts.length === 2) {
      const whole = parseFloat(parts[0]) || 0;
      const f = parts[1].split('/');
      return whole + (parseFloat(f[0]) / parseFloat(f[1]));
    }
    const f = q.split('/');
    return parseFloat(f[0]) / parseFloat(f[1]);
  }
  const n = parseFloat(q);
  return isNaN(n) ? null : n;
}

const normalizeKey = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const htmlEscape = (s) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// --- Navigation ---
function toggleSidebar() {
  if (!El.sidebar) return;
  const isOpen = El.sidebar.classList.toggle('open');
  El.sidebarBackdrop?.classList.toggle('show', isOpen);
}

function closeSidebar() {
  El.sidebar?.classList.remove('open');
  El.sidebarBackdrop?.classList.remove('show');
}

function showHome() {
  El.viewHome.classList.remove('hidden');
  El.viewSaved.classList.add('hidden');
  El.viewGroceries?.classList.add('hidden');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  El.navHome?.classList.add('active');
  closeSidebar();
  if (location.hash !== '' && location.hash !== '#/') history.replaceState(null, '', '#/');
}

function showSaved() {
  El.viewHome.classList.add('hidden');
  El.viewSaved.classList.remove('hidden');
  El.viewGroceries?.classList.add('hidden');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  El.navSaved?.classList.add('active');
  closeSidebar();
  if (location.hash !== '#/saved') history.replaceState(null, '', '#/saved');
  renderSavedList();
}

function showGroceries() {
  El.viewHome.classList.add('hidden');
  El.viewSaved.classList.add('hidden');
  El.viewGroceries?.classList.remove('hidden');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  El.navGroceries?.classList.add('active');
  closeSidebar();
  if (location.hash !== '#/groceries') history.replaceState(null, '', '#/groceries');
  renderGroceries();
}

// --- Parsing ---
function parseIngredient(line) {
  let raw = line.trim();
  const m = raw.match(/^\s*((?:\d+\s+)?\d*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s+(.*)$/);
  let qty = null, unit = "", rest = raw;
  if (m && m[1].trim()) {
    qty = toNumber(m[1]);
    rest = m[2].trim();
  }
  let tokens = rest.split(/\s+/);
  if (tokens.length) {
    const maybeUnit = tokens[0].toLowerCase();
    if (UNIT_WORDS.includes(maybeUnit)) { unit = tokens.shift(); }
  }
  const name = tokens.join(' ').trim() || rest;
  const variants = buildNameVariants(name);
  return {
    raw, qty, unit, name,
    key: normalizeKey(name),
    variants,
    keys: variants.map(v => normalizeKey(v))
  };
}

function buildNameVariants(name) {
  const noParen = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const beforeComma = noParen.split(',')[0].trim();
  
  // Split compound ingredients (e.g. "Salt and pepper" -> ["Salt", "pepper"])
  const segments = beforeComma.split(/\b(?:and|or|&|\/)\b/i).map(s => s.trim()).filter(Boolean);
  const allVariants = [name, noParen, beforeComma, ...segments];
  
  const results = new Set();
  for (const str of allVariants) {
    const filtered = str.split(/\s+/)
      .filter(tok => !DESCRIPTORS.has(tok.toLowerCase()))
      .join(' ')
      .trim();
    if (!filtered) continue;
    
    const parts = filtered.split(/\s+/).filter(Boolean);
    const head = parts.length ? parts[parts.length - 1] : filtered;
    
    // Core variants
    results.add(str);
    results.add(filtered);
    results.add(head);
    
    // Singular variants
    results.add(toSingular(str));
    results.add(toSingular(filtered));
    results.add(toSingular(head));
  }
  
  return [...results]
    .map(s => s.trim())
    .filter(s => s.length > 2) // Ignore tiny fragments like "a", "of"
    .sort((a, b) => b.length - a.length);
}

function toSingular(phrase) {
  const arr = (phrase || '').trim().split(/\s+/);
  if (!arr.length) return phrase || '';
  let s = arr[arr.length - 1];
  
  if (/ies$/i.test(s)) s = s.replace(/ies$/i, 'y');
  else if (/oes$/i.test(s)) s = s.replace(/es$/i, ''); // potatoes -> potato
  else if (/(xes|ches|shes|ses)$/i.test(s)) s = s.replace(/es$/i, '');
  else if (/ves$/i.test(s)) s = s.replace(/ves$/i, 'f'); // halves -> half
  else if (/s$/i.test(s) && !/ss$/i.test(s)) s = s.replace(/s$/i, '');
  
  arr[arr.length - 1] = s;
  return arr.join(' ');
}

function sentenceSplit(text) {
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

function startsWithVerbOrSecondWordVerb(sentence) {
  const cleaned = sentence.replace(/^[“"'\s]+/, '').trim();
  if (!cleaned) return false;
  const tokens = cleaned.split(/\s+/);
  const first = (tokens[0] || '').toLowerCase().replace(/^[^a-z]+|[^a-z]+$/gi, '');
  const second = (tokens[1] || '').toLowerCase().replace(/^[^a-z]+|[^a-z]+$/gi, '');
  return ACTION_VERBS.has(first) || (LEADING_FILLERS.has(first) && ACTION_VERBS.has(second));
}

function splitInstructionsArray(instructions) {
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

function normalizeRecipeInstructions(instructions) {
  const out = [];
  if (!instructions) return out;

  const handle = (node) => {
    if (!node) return;
    if (typeof node === 'string') {
      const t = node.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(node)) { node.forEach(handle); return; }
    if (typeof node === 'object') {
      if (node['@type'] === 'HowToSection' && Array.isArray(node.itemListElement)) {
        node.itemListElement.forEach(handle);
      } else if (node['@type'] === 'HowToStep') {
        handle(node.text || node.name || '');
        if (Array.isArray(node.itemListElement)) node.itemListElement.forEach(handle);
      } else {
        handle(node.text || node.name || node['@text'] || '');
        if (Array.isArray(node.itemListElement)) node.itemListElement.forEach(handle);
      }
    }
  };

  handle(instructions);
  return out;
}

function getStepsFromDOM() {
  const candidates = ['#recipe-steps li', '.recipe-steps li', '[data-step]', 'ol.instructions li', '.instructions li', '.method li'];
  for (const sel of candidates) {
    const els = Array.from(document.querySelectorAll(sel));
    const texts = els.map(el => el.textContent?.trim()).filter(Boolean);
    if (texts.length) return texts;
  }
  return [];
}

// --- Rendering ---
function renderRecipe(schema) {
  State.currentRecipeSchema = schema;
  const name = schema.name || 'Untitled Recipe';
  State.baseServings = parseInt(schema.recipeYield) || parseInt(schema.recipeServings) || 4;
  
  if (El.titleEl) El.titleEl.textContent = name;
  if (El.servingsInput) {
    El.servingsInput.value = State.baseServings;
    El.servingsInput.setAttribute('data-base', State.baseServings);
  }

  const ings = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
  State.parsedIngredients = ings.map(parseIngredient);

  renderIngredients();

  let stepsArr = normalizeRecipeInstructions(schema.recipeInstructions);
  if (stepsArr.length === 0) stepsArr = getStepsFromDOM();
  const splitSteps = splitInstructionsArray(stepsArr);
  renderSteps(splitSteps);

  State.cook.index = 0;
  cookUpdateView();
  El.recipeSection?.classList.remove('hidden');

  setTimeout(() => El.recipeSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function renderIngredients() {
  if (!El.ingredientsList) return;
  const factor = (parseInt(El.servingsInput.value) || State.baseServings) / (State.baseServings || 1);
  El.ingredientsList.innerHTML = '';
  
  State.parsedIngredients.forEach((obj, idx) => {
    const li = document.createElement('li');
    li.className = 'ingredient-item';

    const scaledQty = typeof obj.qty === 'number' ? obj.qty * factor : null;
    const qtyStr = scaledQty !== null ? formatAmount(scaledQty) : '';
    const unitStr = obj.unit ? (' ' + obj.unit) : '';
    const textLine = [qtyStr.trim(), unitStr.trim(), obj.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || obj.raw;

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
    El.ingredientsList.appendChild(li);
  });
}

function renderSteps(instructions) {
  if (!El.stepsList || !El.stepsSection) return;
  const arr = Array.isArray(instructions) ? instructions : [];
  El.stepsList.innerHTML = '';

  const variantMap = [];
  for (const ing of State.parsedIngredients) {
    for (const v of ing.variants) {
      const key = normalizeKey(v);
      if (key) variantMap.push({ text: v, key, ingRef: ing });
    }
  }
  // Greedily match longest variants first to handle "green onion" vs "onion"
  variantMap.sort((a, b) => b.text.length - a.text.length);

  for (const step of arr) {
    const matches = [];
    
    for (const { text, key } of variantMap) {
      // Allow flexible spacing/punctuation between words. 
      const regexText = text.split(/[\s\W]+/).map(escapeRegExp).join('[\\s\\W]+');
      // Permissive boundary check
      const re = new RegExp(`(^|[^a-zA-Z0-9])${regexText}([^a-zA-Z0-9]|$)`, 'gi');
      
      let m;
      while ((m = re.exec(step))) {
        const leadingBoundary = m[1] || '';
        const start = m.index + leadingBoundary.length;
        const label = m[0].substring(leadingBoundary.length, m[0].length - (m[2] || '').length);
        const end = start + label.length;
        
        matches.push({ start, end, label, key });
        re.lastIndex = m.index + 1; // Allow overlapping matches for resolution
      }
    }
    
    // Resolve overlaps: prioritize longest match, then earliest match
    matches.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    
    const filtered = [];
    const used = new Array(step.length).fill(false);
    
    for (const m of matches) {
      let isOverlap = false;
      for (let i = m.start; i < m.end; i++) {
        if (used[i]) { isOverlap = true; break; }
      }
      if (!isOverlap) {
        filtered.push(m);
        for (let i = m.start; i < m.end; i++) used[i] = true;
      }
    }
    
    // Rebuild step HTML
    filtered.sort((a, b) => a.start - b.start);
    let result = '';
    let pos = 0;
    for (const m of filtered) {
      result += htmlEscape(step.slice(pos, m.start));
      result += `<span class="ing-ref" data-key="${m.key}" role="button" tabindex="0">${htmlEscape(m.label)}</span>`;
      pos = m.end;
    }
    result += htmlEscape(step.slice(pos));
    
    const li = document.createElement('li');
    li.innerHTML = result;
    El.stepsList.appendChild(li);
  }
  
  El.stepsSection.classList.toggle('hidden', El.stepsList.children.length === 0);
  cookUpdateView();
}

// --- Interaction Handlers ---
function onServingsChange() { renderIngredients(); }

async function onSubmit(e) {
  e.preventDefault();
  const url = El.urlInput.value.trim();
  if (!url) { showMessage('Enter a recipe URL.'); return; }
  
  try {
    window.__preptSetLoading?.(true);
    const res = await fetch(WORKER_BASE + encodeURIComponent(url));
    const text = await res.text();
    let payload;
    try { 
      payload = JSON.parse(text); 
    } catch { 
      console.error('Worker non-JSON:', text); 
      showMessage('Worker error (see console).'); 
      return; 
    }
    
    if (!res.ok) { 
      console.error('Worker error:', res.status, payload); 
      showMessage(`Worker error ${res.status}: ${payload.error || 'Unknown error'}`); 
      return; 
    }
    
    if (!payload?.recipe) { showMessage('No recipe found at that URL.'); return; }
    
    State.currentSourceUrl = url;
    renderRecipe(payload.recipe);
  } catch (err) {
    console.error('Fetch to worker failed:', err);
    showMessage(err?.name === 'AbortError' ? 'Worker timed out.' : 'Network error (see console).');
  } finally {
    window.__preptSetLoading?.(false);
  }
}

async function loadSample() {
  try {
    const res = await fetch('./sample-data/example-recipe.json');
    const data = await res.json();
    const node = Array.isArray(data) ? data.find(d => d['@type'] === 'Recipe') : (data['@type'] === 'Recipe' ? data : null);
    if (!node) { showMessage('Sample missing a Recipe object.'); return; }
    State.currentSourceUrl = '';
    renderRecipe(node);
  } catch (e) {
    console.error(e);
    showMessage('Could not load sample data.');
  }
}

function onStepsClick(e) {
  const el = e.target.closest?.('.ing-ref');
  if (!el) return;
  const key = el.getAttribute('data-key');
  const ing = State.parsedIngredients.find(i => i.keys.includes(key)) || State.parsedIngredients.find(i => i.key === key);
  if (!ing) return;
  
  const factor = (parseInt(El.servingsInput.value) || State.baseServings) / (State.baseServings || 1);
  const qty = typeof ing.qty === 'number' ? ing.qty * factor : null;
  const amount = qty === null ? '—' : formatAmount(qty);
  const unit = ing.unit || '';
  showIngredientModal(`${ing.name} — ${amount} ${unit}`.trim());
}

async function copyIngredients() {
  const lines = [...El.ingredientsList.querySelectorAll('li')].map(li => li.textContent.trim());
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showMessage('Ingredients copied!');
  } catch {
    showMessage('Could not copy.');
  }
}

// --- Modals & Scroll Lock ---
const ScrollLock = (() => {
  const html = document.documentElement, body = document.body;
  let _lockCount = 0;
  function _apply() { html.style.overflow = 'hidden'; body.style.overscrollBehavior = 'contain'; }
  function _clear() { html.style.overflow = ''; body.style.overscrollBehavior = ''; }
  return {
    lock() { if (_lockCount++ === 0) _apply(); },
    unlock() { if (_lockCount > 0 && --_lockCount === 0) _clear(); },
    forceUnlock() { _lockCount = 0; _clear(); }
  };
})();
window.__ScrollLock = ScrollLock;

function showIngredientModal(msg) {
  if (!El.ingredientModal || !El.ingredientBackdrop) return;
  El.ingredientModalBody.textContent = msg;
  El.ingredientModal.classList.remove('hidden');
  El.ingredientBackdrop.classList.add('show');
  El.ingredientBackdrop.setAttribute('aria-hidden', 'false');
  ScrollLock.lock();
  
  const escHandler = (e) => { if (e.key === 'Escape') hideIngredientModal(); };
  document.addEventListener('keydown', escHandler, { once: true });
}

function hideIngredientModal() {
  El.ingredientModal?.classList.add('hidden');
  El.ingredientBackdrop?.classList.remove('show');
  El.ingredientBackdrop?.setAttribute('aria-hidden', 'true');
  ScrollLock.unlock();
}

// --- Persistence ---
const getSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const setSaved = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));

function onSaveRecipe() {
  if (!State.currentRecipeSchema) { showMessage('Import a recipe first.'); return; }
  const saved = getSaved();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: State.currentRecipeSchema.name || 'Untitled Recipe',
    servings: State.baseServings,
    ingredients: Array.isArray(State.currentRecipeSchema.recipeIngredient) ? State.currentRecipeSchema.recipeIngredient : [],
    instructions: Array.isArray(State.currentRecipeSchema.recipeInstructions) ? State.currentRecipeSchema.recipeInstructions : [],
    sourceUrl: State.currentSourceUrl || '',
    savedAt: new Date().toISOString()
  };
  
  if (saved.find(r => r.name === entry.name && r.ingredients?.length === entry.ingredients?.length)) {
    showMessage('Already saved.');
    return;
  }
  
  saved.push(entry);
  setSaved(saved);
  showMessage('Saved!');
  renderSavedList();
}

function renderSavedList() {
  if (!El.savedList) return;
  const saved = getSaved();
  El.savedList.innerHTML = '';
  
  if (!saved.length) {
    if (El.savedEmpty) El.savedEmpty.style.display = 'block';
    return;
  }
  if (El.savedEmpty) El.savedEmpty.style.display = 'none';

  saved.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).forEach(r => {
    const li = document.createElement('li');
    const open = document.createElement('span');
    open.className = 'saved-open';
    open.setAttribute('data-id', r.id);
    open.textContent = r.name;

    const right = document.createElement('span');
    right.className = 'muted';
    right.textContent = r.servings ? `${r.servings} servings` : '';

    li.appendChild(open);
    li.appendChild(right);
    El.savedList.appendChild(li);
  });
}

function onSavedListClick(e) {
  const btn = e.target.closest('.saved-open');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const saved = getSaved();
  const rec = saved.find(r => r.id === id);
  if (!rec) { showMessage('Saved recipe not found.'); return; }
  
  const schema = {
    "@type": "Recipe",
    name: rec.name,
    recipeYield: String(rec.servings || 4),
    recipeIngredient: rec.ingredients || [],
    recipeInstructions: rec.instructions || []
  };
  State.currentSourceUrl = rec.sourceUrl || '';
  renderRecipe(schema);
  showHome();
}

// --- Groceries ---
const getGroceries = () => { try { return JSON.parse(localStorage.getItem(GROCERIES_KEY) || '[]'); } catch { return []; } };
const setGroceries = (arr) => localStorage.setItem(GROCERIES_KEY, JSON.stringify(arr));

function addCurrentIngredientsToGroceries() {
  if (!State.parsedIngredients.length) { showMessage('No ingredients to add.'); return; }
  const factor = (parseInt(El.servingsInput.value) || State.baseServings) / (State.baseServings || 1);
  const lines = State.parsedIngredients.map(obj => {
    const qtyNum = typeof obj.qty === 'number' ? obj.qty * factor : null;
    const qtyStr = qtyNum !== null ? formatAmount(qtyNum) : '';
    const raw = [qtyStr, obj.unit || '', obj.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return { raw, name: obj.name, unit: obj.unit, qty: qtyNum, checked: false };
  });
  
  const existing = getGroceries();
  lines.forEach(it => {
    if (!existing.find(e => (e.raw || '').toLowerCase() === it.raw.toLowerCase())) existing.push(it);
  });
  setGroceries(existing);
  showMessage('Added to Groceries.');
}

function renderGroceries() {
  if (!El.groceriesRoot) return;
  const items = getGroceries();
  El.groceriesRoot.innerHTML = '';
  
  if (!items.length) {
    if (El.groceriesEmpty) El.groceriesEmpty.style.display = 'block';
    return;
  }
  if (El.groceriesEmpty) El.groceriesEmpty.style.display = 'none';

  const sections = categorizeGroceries(items);
  const order = ['Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Household', 'Other'];
  
  order.forEach(name => {
    const arr = sections[name] || [];
    if (!arr.length) return;
    
    const sec = document.createElement('div');
    sec.className = 'gro-section';
    const h = document.createElement('h4');
    h.textContent = name;
    sec.appendChild(h);
    
    const ul = document.createElement('ul');
    ul.className = 'gro-list';
    arr.forEach(it => {
      const li = document.createElement('li');
      li.className = 'gro-item' + (it.checked ? ' checked' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.checked;
      const id = 'g-' + Math.random().toString(36).slice(2, 8);
      cb.id = id;
      cb.addEventListener('change', () => {
        it.checked = cb.checked;
        setGroceries(items);
        li.classList.toggle('checked', it.checked);
      });
      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = it.raw;
      li.appendChild(cb);
      li.appendChild(label);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    El.groceriesRoot.appendChild(sec);
  });
}

function categorizeGroceries(items) {
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
  const sections = { Produce: [], Meat: [], Seafood: [], Dairy: [], Bakery: [], Pantry: [], Frozen: [], Beverages: [], Household: [], Other: [] };
  items.forEach(it => {
    let placed = false;
    for (const [sec, regs] of Object.entries(map)) {
      if (regs.some(rx => rx.test(it.raw))) {
        sections[sec].push(it);
        placed = true;
        break;
      }
    }
    if (!placed) sections.Other.push(it);
  });
  return sections;
}

// --- Cook Mode ---
function cookSetup() {
  El.stepsToggleBtn?.addEventListener('click', cookToggle);
  El.stepPrev?.addEventListener('click', () => cookGoto(State.cook.index - 1));
  El.stepNext?.addEventListener('click', () => cookGoto(State.cook.index + 1));
  El.stepFocusBody?.addEventListener('click', onStepsClick);

  window.addEventListener('keydown', (e) => {
    if (!State.cook.on) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); cookGoto(State.cook.index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); cookGoto(State.cook.index + 1); }
  });
}

function cookToggle() {
  const count = El.stepsList?.children?.length || 0;
  if (!count) { showMessage('No steps found to show in Cook Mode.'); return; }
  State.cook.on = !State.cook.on;
  if (El.stepsToggleBtn) El.stepsToggleBtn.textContent = State.cook.on ? 'List Mode' : 'Cook Mode';
  cookUpdateView();
}

function cookUpdateView() {
  const count = El.stepsList?.children?.length || 0;
  if (!count) {
    El.stepFocus?.classList.add('hidden');
    El.stepsList?.classList.remove('hidden');
    return;
  }
  
  State.cook.index = Math.max(0, Math.min(State.cook.index, count - 1));

  if (State.cook.on) {
    El.stepsList?.classList.add('hidden');
    El.stepFocus?.classList.remove('hidden');
    cookRender();
    setTimeout(() => {
      El.stepFocus?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  } else {
    El.stepFocus?.classList.add('hidden');
    El.stepsList?.classList.remove('hidden');
  }
}

function cookRender() {
  const count = El.stepsList.children.length;
  if (!count) return;
  const li = El.stepsList.children[State.cook.index];
  if (El.stepCounter) El.stepCounter.textContent = `Step ${State.cook.index + 1} of ${count}`;
  if (El.stepFocusBody) El.stepFocusBody.innerHTML = li.innerHTML;
  if (El.stepPrev) El.stepPrev.disabled = (State.cook.index === 0);
  if (El.stepNext) El.stepNext.disabled = (State.cook.index === count - 1);
}

function cookGoto(i) {
  State.cook.index = i;
  cookRender();
}

// --- Exports ---
async function shareOrCopy(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      showMessage('Shared!');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showMessage('Copied to clipboard!');
  } catch {
    showMessage('Could not share or copy.');
  }
}

function onExportRecipe() {
  if (!State.currentRecipeSchema) { showMessage('Import a recipe first.'); return; }
  const title = State.currentRecipeSchema.name || 'Recipe';
  const factor = (parseInt(El.servingsInput.value) || State.baseServings) / (State.baseServings || 1);
  const ingredientLines = State.parsedIngredients.map(obj => {
    const qtyNum = typeof obj.qty === 'number' ? obj.qty * factor : null;
    const qtyStr = qtyNum !== null ? formatAmount(qtyNum) : '';
    return `• ${[qtyStr.trim(), obj.unit || '', obj.name].filter(Boolean).join(' ').trim() || obj.raw}`;
  });
  const stepLines = [...(El.stepsList?.children || [])].map((li, i) => `${i + 1}. ${li.textContent.trim()}`);
  
  let note = `${title}\nServings: ${El.servingsInput.value}\n\nINGREDIENTS\n${ingredientLines.join('\n')}\n\n`;
  if (stepLines.length) note += `STEPS\n${stepLines.join('\n')}\n`;
  if (State.currentSourceUrl) note += `\nSource: ${State.currentSourceUrl}`;
  
  shareOrCopy(title, note);
}

function onExportGroceries() {
  const items = getGroceries();
  if (!items.length) { showMessage('Grocery list is empty.'); return; }
  const sections = categorizeGroceries(items);
  const order = ['Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Household', 'Other'];
  
  let note = 'Grocery List\n\n';
  order.forEach(name => {
    const arr = sections[name] || [];
    if (!arr.length) return;
    note += `${name.toUpperCase()}\n`;
    arr.forEach(it => { note += `${it.checked ? '✓' : '○'} ${it.raw}\n`; });
    note += '\n';
  });
  
  shareOrCopy('Grocery List', note.trim());
}

// --- Header Scroll State ---
(() => {
  const onScroll = () => {
    document.body.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Bootstrap
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
