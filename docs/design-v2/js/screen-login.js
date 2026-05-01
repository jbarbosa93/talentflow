// Login screen
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }

  let step = 'email';

  function render(){
    const emailStep = `
      <div class="login-step" id="step-email">
        <h2>Bon retour.</h2>
        <p class="subtitle">Entre ton email L'Agence pour recevoir un code.</p>
        <div class="form-row">
          <label>Email professionnel</label>
          <input class="input" type="email" value="j.barbosa@l-agence.ch" placeholder="prenom@l-agence.ch"/>
        </div>
        <button class="btn primary btn-block" id="send-otp">${iconHtml('arrow-right')} Recevoir le code</button>
        <div class="sep">ou</div>
        <button class="btn btn-block">${iconHtml('chrome')} Continuer avec Microsoft 365</button>
        <button class="btn ghost btn-block" onclick="window.TF_APP?.openApp()" style="color:var(--accent)">${iconHtml('layout-dashboard')} Aller au dashboard (démo)</button>
        <div style="font-size:11.5px;color:var(--text-3);text-align:center;margin-top:10px">
          Problème de connexion ? <a style="color:var(--accent);text-decoration:underline">Demander l'accès</a>
        </div>
      </div>`;

    const otpStep = `
      <div class="login-step" id="step-otp" style="display:none">
        <h2>Un code t'attend.</h2>
        <p class="subtitle">Nous avons envoyé un code à 6 chiffres à <b>j.barbosa@l-agence.ch</b>.</p>
        <div class="otp-input">
          ${[0,1,2,3,4,5].map(i => `<input maxlength="1" data-i="${i}" inputmode="numeric"/>`).join('')}
        </div>
        <div style="font-size:11.5px;color:var(--text-3);text-align:center">Le code expire dans <b style="color:var(--text-2)" class="tnum" id="otp-timer">4:59</b></div>
        <button class="btn primary btn-block" onclick="window.TF_APP?.openApp()">${iconHtml('check')} Vérifier et entrer</button>
        <button class="btn ghost btn-block" id="back-email">${iconHtml('arrow-left')} Changer d'email</button>
        <button class="btn ghost btn-block" onclick="window.TF_APP?.openApp()" style="color:var(--accent)">${iconHtml('layout-dashboard')} Aller au dashboard (démo)</button>
      </div>`;

    $('#screen-login').innerHTML = `
      <div class="login-wrap">
        <div class="login-art">
          <div class="login-art-inner">
            <h1>Trouver la<br/>bonne personne,<br/><em>plus vite</em>.</h1>
            <p>TalentFlow centralise tes candidats, automatise le matching et élimine les doublons.</p>
          </div>
        </div>
        <div class="login-form-pane">
          <div class="login-card">
            ${emailStep}
            ${otpStep}
          </div>
        </div>
      </div>
    `;

    $('#send-otp').addEventListener('click', () => {
      $('#step-email').style.display = 'none';
      $('#step-otp').style.display = 'flex';
      setTimeout(()=> $('#step-otp input[data-i="0"]').focus(), 50);
    });
    $('#back-email').addEventListener('click', () => {
      $('#step-email').style.display = 'flex';
      $('#step-otp').style.display = 'none';
    });

    // OTP auto-advance
    $('#screen-login').querySelectorAll('.otp-input input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        if (e.target.value && e.target.nextElementSibling) e.target.nextElementSibling.focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling) e.target.previousElementSibling.focus();
      });
    });
  }

  window.TF_LOGIN = { render };
})();
