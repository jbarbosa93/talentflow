// Dashboard screen
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }

  function render(){
    const D = window.TF_DATA;
    const kpiCards = D.kpis.map((k,i) => `
      <div class="kpi" style="animation: screenIn .4s var(--ease-out) ${i*60}ms backwards">
        <div class="kpi-top">
          <div class="kpi-icon ${k.tone}">${iconHtml(k.icon)}</div>
          <div class="kpi-delta ${k.dir}">${iconHtml(k.dir==='up'?'trending-up':'trending-down')} ${k.delta}</div>
        </div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value tnum" data-count="${k.value}">0</div>
        <div class="kpi-spark">${window.TF_CHARTS.sparkline(k.spark, {color:'var(--accent)'})}</div>
      </div>
    `).join('');

    // Candidats à traiter par consultant — affichage compact (nom + chips métier colorés)
    const queueByConsultant = (() => {
      const byCons = {};
      D.candidats.filter(c => c.isNew).forEach(c => {
        const k = c.consultant;
        byCons[k] = byCons[k] || { consultant: k, items: [] };
        byCons[k].items.push(c);
      });
      const fullNames = { JB: 'João Barbosa', SG: 'Seb Girard', NL: 'Noémie Lopes' };
      const tones     = { JB: 'violet',       SG: 'teal',       NL: 'pink' };
      return Object.values(byCons).map(q => ({
        ...q,
        name: fullNames[q.consultant] || q.consultant,
        tone: tones[q.consultant] || 'slate',
      }));
    })();

    // Color per métier family (same palette as list chips)
    function metierTone(metier){
      const m = (metier||'').toLowerCase();
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

    const queueRows = queueByConsultant.map(q => `
      <div class="queue-row">
        <div class="queue-cons">
          <div class="avatar cons-${q.tone}" style="width:32px;height:32px;font-size:12px">${q.consultant}</div>
          <b style="font-size:13.5px">${q.name}</b>
        </div>
        <div class="queue-metiers">
          ${q.items.slice(0,5).map(c => `
            <span class="tag-metier ${metierTone(c.metier)}" title="${c.prenom} ${c.nom} · ${c.metier}">${c.metier.split(' ')[0]}</span>
          `).join('')}
          ${q.items.length > 5 ? `<span class="queue-more">+${q.items.length - 5}</span>` : ''}
        </div>
        <button class="btn sm ghost">${iconHtml('arrow-right')}</button>
      </div>
    `).join('');

    const activity = D.activity.map(a => `
      <div class="activity-item">
        <div class="act-icon ${a.type}">${iconHtml(a.type==='import'?'file-up':a.type==='match'?'sparkles':a.type==='note'?'check-circle-2':'alert-triangle')}</div>
        <div class="act-body">
          <b>${a.text}</b>
          <p>${a.sub}</p>
        </div>
        <div class="act-time">${a.time}</div>
      </div>`).join('');

    const reminders = D.reminders.map(r => `
      <div class="reminder">
        <div class="r-date">${r.day}<span>${r.mo}</span></div>
        <div>
          <b style="font-size:13px">${r.title}</b>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">${r.sub}</div>
        </div>
        <button class="btn sm ghost">${iconHtml('chevron-right')}</button>
      </div>`).join('');

    $('#screen-dashboard').innerHTML = `
      <div class="welcome">
        <div>
          <h2>Bonjour <em>João</em> — <span class="serif" style="color:var(--text-2)">19 avril 2026</span></h2>
          <p>3 nouveaux candidats attendent ton regard, 2 entretiens cette semaine et Pedro Ferreira vient d'obtenir un score de matching de 18/20.</p>
        </div>
        <div class="welcome-stats">
          <div class="welcome-stat"><b class="tnum">12</b><span>À traiter</span></div>
          <div class="welcome-stat"><b class="tnum">7</b><span>Rappels</span></div>
          <div class="welcome-stat"><b class="tnum">3</b><span>Alertes</span></div>
        </div>
      </div>

      <div class="kpi-grid">${kpiCards}</div>

      <div class="dash-grid">
        <div class="card flush">
          <div class="card-head">
            <div>
              <h3>Imports de candidats</h3>
              <p>Derniers 6 mois · OneDrive + manuel</p>
            </div>
            <div class="tabs-inline">
              <button class="active">Mois</button>
              <button>Semaine</button>
              <button>Jour</button>
            </div>
          </div>
          <div class="card-body chart-frame">
            ${window.TF_CHARTS.barsImport(D.imports)}
          </div>
        </div>

        <div class="card flush">
          <div class="card-head">
            <div>
              <h3>À traiter par consultant</h3>
              <p>File d'attente des nouveaux candidats</p>
            </div>
            <button class="btn sm ghost">${iconHtml('external-link')}</button>
          </div>
          <div class="card-body">
            ${queueRows || '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px">Tout est traité ✓</div>'}
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card flush">
          <div class="card-head">
            <div><h3>Activité récente</h3><p>Imports, matches, notes</p></div>
            <button class="btn sm ghost">Tout voir ${iconHtml('arrow-right')}</button>
          </div>
          <div class="activity-list">${activity}</div>
        </div>
        <div class="card flush">
          <div class="card-head">
            <div><h3>Rappels à venir</h3><p>Entretiens et relances</p></div>
            <button class="btn sm">${iconHtml('plus')} Nouveau</button>
          </div>
          <div class="card-body">${reminders}</div>
        </div>
      </div>
    `;

    // Count-up animation for KPI values
    $('#screen-dashboard').querySelectorAll('.kpi-value').forEach(el => {
      const target = parseInt(el.dataset.count, 10);
      const dur = 900;
      const start = performance.now();
      function tick(now){
        const t = Math.min(1, (now-start)/dur);
        const eased = 1 - Math.pow(1-t, 3);
        el.textContent = Math.floor(eased * target).toLocaleString('fr-CH');
        if (t < 1) requestAnimationFrame(tick); else el.textContent = target.toLocaleString('fr-CH');
      }
      requestAnimationFrame(tick);
    });
  }

  window.TF_DASHBOARD = { render };
})();
