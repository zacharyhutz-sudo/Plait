// Button loading state for Import
(function setupUI(){
  const importBtn = document.getElementById('import-btn');
  function setLoading(on){
    if(!importBtn) return;
    importBtn.classList.toggle('loading', !!on);
    importBtn.toggleAttribute('disabled', !!on);
  }
  window.__preptSetLoading = setLoading;
})();

// Sidebar toggle + close on nav
(function sidebar(){
  const btn = document.getElementById('sidebar-toggle');
  const close = document.getElementById('sidebar-close');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const navHome = document.getElementById('nav-home');
  const navSaved = document.getElementById('nav-saved');

  const open = ()=>{
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    sidebar.setAttribute('aria-hidden','false');
    backdrop.setAttribute('aria-hidden','false');
  };
  const hide = ()=>{
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    sidebar.setAttribute('aria-hidden','true');
    backdrop.setAttribute('aria-hidden','true');
  };

  btn?.addEventListener('click', open);
  close?.addEventListener('click', hide);
  backdrop?.addEventListener('click', hide);
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') hide(); });

  navHome?.addEventListener('click', hide);
  navSaved?.addEventListener('click', hide);
})();
