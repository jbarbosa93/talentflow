// TalentFlow V2 — App orchestrator
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const STORAGE_KEY = 'tf-v2-state';

  const ALL_SCREENS = [
    'dashboard','candidats','fiche','parametres',
    'clients','client-fiche','missions','offres','pipeline',
    'matching','entretiens','messages','activites',
    'integrations','secretariat','outils','import',
  ];
  const AUTH_VIEWS = ['login','register','reset','verify','invitation'];

  const state = {
    view: 'app',
    screen: 'dashboard',
    ficheId: null,
    tweaks: { ...(window.TWEAK_DEFAULTS || {}) },
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved){ Object.assign(state, saved); Object.assign(state.tweaks, saved.tweaks||{}); }
  } catch {}

  function persist(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function applyTweaks(){
    const r = document.documentElement;
    Object.entries(state.tweaks).forEach(([k,v]) => { r.dataset[k] = v; });
  }

  function setTweak(key, val){
    state.tweaks[key] = val;
    applyTweaks();
    persist();
    render();
    if (!$('#tweaks').hidden) window.TF_TWEAKS.render();
    window.parent?.postMessage({ type:'__edit_mode_set_keys', edits: { [key]: val } }, '*');
  }

  function ensureScreenEl(id){
    let el = document.getElementById('screen-'+id);
    if (!el){
      el = document.createElement('section');
      el.id = 'screen-'+id;
      el.className = 'screen';
      el.dataset.screenLabel = id;
      el.hidden = true;
      $('#content').appendChild(el);
    }
    return el;
  }

  function navigate(screen, payload){
    // Auth views
    if (AUTH_VIEWS.includes(screen)){
      state.view = 'login';
      document.body.dataset.view = 'login';
      document.getElementById('shell').style.display = 'none';
      const loginEl = document.getElementById('screen-login');
      loginEl.style.display = 'block';
      if (screen === 'login'){
        window.TF_LOGIN.render();
      } else {
        window.TF_AUTH.render(screen);
      }
      persist();
      return;
    }
    state.view = 'app';
    document.body.dataset.view = 'app';
    document.getElementById('shell').style.display = '';
    document.getElementById('screen-login').style.display = 'none';

    state.screen = ALL_SCREENS.includes(screen) ? screen : 'dashboard';
    if (state.screen === 'fiche' && typeof payload === 'number'){
      state.ficheId = payload;
    }
    render();
    persist();
  }

  function openApp(){
    state.view = 'app';
    document.body.dataset.view = 'app';
    state.screen = 'dashboard';
    render();
    persist();
  }

  function render(){
    const s = state.screen;
    ensureScreenEl(s);
    ALL_SCREENS.forEach(id => {
      const el = document.getElementById('screen-'+id);
      if (el) el.hidden = (id !== s);
    });

    // Sidebar highlight: fiche stays on candidats, client-fiche on clients, import on outils
    const navMap = { fiche:'candidats', 'client-fiche':'clients', 'import':'outils' };
    const navKey = navMap[s] || s;
    window.TF_SHELL.renderSidebar(navKey);
    window.TF_SHELL.renderTopbar(s);

    // Native screens
    if (s === 'dashboard')  return window.TF_DASHBOARD.render();
    if (s === 'candidats')  return window.TF_CANDIDATS.render();
    if (s === 'fiche')      return window.TF_FICHE.render();
    if (s === 'parametres') return window.TF_PARAMETRES.render();

    // Extras (Clients, Missions, Offres, …)
    if (window.TF_EXTRAS && window.TF_EXTRAS.render(s)) return;
  }

  // Global keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k'){
      e.preventDefault();
      const sl = document.querySelector('.tb-search input'); if (sl) sl.focus();
    }
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey){
      window.__gPressed = true; setTimeout(()=>{ window.__gPressed=false; }, 600);
    }
    if (window.__gPressed){
      if (e.key === 'd') navigate('dashboard');
      if (e.key === 'c') navigate('candidats');
      if (e.key === 'p') navigate('parametres');
      if (e.key === 'f') navigate('fiche');
      if (e.key === 'l') navigate('login');
      if (e.key === 'm') navigate('matching');
    }
  });

  // Icon refresh
  let iconTimer = null;
  function refreshIcons(){
    if (!window.lucide) return;
    const nodes = document.querySelectorAll('i.lucide[class*="lucide-"]:not([data-lucide])');
    nodes.forEach(el => {
      const m = Array.from(el.classList).find(c => c.startsWith('lucide-') && c !== 'lucide');
      if (m){
        el.setAttribute('data-lucide', m.slice(7));
        el.classList.remove('lucide');
      }
    });
    try { window.lucide.createIcons(); } catch {}
  }
  function scheduleIconRefresh(){ clearTimeout(iconTimer); iconTimer = setTimeout(refreshIcons, 0); }
  const obs = new MutationObserver(() => scheduleIconRefresh());
  obs.observe(document.body, { childList:true, subtree:true });

  window.TF_APP = { navigate, setTweak, openApp, refreshIcons, getFicheId: () => state.ficheId };

  function boot(){
    applyTweaks();
    if (AUTH_VIEWS.includes(state.view)){
      navigate(state.view);
    } else {
      document.body.dataset.view = 'app';
      render();
    }
    window.TF_TWEAKS.addFab();
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
  }
  boot();
})();
