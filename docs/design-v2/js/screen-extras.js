// TalentFlow V2 — Toutes les pages additionnelles (Clients, Missions, Offres,
// Pipeline, Matching, Entretiens, Messages, Activités, Intégrations, Outils,
// Import en masse, Secrétariat) + sous-pages.
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const I = (n)=>`<i class="lucide lucide-${n}"></i>`;

  // ---------- Helpers shared ----------
  function pageHead(title, sub, actions=''){
    return `<div class="page-head">
      <div><h1>${title}</h1><p>${sub}</p></div>
      <div class="page-actions">${actions}</div>
    </div>`;
  }

  function kpiStrip(items){
    return `<div class="kpi-strip">${items.map(k => `
      <div class="kpi-mini">
        <div class="kpi-mini-icon ${k.tone||''}">${I(k.icon)}</div>
        <div>
          <div class="kpi-mini-label">${k.label}</div>
          <div class="kpi-mini-value">${k.value}</div>
        </div>
        ${k.delta ? `<span class="kpi-delta ${k.dir||'up'}">${k.delta}</span>`:''}
      </div>`).join('')}</div>`;
  }

  function emptyState(icon, title, sub){
    return `<div class="empty-state">
      <div class="empty-icon">${I(icon)}</div>
      <h3>${title}</h3><p>${sub}</p>
    </div>`;
  }

  // =====================================================
  // CLIENTS
  // =====================================================
  const clients = [
    { id:1, nom:'Rossetti SA',           secteur:'Construction', ville:'Monthey',  contacts:3, missions:8,  ca:'CHF 124k', statut:'actif',  tag:'gold' },
    { id:2, nom:'Boulanger Construction',secteur:'Construction', ville:'Sion',     contacts:2, missions:5,  ca:'CHF 88k',  statut:'actif',  tag:'gold' },
    { id:3, nom:'Hôpital du Valais',     secteur:'Santé',        ville:'Sion',     contacts:5, missions:12, ca:'CHF 210k', statut:'actif',  tag:'platine' },
    { id:4, nom:'Migros Valais',         secteur:'Logistique',   ville:'Martigny', contacts:4, missions:6,  ca:'CHF 95k',  statut:'actif',  tag:'argent' },
    { id:5, nom:'BTP Lavaux',            secteur:'Construction', ville:'Vevey',    contacts:1, missions:2,  ca:'CHF 18k',  statut:'pause',  tag:'' },
    { id:6, nom:'Lemanis Hôtels SA',     secteur:'Hôtellerie',   ville:'Lausanne', contacts:2, missions:3,  ca:'CHF 42k',  statut:'actif',  tag:'argent' },
    { id:7, nom:'CFF Cargo',             secteur:'Logistique',   ville:'Yverdon',  contacts:6, missions:9,  ca:'CHF 168k', statut:'actif',  tag:'platine' },
    { id:8, nom:'Garage du Rhône',       secteur:'Automobile',   ville:'Sion',     contacts:1, missions:1,  ca:'CHF 12k',  statut:'prospect',tag:'' },
    { id:9, nom:'Polyclinique du Léman', secteur:'Santé',        ville:'Genève',   contacts:3, missions:4,  ca:'CHF 64k',  statut:'actif',  tag:'argent' },
    { id:10,nom:'Constructa SA',         secteur:'Construction', ville:'Bulle',    contacts:2, missions:3,  ca:'CHF 38k',  statut:'actif',  tag:'' },
  ];

  function renderClients(){
    const kpis = [
      { label:'Clients actifs', value:'1 247', delta:'+12', icon:'building-2', tone:'blue' },
      { label:'Prospects',      value:'68',    delta:'+9',  icon:'sparkles',   tone:'' },
      { label:'CA cumulé · 2026', value:'CHF 4.8M', delta:'+18%', icon:'trending-up', tone:'green' },
      { label:'Contacts',       value:'2 894', delta:'+24',  icon:'users',     tone:'purple' },
    ];
    const rows = clients.map(c => `
      <tr data-cid="${c.id}">
        <td><input type="checkbox"></td>
        <td>
          <div class="cand-cell">
            <div class="logo-tile">${c.nom.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
            <div>
              <div class="cand-name">${c.nom} ${c.tag?`<span class="badge-tag ${c.tag}">${c.tag}</span>`:''}</div>
              <div class="cand-sub">${c.secteur} · ${c.ville}</div>
            </div>
          </div>
        </td>
        <td>${c.contacts}</td>
        <td>${c.missions}</td>
        <td class="tnum">${c.ca}</td>
        <td><span class="chip ${c.statut==='actif'?'green':c.statut==='pause'?'amber':'slate'}"><span class="dot"></span> ${c.statut}</span></td>
        <td><div class="row-actions"><button>${I('eye')}</button><button>${I('phone')}</button><button>${I('more-horizontal')}</button></div></td>
      </tr>`).join('');

    return pageHead('Clients', 'Comptes, contacts, missions et facturation',
      `<button class="btn ghost">${I('download')} Exporter</button>
       <button class="btn primary">${I('plus')} Nouveau client</button>`)
      + kpiStrip(kpis)
      + `<div class="cand-filters" style="margin-top:14px">
          <div class="seg"><button class="active">Tous</button><button>Actifs</button><button>Prospects</button><button>En pause</button></div>
          <button class="pill-btn">${I('filter')} Secteur</button>
          <button class="pill-btn">${I('map-pin')} Région</button>
          <div style="flex:1"></div>
          <label class="tb-search" style="height:32px"><input placeholder="Rechercher un client…">${I('search')}</label>
        </div>
        <div class="table-wrap">
          <table class="ctable">
            <thead><tr><th style="width:36px"><input type="checkbox"></th><th>Client</th><th>Contacts</th><th>Missions</th><th>CA · 2026</th><th>Statut</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="table-foot">
            <span>Affichage <b>1–10</b> sur <b>1 247</b></span>
            <div class="pager"><button>${I('chevron-left')}</button><button class="active">1</button><button>2</button><button>3</button><button>…</button><button>125</button><button>${I('chevron-right')}</button></div>
          </div>
        </div>`;
  }

  function renderClientFiche(){
    const c = clients[0];
    return pageHead(c.nom, `${c.secteur} · ${c.ville}`,
      `<button class="btn ghost" onclick="TF_APP.navigate('clients')">${I('arrow-left')} Retour</button>
       <button class="btn">${I('mail')} Contacter</button>
       <button class="btn primary">${I('plus')} Nouvelle commande</button>`)
      + `<div class="client-grid">
          <div class="card flush">
            <div class="card-head"><h3>Informations</h3><button class="btn sm ghost">${I('pencil')}</button></div>
            <div class="card-body">
              <dl style="margin:0">
                <div class="info-row"><dt>Raison sociale</dt><dd>${c.nom}</dd></div>
                <div class="info-row"><dt>Secteur</dt><dd>${c.secteur}</dd></div>
                <div class="info-row"><dt>Adresse</dt><dd>Route Industrielle 12, ${c.ville}</dd></div>
                <div class="info-row"><dt>IDE</dt><dd>CHE-123.456.789</dd></div>
                <div class="info-row"><dt>Site</dt><dd><a href="#">www.rossetti.ch</a></dd></div>
                <div class="info-row"><dt>Tag</dt><dd><span class="badge-tag gold">Compte gold</span></dd></div>
              </dl>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--gap)">
            ${kpiStrip([
              { label:'Missions ouvertes', value:'8', icon:'briefcase', tone:'green' },
              { label:'Candidats placés', value:'34', icon:'user-check', tone:'' },
              { label:'CA · 2026', value:'CHF 124k', delta:'+22%', icon:'trending-up', tone:'blue' },
              { label:'Marge', value:'18.4%', icon:'percent', tone:'purple' },
            ])}
            <div class="card flush">
              <div class="card-head"><h3>Contacts</h3><button class="btn sm">${I('plus')} Ajouter</button></div>
              <div class="card-body" style="padding:0">
                ${[
                  ['Marc Rossetti','Directeur','+41 27 322 14 88','m.rossetti@rossetti.ch'],
                  ['Anna Petit','RH','+41 27 322 14 92','a.petit@rossetti.ch'],
                  ['Tom Meier','Chef chantier','+41 79 412 88 21','t.meier@rossetti.ch'],
                ].map(([n,r,t,e])=>`
                  <div class="contact-row">
                    <div class="avatar">${n.split(' ').map(x=>x[0]).join('')}</div>
                    <div><b>${n}</b><span>${r}</span></div>
                    <div class="t-3">${t}</div>
                    <div class="t-3">${e}</div>
                    <div class="row-actions"><button>${I('phone')}</button><button>${I('mail')}</button></div>
                  </div>`).join('')}
              </div>
            </div>
            <div class="card flush">
              <div class="card-head"><h3>Missions en cours</h3><a href="#" class="t-3" onclick="TF_APP.navigate('missions');return false">Tout voir →</a></div>
              <div class="card-body">
                ${[
                  ['#2844','Maçon qualifié','3 postes','En cours','green'],
                  ['#2891','Carreleur','1 poste','Match en cours','amber'],
                  ['#2902','Chauffeur PL','2 postes','Nouveau','blue'],
                ].map(([id,m,p,s,t])=>`
                  <div class="line-row">
                    <b>${id}</b><span>${m}</span><span class="t-3">${p}</span>
                    <span class="chip ${t}"><span class="dot"></span> ${s}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
  }

  // =====================================================
  // MISSIONS
  // =====================================================
  function renderMissions(){
    const missions = [
      ['#2844','Maçon qualifié','Rossetti SA','Monthey','3','01.05','Long terme','green','En cours'],
      ['#2891','Carreleur expérimenté','Boulanger Construction','Sion','1','15.05','Mission 6 mois','amber','Match'],
      ['#2902','Chauffeur PL — CE','CFF Cargo','Yverdon','2','22.04','CDI','blue','Nouveau'],
      ['#2855','Aide-soignant(e)','Hôpital du Valais','Sion','5','01.06','CDD 12 mois','green','En cours'],
      ['#2867','Cariste CACES','Migros Valais','Martigny','2','12.05','Intérim 3 mois','green','En cours'],
      ['#2877','Soudeur TIG','Constructa SA','Bulle','1','08.05','Long terme','amber','Match'],
      ['#2845','Peintre bâtiment','BTP Lavaux','Vevey','2','—','—','red','Annulée'],
      ['#2898','Électricien','Rossetti SA','Monthey','1','30.04','CDI','blue','Nouveau'],
    ];

    return pageHead('Missions', 'Postes ouverts, statut, équipes engagées',
      `<button class="btn ghost">${I('download')} Exporter</button>
       <button class="btn primary">${I('plus')} Nouvelle mission</button>`)
      + kpiStrip([
        { label:'Missions ouvertes', value:'312', delta:'+18', icon:'briefcase', tone:'green' },
        { label:'Postes à pourvoir', value:'487', delta:'+32', icon:'user-plus', tone:'blue' },
        { label:'En match',         value:'68',  delta:'+5',  icon:'sparkles', tone:'' },
        { label:'Taux placement',   value:'72%', delta:'+4%', icon:'target',  tone:'purple' },
      ])
      + `<div class="cand-filters" style="margin-top:14px">
          <div class="seg"><button class="active">Toutes</button><button>Ouvertes</button><button>En match</button><button>Pourvues</button><button>Annulées</button></div>
          <button class="pill-btn">${I('briefcase')} Métier</button>
          <button class="pill-btn">${I('building-2')} Client</button>
          <div style="flex:1"></div>
          <label class="tb-search" style="height:32px"><input placeholder="Référence, poste, client…">${I('search')}</label>
        </div>
        <div class="table-wrap">
          <table class="ctable">
            <thead><tr><th>Réf.</th><th>Poste</th><th>Client</th><th>Lieu</th><th>Postes</th><th>Début</th><th>Type</th><th>Statut</th></tr></thead>
            <tbody>
              ${missions.map(([ref,poste,cli,loc,n,deb,type,t,s])=>`
                <tr><td><b>${ref}</b></td><td>${poste}</td><td>${cli}</td><td>${loc}</td>
                <td class="tnum">${n}</td><td>${deb}</td><td class="t-3">${type}</td>
                <td><span class="chip ${t}"><span class="dot"></span> ${s}</span></td></tr>`).join('')}
            </tbody>
          </table>
        </div>`;
  }

  // =====================================================
  // OFFRES / COMMANDES
  // =====================================================
  function renderOffres(){
    const offres = [
      ['#OFF-2844','Rossetti SA','Maçon × 3','Acceptée','green','22.04','12.05','CHF 84 000'],
      ['#OFF-2845','BTP Lavaux','Peintre × 2','Refusée','red','19.04','—','CHF 0'],
      ['#OFF-2891','Boulanger SA','Carreleur × 1','En attente','amber','21.04','25.04','CHF 28 000'],
      ['#OFF-2902','CFF Cargo','Chauffeur PL × 2','Acceptée','green','18.04','22.04','CHF 56 000'],
      ['#OFF-2898','Rossetti SA','Électricien × 1','Brouillon','slate','—','—','CHF 32 000'],
    ];

    return pageHead('Commandes', 'Offres commerciales, devis et bons de commande',
      `<button class="btn primary">${I('plus')} Nouvelle commande</button>`)
      + kpiStrip([
        { label:'En cours', value:'27', delta:'+4', icon:'briefcase', tone:'' },
        { label:'Acceptées', value:'18', delta:'+6', icon:'check-circle-2', tone:'green' },
        { label:'En attente', value:'7', icon:'clock', tone:'' },
        { label:'CA potentiel', value:'CHF 480k', delta:'+18%', icon:'trending-up', tone:'blue' },
      ])
      + `<div class="table-wrap" style="margin-top:14px">
        <table class="ctable">
          <thead><tr><th>Réf.</th><th>Client</th><th>Objet</th><th>Statut</th><th>Émise</th><th>Démarrage</th><th>Montant</th></tr></thead>
          <tbody>
            ${offres.map(([ref,c,o,s,t,e,d,m])=>`
              <tr><td><b>${ref}</b></td><td>${c}</td><td>${o}</td>
              <td><span class="chip ${t}"><span class="dot"></span> ${s}</span></td>
              <td>${e}</td><td>${d}</td><td class="tnum">${m}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // =====================================================
  // PIPELINE (kanban)
  // =====================================================
  function renderPipeline(){
    const cols = [
      ['Nouveau','slate', [
        ['Pedro Ferreira','Maçon · Rossetti SA','94','PF'],
        ['Maria da Silva','Aide-soignante · Hôpital','82','MS'],
        ['Luís Costa','Cariste · Migros','71','LC'],
      ]],
      ['Contacté','blue', [
        ['Sofia Pereira','Carreleur · Boulanger','88','SP'],
        ['Miguel Rodrigues','Chauffeur PL · CFF','79','MR'],
      ]],
      ['Entretien','amber', [
        ['João Martins','Électricien · Rossetti','91','JM'],
        ['Carla Reis','Peintre · BTP Lavaux','67','CR'],
        ['Antonio Santos','Soudeur · Constructa','85','AS'],
      ]],
      ['Placé','green', [
        ['Beatriz Lopes','Carreleur · Boulanger','93','BL'],
        ['Tiago Bernardes','Maçon · Rossetti','86','TB'],
      ]],
      ['Refusé','red', [
        ['Bruno Machado','Logisticien · Migros','58','BM'],
      ]],
    ];

    return pageHead('Pipeline', 'Suivi visuel des candidats par étape',
      `<div class="seg"><button class="active">Tous</button><button>Mes candidats</button><button>João</button><button>Seb</button><button>Noémie</button></div>
       <button class="btn primary">${I('plus')} Ajouter</button>`)
      + `<div class="kanban">
        ${cols.map(([title,t,cards])=>`
          <div class="kb-col">
            <div class="kb-head">
              <span class="chip ${t}"><span class="dot"></span> ${title}</span>
              <span class="t-3 tnum">${cards.length}</span>
            </div>
            <div class="kb-body">
              ${cards.map(([n,m,sc,ini])=>`
                <div class="kb-card">
                  <div class="kb-card-top">
                    <div class="avatar sm">${ini}</div>
                    <div style="min-width:0">
                      <b>${n}</b>
                      <span class="t-3">${m}</span>
                    </div>
                  </div>
                  <div class="kb-card-foot">
                    <span class="chip gold">${I('target')} ${sc}</span>
                    <button class="btn sm ghost">${I('more-horizontal')}</button>
                  </div>
                </div>`).join('')}
              <button class="kb-add">${I('plus')} Ajouter</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // =====================================================
  // MATCHING IA
  // =====================================================
  function renderMatching(){
    const matches = [
      ['Pedro Ferreira','Maçon qualifié','#2844 Rossetti SA',94,['Coffrage','Béton armé','12 ans XP','Permis grue'],['Disponible 01.05']],
      ['João Martins','Électricien','#2898 Rossetti SA',91,['NIBT','Tableaux','8 ans XP'],['Disponible immédiatement']],
      ['Beatriz Lopes','Carreleur','#2891 Boulanger',88,['Pose','Mosaïque','Étanchéité'],['Mobile Sion-Vevey']],
      ['Sofia Pereira','Aide-soignante','#2855 Hôpital Valais',86,['Soins de base','Empathie','5 ans XP'],['Bilingue FR/PT']],
      ['Antonio Santos','Soudeur TIG','#2877 Constructa',85,['TIG','MIG','Lecture plans'],['Mobile Bulle-Fribourg']],
    ];

    return pageHead('Matching IA', 'Recommandations triées par score · 2 entrées : missions ↔ candidats',
      `<button class="btn ghost">${I('history')} Historique</button>
       <button class="btn primary">${I('zap')} Lancer un match</button>`)
      + kpiStrip([
        { label:'Matches actifs', value:'68', delta:'+12', icon:'sparkles' },
        { label:'Score moyen',    value:'78/100', icon:'target' },
        { label:'Confiance haute',value:'34', icon:'shield-check', tone:'green' },
        { label:'À valider',      value:'11', icon:'alert-circle', tone:'' },
      ])
      + `<div class="match-grid" style="margin-top:14px">
        ${matches.map(([n,m,o,sc,sk,nt])=>`
          <div class="match-card">
            <div class="match-head">
              <div class="avatar md">${n.split(' ').map(x=>x[0]).join('')}</div>
              <div style="flex:1;min-width:0">
                <b>${n}</b><span class="t-3">${m}</span>
              </div>
              <div class="score-ring" style="--score:${sc}"><span>${sc}</span></div>
            </div>
            <div class="match-target">${I('target')} ${o}</div>
            <div class="match-skills">${sk.map(s=>`<span class="chip slate">${s}</span>`).join('')}</div>
            <div class="match-notes">${nt.map(n=>`<span>${I('check')} ${n}</span>`).join('')}</div>
            <div class="match-actions">
              <button class="btn ghost sm">${I('x')} Rejeter</button>
              <button class="btn sm">${I('eye')} Voir</button>
              <button class="btn primary sm">${I('send')} Présenter</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // =====================================================
  // ENTRETIENS
  // =====================================================
  function renderEntretiens(){
    const entr = [
      ['22 avr · 14:30','Pedro Ferreira','Maçon','Rossetti SA','Monthey','Confirmé','green','João'],
      ['22 avr · 16:00','Maria da Silva','Aide-soignante','Hôpital Valais','Sion','Confirmé','green','Seb'],
      ['23 avr · 09:00','Miguel Rodrigues','Chauffeur PL','CFF Cargo','Yverdon','À confirmer','amber','Noémie'],
      ['23 avr · 11:00','Carla Reis','Peintre','BTP Lavaux','Vevey','Confirmé','green','João'],
      ['24 avr · 10:30','Antonio Santos','Soudeur','Constructa','Bulle','Reporté','red','Seb'],
      ['25 avr · 15:00','Sofia Pereira','Carreleur','Boulanger','Sion','Confirmé','green','João'],
    ];

    return pageHead('Entretiens', 'Calendrier des entretiens cette semaine',
      `<div class="seg"><button class="active">Liste</button><button>Calendrier</button></div>
       <button class="btn primary">${I('plus')} Planifier</button>`)
      + kpiStrip([
        { label:'Cette semaine', value:'24', delta:'+6', icon:'calendar' },
        { label:'Confirmés',     value:'18', icon:'check-circle-2', tone:'green' },
        { label:'À confirmer',   value:'4',  icon:'clock', tone:'' },
        { label:'Reportés',      value:'2',  icon:'alert-triangle', tone:'' },
      ])
      + `<div class="table-wrap" style="margin-top:14px">
        <table class="ctable">
          <thead><tr><th>Quand</th><th>Candidat</th><th>Poste</th><th>Client</th><th>Lieu</th><th>Statut</th><th>Consultant</th><th></th></tr></thead>
          <tbody>
            ${entr.map(([w,n,p,c,l,s,t,co])=>`
              <tr><td><b>${w}</b></td><td>${n}</td><td>${p}</td><td>${c}</td><td>${l}</td>
              <td><span class="chip ${t}"><span class="dot"></span> ${s}</span></td>
              <td>${co}</td>
              <td><div class="row-actions"><button>${I('phone')}</button><button>${I('mail')}</button><button>${I('more-horizontal')}</button></div></td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // =====================================================
  // MESSAGES (Envois)
  // =====================================================
  function renderMessages(){
    return pageHead('Envois', 'Emails, WhatsApp et SMS — historique et campagnes',
      `<div class="seg"><button class="active">Tous</button><button>Email</button><button>WhatsApp</button><button>SMS</button></div>
       <button class="btn primary">${I('plus')} Nouvel envoi</button>`)
      + kpiStrip([
        { label:'Envoyés · 30j',  value:'1 482', delta:'+18%', icon:'send' },
        { label:'Taux ouverture', value:'68%',   delta:'+4%',  icon:'mail-open', tone:'green' },
        { label:'Taux réponse',   value:'24%',   delta:'+2%',  icon:'reply',     tone:'blue' },
        { label:'Bounces',        value:'1.2%',  icon:'alert-circle' },
      ])
      + `<div class="msg-grid" style="margin-top:14px">
        <aside class="msg-list">
          ${[
            ['EM','Pedro Ferreira','Confirmation entretien','Bonjour Pedro, nous confirmons votre entretien…','il y a 5 min','mail','blue',true],
            ['WA','Maria da Silva','Disponibilité 01.05 ?','Bonjour Maria, êtes-vous disponible…','il y a 23 min','message-circle','green',false],
            ['SM','Miguel Rodrigues','Rappel rdv demain 9h','Bonjour, rappel pour votre rdv de demain…','il y a 1 h','message-square','',false],
            ['EM','Sofia Pereira','Mission carreleur Boulanger','Sofia, nouvelle mission qui correspond à votre profil…','il y a 2 h','mail','blue',false],
            ['WA','Antonio Santos','Photo CFC à jour ?','Bonjour Antonio, pourriez-vous nous envoyer…','il y a 4 h','message-circle','green',false],
            ['EM','Beatriz Lopes','Bienvenue chez Boulanger','Beatriz, félicitations pour votre placement…','hier','mail','blue',false],
          ].map(([t,n,s,p,d,ic,tone,unr])=>`
            <div class="msg-item ${unr?'unread':''}">
              <div class="msg-tag ${tone}">${I(ic)}</div>
              <div style="flex:1;min-width:0">
                <div class="msg-top"><b>${n}</b><span class="t-3">${d}</span></div>
                <div class="msg-sub">${s}</div>
                <div class="msg-pre">${p}</div>
              </div>
            </div>`).join('')}
        </aside>
        <div class="msg-view card flush">
          <div class="card-head">
            <div><h3>Confirmation entretien</h3><p>À : pedro.ferreira@email.ch · il y a 5 min</p></div>
            <div style="display:flex;gap:6px"><button class="btn sm ghost">${I('reply')} Répondre</button><button class="btn sm ghost">${I('forward')} Transférer</button></div>
          </div>
          <div class="card-body">
            <p><b>Bonjour Pedro,</b></p>
            <p>Nous confirmons votre entretien le mardi 22 avril à 14h30 chez Rossetti SA, Route Industrielle 12 à Monthey.</p>
            <p>Personne à rencontrer : <b>Marc Rossetti</b>, directeur. Merci d'apporter votre permis et vos certificats SUVA.</p>
            <p>À très vite,<br>João Barbosa<br><i>L'Agence SA</i></p>
            <div class="msg-attach"><div>${I('paperclip')} Plan_acces.pdf</div></div>
          </div>
        </div>
      </div>`;
  }

  // =====================================================
  // ACTIVITÉS (logs)
  // =====================================================
  function renderActivites(){
    const logs = [
      ['09:42','João Barbosa','create','Création candidat','Pedro Ferreira'],
      ['09:38','Sébastien G.','update','Modification mission','#2844 Maçon × 3'],
      ['09:30','Système','sync','Sync OneDrive','432 fichiers'],
      ['09:14','Noémie L.','match','Match validé','Maria da Silva → #2855'],
      ['08:58','Sébastien G.','send','Email envoyé','15 candidats — relance Boulanger'],
      ['08:42','João Barbosa','place','Placement confirmé','Sofia Pereira → Boulanger'],
      ['08:30','Système','import','Import CV','12 nouveaux candidats'],
      ['Hier 17:22','Noémie L.','delete','Suppression','Mission #2845 annulée'],
      ['Hier 16:14','João Barbosa','login','Connexion','depuis Monthey · Chrome 130'],
      ['Hier 15:01','Système','sync','Sync Bexio','Comptabilité OK'],
    ];
    const toneOf = (t)=>({create:'green',update:'blue',sync:'',match:'amber',send:'blue',place:'green',import:'',delete:'red',login:''}[t]||'');

    return pageHead('Activité', 'Journal d\'actions de toute l\'équipe',
      `<button class="btn ghost">${I('download')} Exporter CSV</button>`)
      + `<div class="cand-filters" style="margin-top:6px">
          <div class="seg"><button class="active">Toute l'équipe</button><button>Moi</button><button>Système</button></div>
          <button class="pill-btn">${I('user')} Utilisateur</button>
          <button class="pill-btn">${I('filter')} Type</button>
          <button class="pill-btn">${I('calendar')} Date</button>
          <div style="flex:1"></div>
          <label class="tb-search" style="height:32px"><input placeholder="Rechercher dans les logs…">${I('search')}</label>
        </div>
        <div class="card flush">
          <div class="card-body" style="padding:0">
          ${logs.map(([t,u,a,lab,det])=>`
            <div class="log-row">
              <span class="log-time tnum">${t}</span>
              <span class="avatar sm">${u.split(' ').map(x=>x[0]).join('')}</span>
              <span class="log-user">${u}</span>
              <span class="chip ${toneOf(a)}">${a}</span>
              <span class="log-action">${lab}</span>
              <span class="log-detail t-3">${det}</span>
            </div>`).join('')}
          </div>
        </div>`;
  }

  // =====================================================
  // INTÉGRATIONS
  // =====================================================
  function renderIntegrations(){
    const apps = [
      ['OneDrive','Synchronisation des CV reçus par email','cloud','blue',true,'Connecté · 432 fichiers / mois'],
      ['Microsoft 365','Email pro, calendrier, contacts','mail','',true,'j.barbosa@l-agence.ch'],
      ['WhatsApp Business','Envoi de messages aux candidats','message-circle','green',true,'+41 27 322 14 88'],
      ['Twilio SMS','Rappels et confirmations SMS','message-square','',false,'Non connecté'],
      ['Bexio','Comptabilité et facturation','calculator','',true,'Sync hier 15:01'],
      ['Google Calendar','Synchronisation des entretiens','calendar','',false,'Non connecté'],
      ['Slack','Notifications équipe','hash','purple',false,'Non connecté'],
      ['SwissID','Authentification & 2FA','shield-check','',true,'Activé pour 4 utilisateurs'],
    ];

    return pageHead('Intégrations', 'Connectez vos outils — sync automatique et envois')
      + `<div class="cand-filters" style="margin-top:6px">
        <div class="seg"><button class="active">Toutes</button><button>Connectées</button><button>Disponibles</button></div>
      </div>
      <div class="int-grid">
        ${apps.map(([n,d,ic,tone,on,sub])=>`
          <div class="int-card ${on?'on':''}">
            <div class="int-head">
              <div class="int-icon ${tone}">${I(ic)}</div>
              <span class="chip ${on?'green':'slate'}"><span class="dot"></span> ${on?'Connecté':'Disponible'}</span>
            </div>
            <h3>${n}</h3>
            <p>${d}</p>
            <div class="int-foot">
              <span class="t-3">${sub}</span>
              <button class="btn sm ${on?'ghost':'primary'}">${on?'Configurer':'Connecter'}</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // =====================================================
  // OUTILS (analyser candidats, rapport heures)
  // =====================================================
  function renderOutils(){
    return pageHead('Outils', 'Utilitaires métier — analyses, rapports, opérations groupées')
      + `<div class="tools-grid">
        ${[
          ['Analyser candidats','Audit IA en lot — détection doublons, complétude des fiches, qualité des CV','sparkles','accent','Lancer un audit'],
          ['Rapport heures','Générer rapport mensuel des heures déclarées par mission','clock','blue','Générer un rapport'],
          ['Import en masse','Importer des CV depuis un dossier ou un cloud — détection auto','upload','green','Démarrer un import'],
          ['Anonymiser CV','Retirer photo et données perso pour envoi client','user-x','','Anonymiser'],
          ['Doublons','Détecter et fusionner les candidats en doublon','copy','','Scanner'],
          ['Corriger photos','Recadrer et harmoniser les photos de candidats','image','purple','Lancer'],
          ['Export comptable','Export Bexio des placements et factures','calculator','','Exporter'],
          ['Nettoyage base','Archiver candidats inactifs > 18 mois','archive','','Lancer'],
        ].map(([n,d,ic,t,a])=>`
          <div class="tool-card">
            <div class="tool-icon ${t}">${I(ic)}</div>
            <h3>${n}</h3>
            <p>${d}</p>
            <button class="btn sm">${a} →</button>
          </div>`).join('')}
      </div>`;
  }

  // =====================================================
  // PARAMÈTRES (refonte avec onglets)
  // =====================================================
  const SETTINGS_TABS = [
    { id:'profil',     label:'Profil',          icon:'user' },
    { id:'securite',   label:'Sécurité',        icon:'shield' },
    { id:'apparence',  label:'Apparence',       icon:'palette' },
    { id:'notifs',     label:'Notifications',   icon:'bell' },
    { id:'metiers',    label:'Métiers',         icon:'briefcase' },
    { id:'secteurs',   label:'Secteurs',        icon:'building-2' },
    { id:'doublons',   label:'Doublons',        icon:'copy' },
    { id:'logs',       label:'Logs',            icon:'file-text' },
    { id:'acces',      label:'Demandes d\'accès', icon:'user-plus' },
    { id:'admin',      label:'Administration',  icon:'users-round' },
  ];

  let settingsTab = 'profil';

  function renderParametres(){
    const tabs = SETTINGS_TABS.map(t=>`
      <div class="params-nav-item ${settingsTab===t.id?'active':''}" data-tab="${t.id}">${I(t.icon)} ${t.label}</div>
    `).join('');

    let body = '';
    switch(settingsTab){
      case 'profil':     body = paramsProfil(); break;
      case 'securite':   body = paramsSecurite(); break;
      case 'apparence':  body = paramsApparence(); break;
      case 'notifs':     body = paramsNotifs(); break;
      case 'metiers':    body = paramsMetiers(); break;
      case 'secteurs':   body = paramsSecteurs(); break;
      case 'doublons':   body = paramsDoublons(); break;
      case 'logs':       body = paramsLogs(); break;
      case 'acces':      body = paramsAcces(); break;
      case 'admin':      body = paramsAdmin(); break;
    }

    $('#screen-parametres').innerHTML = `
      ${pageHead('Paramètres','Profil, sécurité, préférences et administration')}
      <div class="params-layout">
        <aside class="params-nav">${tabs}</aside>
        <div style="display:flex;flex-direction:column;gap:var(--gap)">${body}</div>
      </div>
    `;
    $('#screen-parametres').querySelectorAll('[data-tab]').forEach(el=>{
      el.addEventListener('click', ()=>{ settingsTab = el.dataset.tab; renderParametres(); });
    });
    // wires
    $('#screen-parametres').querySelectorAll('.toggle').forEach(t=>{
      t.addEventListener('click', ()=>{
        t.classList.toggle('on');
        if (t.dataset.key === 'theme-toggle'){
          const cur = document.documentElement.dataset.theme;
          window.TF_APP?.setTweak('theme', cur === 'dark' ? 'light' : 'dark');
        }
      });
    });
  }

  function paramsProfil(){
    return `<div class="card flush">
      <div class="card-head"><div><h3>Profil</h3><p>Informations affichées à tes collègues</p></div></div>
      <div class="card-body">
        <div style="display:flex;gap:20px;align-items:center;margin-bottom:20px">
          <div class="avatar" style="width:72px;height:72px;font-size:26px">JB</div>
          <div><button class="btn">${I('camera')} Changer</button><button class="btn ghost">Supprimer</button>
          <div class="t-3" style="margin-top:6px">PNG ou JPG, 2 Mo max.</div></div>
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
    </div>`;
  }
  function paramsSecurite(){
    return `<div class="card flush">
      <div class="card-head"><h3>Sécurité</h3></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="form-row"><label>Mot de passe actuel</label><input class="input" type="password" value="••••••••••"></div>
        <div class="form-grid">
          <div class="form-row"><label>Nouveau mot de passe</label><input class="input" type="password"></div>
          <div class="form-row"><label>Confirmer</label><input class="input" type="password"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px dashed var(--border);margin-top:6px">
          <div><b>Authentification 2FA</b><div class="t-3">Code de vérification à chaque connexion</div></div>
          <div class="toggle on"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px dashed var(--border)">
          <div><b>Sessions actives</b><div class="t-3">3 appareils connectés · Chrome (Monthey), Safari iOS, Edge (bureau)</div></div>
          <button class="btn ghost sm">Voir les sessions</button>
        </div>
        <div><button class="btn primary">Enregistrer</button></div>
      </div>
    </div>`;
  }
  function paramsApparence(){
    return `<div class="card flush">
      <div class="card-head"><h3>Apparence</h3><p>Thème, couleur d'accent, typographie</p></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        ${[
          ['Thème sombre','Basculer entre light et dark',document.documentElement.dataset.theme==='dark','theme-toggle'],
          ['Animations riches','Stagger, transitions',true],
          ['Mode compact','Réduit les paddings',document.documentElement.dataset.density==='dense'],
        ].map(([t,s,on,k])=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px dashed var(--border)">
          <div><b>${t}</b><div class="t-3">${s}</div></div>
          <div class="toggle ${on?'on':''}" ${k?`data-key="${k}"`:''}></div>
        </div>`).join('')}
        <div>
          <b style="font-size:13px">Accent</b>
          <div style="display:flex;gap:8px;margin-top:10px">
            ${['amber','blue','green','red','purple','slate'].map(c=>`<button class="swatch sw-${c}" data-accent="${c}" title="${c}"></button>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }
  function paramsNotifs(){
    return `<div class="card flush">
      <div class="card-head"><h3>Notifications</h3><p>Email, in-app et alertes urgentes</p></div>
      <div class="card-body">
        ${[
          ['Nouveaux candidats','Quand un CV arrive via OneDrive',true],
          ['Match haute confiance','Score IA ≥ 85',true],
          ['Entretien à confirmer','Rappel 24h avant',true],
          ['Placement confirmé','Notification équipe',false],
          ['Doublons détectés','Hebdo · résumé',true],
          ['Newsletter produit','Mensuelle',false],
        ].map(([t,s,on])=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px dashed var(--border)">
          <div><b>${t}</b><div class="t-3">${s}</div></div>
          <div class="toggle ${on?'on':''}"></div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  function paramsMetiers(){
    const metiers = ['Maçon','Carreleur','Peintre','Électricien','Soudeur','Chauffeur PL','Cariste','Logisticien','Aide-soignant','Infirmier','Mécanicien','Menuisier','Couvreur','Grutier','Ébéniste'];
    return `<div class="card flush">
      <div class="card-head"><div><h3>Métiers</h3><p>Référentiel utilisé pour les filtres et le matching IA</p></div><button class="btn primary sm">${I('plus')} Ajouter</button></div>
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:6px">
        ${metiers.map(m=>`<span class="chip slate">${m} <button class="x">×</button></span>`).join('')}
      </div>
    </div>`;
  }
  function paramsSecteurs(){
    const sect = ['Construction','Industrie','Logistique','Santé','Hôtellerie','Restauration','Automobile','Agriculture','Bureau / Admin'];
    return `<div class="card flush">
      <div class="card-head"><div><h3>Secteurs</h3><p>Catégories utilisées sur les fiches client</p></div><button class="btn primary sm">${I('plus')} Ajouter</button></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:6px">
        ${sect.map(s=>`<div class="line-row"><b>${s}</b><span class="t-3">${Math.floor(Math.random()*200)+50} clients</span><div class="row-actions"><button>${I('pencil')}</button><button>${I('trash-2')}</button></div></div>`).join('')}
      </div>
    </div>`;
  }
  function paramsDoublons(){
    return `<div class="card flush">
      <div class="card-head"><div><h3>Doublons détectés</h3><p>Candidats apparaissant plusieurs fois en base</p></div><button class="btn">${I('refresh-cw')} Re-scanner</button></div>
      <div class="card-body">
      ${[
        ['Pedro Ferreira','PF','3 entrées · 95% similarité',['Email','Téléphone','Date naissance']],
        ['Maria da Silva','MS','2 entrées · 88% similarité',['Email','Téléphone']],
        ['João Martins','JM','2 entrées · 76% similarité',['Téléphone','Métier']],
      ].map(([n,ini,m,ch])=>`
        <div class="dup-row">
          <div class="avatar">${ini}</div>
          <div><b>${n}</b><div class="t-3">${m}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${ch.map(c=>`<span class="chip slate">${c}</span>`).join('')}</div>
          <div style="display:flex;gap:6px"><button class="btn ghost sm">Ignorer</button><button class="btn primary sm">${I('git-merge')} Fusionner</button></div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  function paramsLogs(){
    return `<div class="card flush">
      <div class="card-head"><div><h3>Logs système</h3><p>Toutes les actions sensibles · 90 derniers jours</p></div><button class="btn">${I('download')} Exporter</button></div>
      <div class="card-body" style="padding:0">
      ${[
        ['09:42','J. Barbosa','Création candidat','Pedro Ferreira'],
        ['08:30','Système','Sync OneDrive','12 fichiers'],
        ['Hier 17:22','N. Lopes','Suppression mission','#2845'],
        ['Hier 14:01','Système','Backup','Snapshot quotidien'],
        ['20.04','Admin','Création utilisateur','Sébastien G.'],
      ].map(([t,u,a,d])=>`<div class="log-row"><span class="log-time">${t}</span><span class="log-user">${u}</span><span class="log-action">${a}</span><span class="t-3">${d}</span></div>`).join('')}
      </div>
    </div>`;
  }
  function paramsAcces(){
    return `<div class="card flush">
      <div class="card-head"><div><h3>Demandes d'accès</h3><p>Nouveaux comptes en attente de validation</p></div></div>
      <div class="card-body">
      ${[
        ['Aleksander Morin','a.morin@l-agence.ch','Consultant','21.04'],
        ['Fatima Benchaar','f.benchaar@l-agence.ch','Secrétaire','20.04'],
      ].map(([n,e,r,d])=>`
        <div class="dup-row">
          <div class="avatar">${n.split(' ').map(x=>x[0]).join('')}</div>
          <div><b>${n}</b><div class="t-3">${e} · demandé le ${d}</div></div>
          <span class="chip slate">${r}</span>
          <div style="display:flex;gap:6px"><button class="btn ghost sm">Refuser</button><button class="btn primary sm">${I('check')} Approuver</button></div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  function paramsAdmin(){
    return `<div class="card flush">
      <div class="card-head"><div><h3>Utilisateurs</h3><p>Comptes de l'équipe · 4 actifs</p></div><button class="btn primary sm">${I('user-plus')} Inviter</button></div>
      <div class="card-body" style="padding:0">
      ${[
        ['João Barbosa','j.barbosa@l-agence.ch','Administrateur','green'],
        ['Sébastien Genoud','s.genoud@l-agence.ch','Consultant senior','blue'],
        ['Noémie Lopes','n.lopes@l-agence.ch','Consultante','blue'],
        ['Patricia Reis','p.reis@l-agence.ch','Secrétaire','slate'],
      ].map(([n,e,r,t])=>`<div class="line-row">
        <div class="avatar sm">${n.split(' ').map(x=>x[0]).join('')}</div>
        <div><b>${n}</b><div class="t-3">${e}</div></div>
        <span class="chip ${t}">${r}</span>
        <div class="row-actions"><button>${I('pencil')}</button><button>${I('trash-2')}</button></div>
      </div>`).join('')}
      </div>
    </div>`;
  }

  // =====================================================
  // SECRÉTARIAT
  // =====================================================
  function renderSecretariat(){
    return pageHead('Secrétariat', 'Vues simplifiées : appels, accueil, bons à faire')
      + kpiStrip([
        { label:'Appels en attente', value:'4', icon:'phone' },
        { label:'Visiteurs aujourd\'hui', value:'3', icon:'user-check', tone:'green' },
        { label:'Bons à signer', value:'7', icon:'file-signature' },
        { label:'Coursiers', value:'2', icon:'truck' },
      ])
      + `<div class="dash-grid" style="margin-top:14px">
        <div class="card flush">
          <div class="card-head"><h3>Appels reçus</h3></div>
          <div class="card-body">
          ${[
            ['09:42','+41 27 322 14 88','Marc Rossetti — Rossetti SA','Demande devis maçon × 2'],
            ['09:21','+41 79 412 88 21','Inconnu','Candidature spontanée — chauffeur PL'],
            ['08:55','+41 27 305 11 22','Hôpital du Valais','Confirmation entretien Maria'],
            ['08:30','+41 21 864 22 18','BTP Lavaux','Annulation mission'],
          ].map(([h,t,n,d])=>`<div class="line-row"><span class="tnum t-3">${h}</span><b>${n}</b><span class="t-3">${t}</span><span>${d}</span></div>`).join('')}
          </div>
        </div>
        <div class="card flush">
          <div class="card-head"><h3>À faire aujourd'hui</h3></div>
          <div class="card-body">
          ${[
            ['Préparer dossiers entretien 14h30',true],
            ['Imprimer 5 contrats Boulanger SA',true],
            ['Confirmer rdv Hôpital Valais',false],
            ['Envoyer factures fin de mois',false],
            ['Récupérer permis grue João Martins',false],
          ].map(([t,d])=>`<div class="todo-row">
            <span class="check ${d?'on':''}">${d?I('check'):''}</span>
            <span class="${d?'done':''}">${t}</span>
          </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  // =====================================================
  // IMPORT EN MASSE
  // =====================================================
  function renderImport(){
    return pageHead('Import en masse', 'Importer plusieurs CV depuis un dossier ou un cloud')
      + `<div class="import-grid">
          <div class="card flush">
            <div class="card-head"><h3>Source</h3></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
              ${[
                ['cloud','OneDrive','Dossier "CV reçus" — 432 fichiers',true],
                ['hard-drive','Dossier local','Glisser-déposer ou parcourir',false],
                ['mail','Boîte email','Import depuis Outlook',false],
                ['link','URL / SharePoint','Lien partagé public',false],
              ].map(([ic,n,d,on])=>`<label class="src-row ${on?'on':''}">
                <input type="radio" name="src" ${on?'checked':''}>
                <span class="src-icon">${I(ic)}</span>
                <div><b>${n}</b><span class="t-3">${d}</span></div>
              </label>`).join('')}
            </div>
          </div>
          <div class="card flush">
            <div class="card-head"><h3>Options</h3></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
              <div class="form-row"><label>Métier par défaut</label>
                <select class="input"><option>— Détecter automatiquement</option><option>Maçon</option><option>Carreleur</option></select>
              </div>
              <div class="form-row"><label>Consultant assigné</label>
                <select class="input"><option>João Barbosa</option><option>Sébastien G.</option><option>Noémie L.</option></select>
              </div>
              ${[
                ['Détection IA des compétences',true],
                ['Création automatique des doublons en attente',true],
                ['Notifier l\'équipe à la fin',false],
              ].map(([t,on])=>`<div style="display:flex;align-items:center;justify-content:space-between"><span>${t}</span><div class="toggle ${on?'on':''}"></div></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card flush" style="margin-top:14px">
          <div class="card-head"><div><h3>Aperçu</h3><p>432 fichiers détectés · 18 doublons probables · 414 nouveaux candidats</p></div>
          <button class="btn primary">${I('upload')} Lancer l'import</button></div>
          <div class="card-body" style="padding:0">
            ${['CV_Ferreira_2026.pdf','CV_Maria_DaSilva.docx','CV_Luis_Costa.pdf','CV_Sofia_Pereira.pdf','CV_Miguel_R.pdf'].map(f=>`<div class="line-row"><span>${I('file-text')} ${f}</span><span class="t-3">2 pages · 184 Ko</span><span class="chip green"><span class="dot"></span> Prêt</span></div>`).join('')}
          </div>
        </div>`;
  }

  // ---------- Router ----------
  const ROUTES = {
    clients:     renderClients,
    'client-fiche': renderClientFiche,
    missions:    renderMissions,
    offres:      renderOffres,
    pipeline:    renderPipeline,
    matching:    renderMatching,
    entretiens:  renderEntretiens,
    messages:    renderMessages,
    activites:   renderActivites,
    integrations:renderIntegrations,
    outils:      renderOutils,
    secretariat: renderSecretariat,
    'import':    renderImport,
  };

  function renderInto(id, html){
    const el = document.getElementById('screen-'+id);
    if (el) el.innerHTML = html;
  }
  function render(screen){
    const fn = ROUTES[screen];
    if (!fn) return false;
    renderInto(screen, fn());
    return true;
  }

  window.TF_EXTRAS = { render, ROUTES, renderParametres };
  // Override the parametres screen entirely
  window.TF_PARAMETRES = { render: renderParametres };
})();
