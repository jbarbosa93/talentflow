// Paramètres screen (profil par défaut)
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }

  const nav = [
    { id:'profil', label:'Profil', icon:'user', active:true },
    { id:'securite', label:'Sécurité', icon:'shield' },
    { id:'notifications', label:'Notifications', icon:'bell' },
    { id:'apparence', label:'Apparence', icon:'palette' },
    { id:'admin', label:'Administration', icon:'users-round' },
    { id:'logs', label:'Logs', icon:'file-text' },
    { id:'doublons', label:'Doublons', icon:'copy' },
    { id:'import', label:'Import masse', icon:'upload' },
  ];

  function render(){
    $('#screen-parametres').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Paramètres</h1>
          <p>Profil, sécurité, préférences et administration</p>
        </div>
      </div>

      <div class="params-layout">
        <aside class="params-nav">
          ${nav.map(n => `<div class="params-nav-item ${n.active?'active':''}">${iconHtml(n.icon)} ${n.label}</div>`).join('')}
        </aside>

        <div style="display:flex;flex-direction:column;gap:var(--gap)">
          <div class="card flush">
            <div class="card-head">
              <div><h3>Profil</h3><p>Informations affichées à tes collègues</p></div>
            </div>
            <div class="card-body">
              <div style="display:flex;gap:20px;align-items:center;margin-bottom:20px">
                <div class="avatar" style="width:72px;height:72px;font-size:26px">JB</div>
                <div>
                  <button class="btn">${iconHtml('camera')} Changer</button>
                  <button class="btn ghost">Supprimer</button>
                  <div style="font-size:11px;color:var(--text-3);margin-top:6px">PNG ou JPG, 2 Mo max.</div>
                </div>
              </div>

              <div class="form-grid">
                <div class="form-row"><label>Prénom</label><input class="input" value="João"/></div>
                <div class="form-row"><label>Nom</label><input class="input" value="Barbosa"/></div>
                <div class="form-row"><label>Email</label><input class="input" value="j.barbosa@l-agence.ch"/></div>
                <div class="form-row"><label>Téléphone</label><input class="input" value="+41 79 482 17 56"/></div>
                <div class="form-row"><label>Rôle</label><input class="input" value="Administrateur" disabled/></div>
                <div class="form-row"><label>Entreprise</label><input class="input" value="L'Agence SA"/></div>
              </div>
            </div>
          </div>

          <div class="card flush">
            <div class="card-head">
              <div><h3>Préférences</h3><p>Affichage et raccourcis</p></div>
            </div>
            <div class="card-body">
              ${[
                ['Thème sombre', 'Basculer entre light et dark', false, 'theme-toggle'],
                ['Animations riches', 'Stagger, transitions, micro-interactions', true],
                ['Raccourcis clavier', 'Activer ⌘K, G+D, etc.', true],
                ['Mode compact', 'Réduit les paddings pour densité maximale', true],
                ['Son notifications', 'Bip discret sur nouvelle alerte', false],
              ].map(([t,s,on,key]) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px dashed var(--border)">
                  <div>
                    <b style="font-size:13px">${t}</b>
                    <div style="font-size:12px;color:var(--text-3)">${s}</div>
                  </div>
                  <div class="toggle ${on?'on':''}" ${key?`data-key="${key}"`:''}></div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card flush">
            <div class="card-head">
              <div><h3>Session</h3><p>Sécurité et déconnexion</p></div>
            </div>
            <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn">${iconHtml('key-round')} Changer le mot de passe</button>
              <button class="btn">${iconHtml('smartphone')} Activer 2FA</button>
              <button class="btn ghost" style="color:var(--danger);margin-left:auto" onclick="window.TF_APP?.navigate('login')">${iconHtml('log-out')} Déconnexion</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Toggle interactions
    $('#screen-parametres').querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', () => {
        t.classList.toggle('on');
        if (t.dataset.key === 'theme-toggle'){
          const cur = document.documentElement.dataset.theme;
          window.TF_APP?.setTweak('theme', cur === 'dark' ? 'light' : 'dark');
        }
      });
    });
    $('#screen-parametres').querySelectorAll('.params-nav-item').forEach(it => {
      it.addEventListener('click', () => {
        $('#screen-parametres').querySelectorAll('.params-nav-item').forEach(x => x.classList.remove('active'));
        it.classList.add('active');
      });
    });
  }

  window.TF_PARAMETRES = { render };
})();
