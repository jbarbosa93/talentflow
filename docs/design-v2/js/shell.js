// Shell : Sidebar + TopBar + nav

(function(){
  const $ = (s,r=document) => r.querySelector(s);

  const NAV_MAIN = [
    { id:'dashboard',    label:'Tableau de bord', icon:'layout-dashboard' },
    { id:'candidats',    label:'Candidats',       icon:'users',        badge:'12', dot:true },
    { id:'clients',      label:'Clients',         icon:'building-2',   badge:'3' },
    { id:'offres',       label:'Commandes',       icon:'briefcase',    badge:'27' },
    { id:'missions',     label:'Missions',        icon:'trending-up' },
    { id:'pipeline',     label:'Pipeline',        icon:'kanban-square' },
    { id:'matching',     label:'Matching IA',     icon:'sparkles',     badge:'Beta', accent:true },
    { id:'entretiens',   label:'Entretiens',      icon:'calendar-clock' },
    { id:'messages',     label:'Envois',          icon:'mail' },
    { id:'activites',    label:'Activité',        icon:'activity' },
  ];
  const NAV_FOOT = [
    { id:'integrations', label:'Intégrations', icon:'plug' },
    { id:'secretariat',  label:'Secrétariat',  icon:'phone-call' },
    { id:'outils',       label:'Outils',       icon:'wrench' },
    { id:'parametres',   label:'Paramètres',   icon:'settings' },
  ];

  function iconHtml(name){ return `<i class="lucide lucide-${name}"></i>`; }

  function renderSidebar(current='dashboard'){
    const main = NAV_MAIN.map((it,i) => {
      const badge = it.badge ? `<span class="sb-badge ${it.accent?'accent':''}">${it.badge}</span>` : '';
      const dot = it.dot ? '<span class="sb-badge dot"></span>' : '';
      return `<a class="sb-item ${current===it.id?'active':''}" data-nav="${it.id}" style="animation: slideIn var(--d-med) var(--ease-spring) ${i*30}ms backwards">
        ${iconHtml(it.icon)} <span>${it.label}</span> ${dot}${badge}
      </a>`;
    }).join('');
    const foot = NAV_FOOT.map((it)=>`<a class="sb-item ${current===it.id?'active':''}" data-nav="${it.id}">${iconHtml(it.icon)} <span>${it.label}</span></a>`).join('');

    $('#sidebar').innerHTML = `
      <div class="sb-brand">
        <div class="sb-brand-mark">
          <svg viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#tfGrad)"/>
            <path d="M17.5 6L9 18h6l-1 8 8.5-12h-6l1-8z" fill="#fff" stroke="#fff" stroke-width="0.5" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="tfGrad" x1="0" y1="0" x2="32" y2="32">
                <stop offset="0" stop-color="#FFD400"/>
                <stop offset="1" stop-color="#FFA500"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="sb-brand-name"><b>TalentFlow</b><span>L'Agence · v2</span></div>
      </div>
      <nav class="sb-nav">
        <div class="sb-group-title">Navigation</div>
        ${main}
        <div class="sb-group-title" style="margin-top: 10px">Configuration</div>
        ${foot}
      </nav>
      <div class="sb-footer">
        <div class="sb-footer-user">
          <div class="avatar">JB</div>
          <div class="u-meta"><b>João Barbosa</b><span>Administrateur</span></div>
        </div>
      </div>
    `;
    $('#sidebar').querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const id = el.dataset.nav;
        window.TF_APP?.navigate(id);
      });
    });
  }

  const TITLES = {
    dashboard:    { crumb:'Accueil',         title:'Tableau de bord' },
    candidats:    { crumb:'Base',            title:'Candidats' },
    fiche:        { crumb:'Candidats',       title:'Fiche candidat' },
    clients:      { crumb:'Comptes',         title:'Clients' },
    'client-fiche':{ crumb:'Clients',        title:'Fiche client' },
    offres:       { crumb:'Commercial',      title:'Commandes' },
    missions:     { crumb:'Postes',          title:'Missions' },
    pipeline:     { crumb:'Suivi',           title:'Pipeline' },
    matching:     { crumb:'IA',              title:'Matching' },
    entretiens:   { crumb:'Calendrier',      title:'Entretiens' },
    messages:     { crumb:'Communication',   title:'Envois' },
    activites:    { crumb:'Journal',         title:'Activité' },
    integrations: { crumb:'Configuration',   title:'Intégrations' },
    secretariat:  { crumb:'Configuration',   title:'Secrétariat' },
    outils:       { crumb:'Configuration',   title:'Outils' },
    'import':     { crumb:'Outils',          title:'Import en masse' },
    parametres:   { crumb:'Configuration',   title:'Paramètres' },
  };

  function renderTopbar(current='dashboard'){
    const t = TITLES[current] || TITLES.dashboard;
    $('#topbar').innerHTML = `
      <div class="tb-left">
        <button class="tb-btn icon" title="Replier" data-action="toggle-sidebar">${iconHtml('panel-left-close')}</button>
        <div>
          <div class="tb-crumb">${t.crumb} <span style="opacity:.5">/</span> <b>${t.title}</b></div>
        </div>
      </div>
      <label class="tb-search" style="justify-self: center; width: 100%; max-width: 440px">
        ${iconHtml('search')}
        <input placeholder="Rechercher un candidat, client, offre…" />
        <span class="kbd">⌘K</span>
      </label>
      <div class="tb-right">
        <button class="tb-btn icon" title="Thème" data-action="toggle-theme">${iconHtml('sun')}</button>
        <button class="tb-btn icon tb-notif" title="Notifications">${iconHtml('bell')}</button>
        <button class="tb-btn icon" title="Aide">${iconHtml('help-circle')}</button>
        <div style="width:1px;height:22px;background:var(--border);margin:0 4px"></div>
        <div class="avatar" style="width: 30px; height: 30px">JB</div>
      </div>
    `;
    $('#topbar [data-action="toggle-sidebar"]').addEventListener('click', () => {
      const cur = document.documentElement.dataset.sidebar || 'expanded';
      const nxt = cur === 'expanded' ? 'rail' : 'expanded';
      window.TF_APP?.setTweak('sidebar', nxt);
    });
    $('#topbar [data-action="toggle-theme"]').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'light';
      window.TF_APP?.setTweak('theme', cur === 'light' ? 'dark' : 'light');
    });
  }

  window.TF_SHELL = { renderSidebar, renderTopbar };
})();
