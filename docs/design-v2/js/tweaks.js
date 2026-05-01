// Tweaks panel
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }

  let editMode = false;

  function render(){
    const d = document.documentElement.dataset;
    const btn = (group, val, label, icon) => `<button data-group="${group}" data-val="${val}" class="${d[group]===val?'active':''}">${icon?iconHtml(icon)+' ':''}${label}</button>`;

    $('#tweaks').innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <h3>Tweaks</h3>
          <p class="sub">Ajuste le design en temps réel</p>
        </div>
        <button class="btn sm ghost" id="tw-close">${iconHtml('x')}</button>
      </div>

      <div class="tweak-group">
        <label>Thème</label>
        <div class="seg">
          ${btn('theme','light','Light','sun')}
          ${btn('theme','dark','Dark','moon')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Police</label>
        <div class="seg">
          ${btn('font','dm','DM Sans')}
          ${btn('font','inter','Inter')}
          ${btn('font','geist','Geist')}
          ${btn('font','plex','Plex')}
          ${btn('font','system','Sys')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Accent · L'Agence</label>
        <div class="seg">
          ${btn('accent','gold','Or')}
          ${btn('accent','amber','Ambre')}
          ${btn('accent','bronze','Bronze')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Densité</label>
        <div class="seg">
          ${btn('density','dense','Dense')}
          ${btn('density','confortable','Confort.')}
          ${btn('density','aere','Aéré')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Sidebar</label>
        <div class="seg">
          ${btn('sidebar','expanded','Étendue')}
          ${btn('sidebar','rail','Rail')}
          ${btn('sidebar','floating','Flottante')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Cards KPI</label>
        <div class="seg">
          ${btn('kpi','shadow','Ombrées')}
          ${btn('kpi','bordered','Bordées')}
          ${btn('kpi','flat','Plates')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Fiche candidat</label>
        <div class="seg">
          ${btn('fiche','3col','3 colonnes')}
          ${btn('fiche','2col','2 colonnes')}
        </div>
      </div>

      <div class="tweak-group">
        <label>Login</label>
        <div class="seg">
          ${btn('login','split','Split')}
          ${btn('login','centered','Centré')}
          ${btn('login','minimal','Minimal')}
        </div>
      </div>

      <div class="tw-nav-login">
        <button id="tw-goto-login">${iconHtml('log-in')} Voir Login</button>
        <button id="tw-goto-fiche">${iconHtml('user')} Voir Fiche</button>
      </div>
    `;

    $('#tweaks').addEventListener('click', (e) => {
      const b = e.target.closest('[data-group]'); if (!b) return;
      window.TF_APP?.setTweak(b.dataset.group, b.dataset.val);
    });
    $('#tw-close').addEventListener('click', close);
    $('#tw-goto-login').addEventListener('click', () => window.TF_APP?.navigate('login'));
    $('#tw-goto-fiche').addEventListener('click', () => window.TF_APP?.navigate('fiche'));
  }

  function open(){
    $('#tweaks').hidden = false;
    render();
  }
  function close(){
    $('#tweaks').hidden = true;
  }
  function toggle(){
    if ($('#tweaks').hidden) open(); else close();
  }

  // FAB button (always visible, unless edit mode host takes over)
  function addFab(){
    if ($('.tweaks-fab')) return;
    const fab = document.createElement('button');
    fab.className = 'tweaks-fab';
    fab.innerHTML = '<i class="lucide lucide-sliders-horizontal"></i>';
    fab.title = 'Tweaks';
    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);
  }

  // Edit mode protocol (host-integrated)
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === '__activate_edit_mode'){ editMode = true; open(); }
    if (msg.type === '__deactivate_edit_mode'){ editMode = false; close(); }
  });

  window.TF_TWEAKS = { open, close, toggle, render, addFab };
})();
