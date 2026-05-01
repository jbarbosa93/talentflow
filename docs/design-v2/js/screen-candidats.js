// Candidats list screen
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }

  let currentTab = 'actif';
  let searchQuery = '';
  let metierFilter = '';

  function filter(candidats){
    let list = candidats;
    if (currentTab === 'a_traiter') list = list.filter(c => c.isNew);
    if (currentTab === 'actif')     list = list.filter(c => c.statut.k !== 'refuse');
    if (currentTab === 'archive')   list = list.filter(c => c.statut.k === 'refuse');
    if (metierFilter){
      list = list.filter(c => c.metier.toLowerCase().includes(metierFilter.toLowerCase()));
    }
    if (searchQuery){
      const q = searchQuery.toLowerCase();
      list = list.filter(c => (c.prenom+' '+c.nom+' '+c.metier+' '+c.ville).toLowerCase().includes(q));
    }
    return list;
  }

  // Color classes for métier chips (cycling by first letter)
  function metierChipClass(metier){
    const m = metier.toLowerCase();
    if (m.includes('maçon') || m.includes('macon')) return 'orange';
    if (m.includes('logisti') || m.includes('magasin') || m.includes('manutent') || m.includes('cariste')) return 'green';
    if (m.includes('électr') || m.includes('electr')) return 'yellow';
    if (m.includes('soud')) return 'blue';
    if (m.includes('ouvri')) return 'pink';
    if (m.includes('tuyau') || m.includes('sanit') || m.includes('chauff')) return 'teal';
    if (m.includes('serrur') || m.includes('store')) return 'violet';
    if (m.includes('carrel') || m.includes('étanch') || m.includes('etanch')) return 'amber';
    return 'slate';
  }

  function render(){
    const D = window.TF_DATA;
    const list = filter(D.candidats);

    const counts = {
      tous: D.candidats.length,
      actifs: D.candidats.filter(c => c.statut.k !== 'refuse').length,
      a_traiter: D.candidats.filter(c => c.isNew).length,
      archives: D.candidats.filter(c => c.statut.k === 'refuse').length,
    };

    const rows = list.map((c,i) => renderCardRow(c, i)).join('');

    $('#screen-candidats').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Candidats <em>·</em> <span class="tnum" style="font-size:24px;color:var(--text-2)">${D.candidats.length.toLocaleString('fr-CH')}</span></h1>
          <p>Base de talents, filtres et actions rapides</p>
        </div>
        <div class="page-actions"></div>
      </div>

      <div class="cand-search">
        ${iconHtml('search')}
        <input id="cand-search" value="${searchQuery}" placeholder="Nom, métier, compétences, contenu du CV…" />
        <button class="search-info" title="Aide recherche">${iconHtml('info')}</button>
      </div>

      <div class="cand-filters">
        <select id="cand-metier" class="metier-select">
          <option value="">Tous les métiers</option>
          ${[...new Set(D.candidats.map(c=>c.metier))].sort().map(m => `<option value="${m}" ${metierFilter===m?'selected':''}>${m}</option>`).join('')}
        </select>

        <div class="seg" id="cand-tabs">
          <button data-tab="actif"     class="${currentTab==='actif'?'active green':''}">Actif</button>
          <button data-tab="a_traiter" class="${currentTab==='a_traiter'?'active amber':''}">À traiter</button>
          <button data-tab="archive"   class="${currentTab==='archive'?'active':''}">Archivé</button>
        </div>

        <button class="pill-btn">${iconHtml('arrow-down')} Plus récent ${iconHtml('chevron-down')}</button>
        <button class="pill-btn">${iconHtml('map-pin')} Par lieu</button>
        <button class="pill-btn">${iconHtml('sliders-horizontal')} Filtres avancés</button>

        <div style="flex:1"></div>

        <div class="cand-page-info">
          <select class="page-size"><option>20</option><option>50</option><option>100</option></select>
          <span class="t-3">/ ${counts.tous.toLocaleString('fr-CH')}</span>
          <span class="t-3">Page 1 / ${Math.max(1, Math.ceil(counts.tous/20))}</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="ctable cand-table">
          <thead>
            <tr>
              <th style="width:36px"><input type="checkbox"/></th>
              <th style="width:290px">Candidat</th>
              <th>Localisation</th>
              <th>Âge</th>
              <th>Note</th>
              <th>Métier</th>
              <th>Ajouté le</th>
              <th style="width:44px"></th>
            </tr>
          </thead>
          <tbody id="cand-rows">${rows}</tbody>
        </table>
        <div class="table-foot">
          <span>Affichage <b style="color:var(--text)">1–${list.length}</b> sur <b style="color:var(--text)">${counts.tous.toLocaleString('fr-CH')}</b></span>
          <div class="pager">
            <button>${iconHtml('chevron-left')}</button>
            <button class="active">1</button>
            <button>2</button>
            <button>3</button>
            <button>…</button>
            <button>${Math.ceil(counts.tous/20)}</button>
            <button>${iconHtml('chevron-right')}</button>
          </div>
        </div>
      </div>
    `;

    // Events
    $('#cand-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      currentTab = b.dataset.tab; render();
    });
    $('#cand-metier')?.addEventListener('change', (e) => {
      metierFilter = e.target.value; render();
    });
    $('#cand-search').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      const list = filter(window.TF_DATA.candidats);
      $('#cand-rows').innerHTML = list.length
        ? list.map((c,i) => renderCardRow(c,i)).join('')
        : `<tr><td colspan="8" style="padding:48px;text-align:center;color:var(--text-3)">Aucun candidat</td></tr>`;
      wireRows();
    });
    wireRows();

    function wireRows(){
      $('#screen-candidats').querySelectorAll('.cand-row[data-cid]').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button, input, label, .cc-check')) return;
          const cid = parseInt(tr.dataset.cid, 10);
          window.TF_APP?.navigate('fiche', cid);
        });
        // Preview CV viewer uniquement au survol de la PHOTO
        const avatar = tr.querySelector('.cand-avatar');
        if (avatar){
          avatar.addEventListener('mouseenter', (e) => showPreview(tr, e));
          avatar.addEventListener('mouseleave', hidePreview);
        }
      });
    }
  }

  function starRating(score){
    // 0-100 → 0-5 stars (half-step)
    const val = (score / 100) * 5;
    const full = Math.floor(val);
    const half = (val - full) >= 0.5;
    let html = '<div class="stars" title="'+score+'/100">';
    for (let i = 0; i < 5; i++){
      if (i < full) html += '<span class="st full">★</span>';
      else if (i === full && half) html += '<span class="st half">★</span>';
      else html += '<span class="st empty">★</span>';
    }
    html += '</div>';
    return html;
  }

  function renderCardRow(c, i){
    const dateFmt = (() => { const d = new Date(); d.setDate(d.getDate() - c.importDays);
      const mois = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
      return `${String(d.getDate()).padStart(2,'0')} ${mois[d.getMonth()]} ${d.getFullYear()}`;
    })();
    const n = c.note || 3;
    const stars = [1,2,3,4,5].map(i => `<svg viewBox="0 0 24 24" class="star ${i <= n ? 'on' : ''}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`).join('');
    const chipClass = metierChipClass(c.metier);
    const metierShort = c.metier.split(',')[0].split(' ').slice(0,2).join(' ');
    const plus = c.metier.split(' ').length > 2 ? ' +1' : '';
    const isTraiter = currentTab === 'a_traiter';
    return `
      <tr class="cand-row" data-cid="${c.id}" style="animation-delay:${Math.min(i,20)*12}ms">
        <td><input type="checkbox" class="cc-check-input" onclick="event.stopPropagation()"/></td>
        <td>
          <div class="cand-cell">
            <div class="cand-avatar ${c.isNew?'new':''}">${c.photo ? `<img src="${c.photo}" alt="" onerror="this.remove()"/>` : c.initials}</div>
            <div style="min-width:0">
              <div class="cand-name">${c.prenom} ${c.nom}</div>
              <div class="cand-sub">${c.metier}</div>
            </div>
          </div>
        </td>
        <td><span class="cc-loc">${iconHtml('map-pin')}<span>${c.ville}</span></span></td>
        <td><span class="age-pill">${c.age ?? 30} ans</span></td>
        <td><div class="stars" title="${n}/5">${stars}</div></td>
        <td>
          <div class="metier-cell">
            ${isTraiter ? `<span class="tag-mini">${iconHtml('graduation-cap')} CFC</span><span class="tag-mini">${iconHtml('handshake')} Engagé</span>` : ''}
            <span class="tag-metier ${chipClass}" title="${c.metier}">${iconHtml('briefcase')} ${metierShort}</span>
          </div>
        </td>
        <td class="cc-date">${dateFmt}</td>
        <td>${isTraiter ? `<button class="cc-validate" title="Valider" onclick="event.stopPropagation()">${iconHtml('check')}</button>` : ''}</td>
      </tr>`;
  }

  // Hover CV preview
  let previewEl = null;
  function showPreview(tr, e){
    const c = window.TF_DATA.candidats.find(x => x.id == tr.dataset.cid);
    if (!c) return;
    hidePreview();
    previewEl = document.createElement('div');
    previewEl.className = 'cv-preview';
    const iconHtml = n => `<i class="lucide lucide-${n}"></i>`;

    // Deterministic fake CV content based on candidate
    const skills = c.metier.includes('Maçon')   ? ['Coffrage','Béton armé','Pierre naturelle','Lecture plans','SUVA','Grue']
                 : c.metier.includes('Électricien') ? ['Tableaux électriques','Câblage','Normes NIBT','Lecture plans','Sécurité']
                 : c.metier.includes('Chauffeur') ? ['Permis CE','Tachygraphe','OACP','Longue distance','Logistique']
                 : c.metier.includes('Carreleur')  ? ['Pose carrelage','Mosaïque','Étanchéité','Finitions','Lecture plans']
                 : c.metier.includes('soignant') || c.metier.includes('Infirmier') ? ['Soins de base','Dossiers patients','Prise de sang','Empathie','Travail équipe']
                 : c.metier.includes('Cariste') || c.metier.includes('Logisticien') ? ['CACES','Gestion stock','SAP','Chariot élévateur','Picking']
                 : ['Organisation','Travail équipe','Fiabilité','Adaptabilité','Rigueur'];
    const yr = 2026;
    const xp = [
      { role: c.metier, co: 'Rossetti SA', loc: c.ville.split(',')[0], from: yr - Math.min(c.experience, 5), to: yr, bullets: [
        'Missions en CDI et intérim long terme sur chantiers résidentiels et commerciaux',
        'Gestion d\'équipes de 3 à 6 personnes, respect strict des délais',
      ]},
      { role: c.metier, co: 'Valais Pro Construction', loc: 'Monthey', from: yr - c.experience, to: yr - Math.min(c.experience, 5) - 1, bullets: [
        'Apprentissage terrain et montée en compétences sur différents types de chantiers',
      ]},
    ];
    const edu = [
      { title: `CFC ${c.metier.split(' ')[0]}`, where: 'École Technique — Sion', year: yr - c.experience },
      { title: 'SUVA Sécurité chantier', where: 'Formation continue', year: yr - 2 },
    ];

    previewEl.innerHTML = `
      <div class="cv-preview-page">
        <div class="cvp-head">
          <div class="cvp-photo">${c.photo ? `<img src="${c.photo}"/>` : c.initials}</div>
          <div class="cvp-ident">
            <h1>${c.prenom} ${c.nom}</h1>
            <div class="cvp-role">${c.metier}</div>
            <div class="cvp-contact">
              <span>${iconHtml('map-pin')} ${c.ville}</span>
              <span>${iconHtml('phone')} ${c.tel}</span>
              <span>${iconHtml('mail')} ${c.email}</span>
            </div>
          </div>
        </div>

        <div class="cvp-grid">
          <main class="cvp-main">
            <section>
              <h2>Profil</h2>
              <p>${c.metier} avec ${c.experience} ans d'expérience en Suisse romande. Basé à ${c.ville.split(',')[0]}, permis B, mobile. Bilingue FR/PT.</p>
            </section>
            <section>
              <h2>Expérience</h2>
              ${xp.map(x => `
                <div class="cvp-xp">
                  <div class="cvp-xp-head">
                    <div>
                      <h3>${x.role}</h3>
                      <div class="cvp-xp-co">${x.co} · ${x.loc}</div>
                    </div>
                    <div class="cvp-xp-date">${x.from} — ${x.to}</div>
                  </div>
                  <ul>${x.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
                </div>
              `).join('')}
            </section>
            <section>
              <h2>Formation</h2>
              <ul class="cvp-edu">
                ${edu.map(e => `<li><b>${e.title}</b> — ${e.where} <span>${e.year}</span></li>`).join('')}
              </ul>
            </section>
          </main>
          <aside class="cvp-aside">
            <section>
              <h2>Compétences</h2>
              <div class="cvp-skills">${skills.map(s => `<span>${s}</span>`).join('')}</div>
            </section>
            <section>
              <h2>Langues</h2>
              <dl>
                <dt>Français</dt><dd>Courant</dd>
                <dt>Portugais</dt><dd>Natif</dd>
              </dl>
            </section>
            <section>
              <h2>Infos</h2>
              <dl>
                <dt>Permis</dt><dd>B · Suisse</dd>
                <dt>Disponible</dt><dd>01.05.2026</dd>
              </dl>
            </section>
          </aside>
        </div>

        <footer class="cvp-foot">
          <span>${c.prenom} ${c.nom} · CV ${yr}</span>
          <span>Page 1 / 1</span>
        </footer>
      </div>
      <div class="cv-preview-foot">${iconHtml('file-text')} CV_${c.nom.replace(/\s/g,'_')}_${yr}.pdf · Cliquer pour ouvrir la fiche</div>
    `;
    document.body.appendChild(previewEl);
    const r = tr.getBoundingClientRect();
    const w = 540, h = 680;
    // Position preview to the LEFT of the row; clamp to viewport.
    let px = r.left - w - 12;
    if (px < 12) px = 12;
    const py = Math.min(window.innerHeight - h - 16, Math.max(12, r.top - 60));
    previewEl.style.left = px + 'px';
    previewEl.style.top = py + 'px';
  }
  function hidePreview(){ if (previewEl){ previewEl.remove(); previewEl = null; } }

  window.TF_CANDIDATS = { render };
})();
