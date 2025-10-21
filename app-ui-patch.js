// UI helpers: loading state + checklist toggle
(function setupUI(){
  const importBtn = document.getElementById('import-btn');
  function setLoading(on){
    if(!importBtn) return;
    importBtn.classList.toggle('loading', !!on);
    importBtn.toggleAttribute('disabled', !!on);
  }
  // expose globally so we can use inside submit handler
  window.__preptSetLoading = setLoading;

  // toggle checklist items as 'done'
  const list = document.getElementById('grocery-list');
  if(list){
    list.addEventListener('click', (e)=>{
      const li = e.target.closest('li');
      if(li) li.classList.toggle('done');
    });
  }
})();
