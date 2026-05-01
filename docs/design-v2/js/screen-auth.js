// Pages d'authentification — register, reset, verify, invitation
(function(){
  const I = (n)=>`<i class="lucide lucide-${n}"></i>`;

  function authShell(title, sub, body, foot){
    return `<div class="login-wrap">
      <div class="login-art">
        <div class="login-art-inner">
          <div style="display:flex;gap:10px;align-items:center;color:#fff;font-weight:600">
            <div class="sb-brand-mark" style="width:32px;height:32px">
              <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#FFD400"/><path d="M17.5 6L9 18h6l-1 8 8.5-12h-6l1-8z" fill="#1C1A14"/></svg>
            </div>
            TalentFlow
          </div>
          <h1>L'agence <em>maline</em>.<br>Un CRM fait pour vous.</h1>
          <p>Suivez vos candidats, vos clients et vos missions sans jamais perdre une opportunité.</p>
        </div>
      </div>
      <div class="login-form-pane">
        <div class="login-card">
          <h2>${title}</h2>
          <p class="subtitle">${sub}</p>
          <div class="login-step">${body}</div>
          ${foot ? `<div class="auth-foot">${foot}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderRegister(){
    return authShell('Créer un compte','Demande d\'accès à votre espace L\'Agence',`
      <div class="form-grid">
        <div class="form-row"><label>Prénom</label><input class="input" placeholder="Marie"/></div>
        <div class="form-row"><label>Nom</label><input class="input" placeholder="Dupont"/></div>
      </div>
      <div class="form-row"><label>Email professionnel</label><input class="input" placeholder="m.dupont@l-agence.ch"/></div>
      <div class="form-row"><label>Téléphone</label><input class="input" placeholder="+41 …"/></div>
      <div class="form-row"><label>Rôle souhaité</label>
        <select class="input"><option>Consultant</option><option>Secrétaire</option><option>Administrateur</option></select>
      </div>
      <div class="form-row"><label>Mot de passe</label><input class="input" type="password"/></div>
      <button class="btn primary btn-block">${I('user-plus')} Demander l'accès</button>
      <div class="sep">ou</div>
      <button class="btn btn-block">${I('mail')} Continuer avec Microsoft 365</button>
    `, `Déjà un compte ? <a href="#" onclick="TF_APP.navigate('login');return false">Se connecter</a>`);
  }

  function renderReset(){
    return authShell('Mot de passe oublié','Entrez votre email — nous vous envoyons un lien sécurisé',`
      <div class="form-row"><label>Email</label><input class="input" placeholder="vous@l-agence.ch"/></div>
      <button class="btn primary btn-block">${I('mail')} Recevoir le lien</button>
      <div class="auth-info">${I('shield-check')} Le lien expire après 30 minutes.</div>
    `, `<a href="#" onclick="TF_APP.navigate('login');return false">← Retour à la connexion</a>`);
  }

  function renderVerify(){
    return authShell('Vérification email','Saisissez le code à 6 chiffres envoyé à <b>j.barbosa@l-agence.ch</b>',`
      <div class="otp-input">${[1,2,3,4,5,6].map(i=>`<input maxlength="1" value="${[7,4,2,9,1,3][i-1]||''}"/>`).join('')}</div>
      <button class="btn primary btn-block">${I('check-circle-2')} Vérifier</button>
      <div class="auth-info">Pas reçu ? <a href="#">Renvoyer dans 28s</a></div>
    `);
  }

  function renderInvitation(){
    return authShell('Vous êtes invité','<b>João Barbosa</b> vous invite à rejoindre <b>L\'Agence SA</b> sur TalentFlow',`
      <div class="invite-card">
        <div class="avatar md">JB</div>
        <div><b>João Barbosa</b><span class="t-3">Administrateur · L'Agence SA</span></div>
        <span class="chip green"><span class="dot"></span> Rôle : Consultant</span>
      </div>
      <div class="form-row"><label>Email (verrouillé)</label><input class="input" value="m.dupont@l-agence.ch" disabled/></div>
      <div class="form-row"><label>Choisissez un mot de passe</label><input class="input" type="password"/></div>
      <div class="form-row"><label>Confirmez</label><input class="input" type="password"/></div>
      <label class="check-row"><input type="checkbox" checked/> J'accepte les conditions et la politique RGPD/LPD</label>
      <button class="btn primary btn-block">${I('arrow-right')} Accepter et créer mon compte</button>
    `);
  }

  const VIEWS = { register:renderRegister, reset:renderReset, verify:renderVerify, invitation:renderInvitation };

  function render(view){
    const fn = VIEWS[view] || renderRegister;
    document.body.dataset.view = 'login';
    const root = document.getElementById('screen-login');
    root.innerHTML = fn();
    // hide shell
    document.getElementById('shell').style.display = 'none';
    root.style.display = 'block';
  }

  window.TF_AUTH = { render, VIEWS };
})();
