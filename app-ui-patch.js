// UI helpers + theme toggle
(function setupUI(){
  const importBtn = document.getElementById('import-btn');
  function setLoading(on){
    if(!importBtn) return;
    importBtn.classList.toggle('loading', !!on);
    importBtn.toggleAttribute('disabled', !!on);
  }
  window.__preptSetLoading = setLoading;
})();

// Theme toggle: system -> light -> dark -> system
(function themeToggle(){
  const KEY = "plait-theme";
  const btn = document.getElementById("theme-toggle");
  const apply = (v) => {
    document.documentElement.dataset.theme = v || "";
    localStorage.setItem(KEY, v || "");
  };
  const saved = localStorage.getItem(KEY) || "";
  apply(saved);
  btn?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "";
    apply(cur === "" ? "light" : cur === "light" ? "dark" : "");
    btn.blur();
  });
})();