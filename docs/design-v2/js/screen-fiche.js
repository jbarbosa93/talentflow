// Fiche candidat screen
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  function iconHtml(n){ return `<i class="lucide lucide-${n}"></i>`; }
  function metierTone(m){
    m = (m||'').toLowerCase();
    if (m.includes('maçon') || m.includes('macon')) return 'orange';
    if (m.includes('logisti') || m.includes('magasin') || m.includes('manutent') || m.includes('cariste')) return 'green';
    if (m.includes('électr') || m.includes('electr')) return 'yellow';
    if (m.includes('soud')) return 'blue';
    if (m.includes('ouvri')) return 'pink';
    if (m.includes('tuyau') || m.includes('sanit') || m.includes('chauff')) return 'teal';
    if (m.includes('serrur') || m.includes('store')) return 'violet';
    if (m.includes('carrel') || m.includes('étanch') || m.includes('etanch')) return 'amber';
    if (m.includes('peintre')) return 'pink';
    return 'slate';
  }

  function render(){
    const D = window.TF_DATA;
    const id = window.TF_APP?.getFicheId?.();
    const f = (id && D.fiches.find(x => x.id === id)) || D.fiches[0];
    // Mémorise pour le modal Documents
    window.__TF_CURRENT_FICHE = f;

    const skills = f.skills.map(s => `<span class="chip slate">${s}</span>`).join('');
    const langues = f.langues.map(l => `<span class="chip slate">${l}</span>`).join(' ');

    const timeline = f.timeline.map(t => `
      <div class="timeline-item">
        <div class="timeline-dot ${t.tone}">${iconHtml(t.icon)}</div>
        <div class="timeline-body">
          <b>${t.title}</b>
          <p>${t.body}</p>
          <time>${t.time}</time>
        </div>
      </div>
    `).join('');

    $('#screen-fiche').innerHTML = `
      <div class="page-head">
        <div>
          <button class="btn ghost sm" onclick="window.TF_APP?.navigate('candidats')" style="margin-bottom:8px">${iconHtml('arrow-left')} Retour à la liste</button>
        </div>
        <div class="page-actions">
          <button class="btn ghost">${iconHtml('star')}</button>
          <button class="btn ghost">${iconHtml('archive')}</button>
          <button class="btn">${iconHtml('mail')} Envoyer</button>
          <button class="btn primary">${iconHtml('sparkles')} Matcher IA</button>
        </div>
      </div>

      <div class="fiche-header" data-metier-tone="${metierTone(f.metier)}">
        <div class="fiche-avatar">${f.photo ? `<img src="${f.photo}" alt="${f.prenom}"/>` : f.initials}</div>
        <div class="fiche-title">
          <h1>${f.prenom} ${f.nom}</h1>
          <div class="meta">
            <span>${iconHtml('briefcase')} ${f.metier}</span>
            <span>${iconHtml('map-pin')} ${f.ville}</span>
            <span>${iconHtml('phone')} ${f.tel}</span>
            <span>${iconHtml('mail')} ${f.email}</span>
            <span class="chip gold">${iconHtml('target')} Score ${f.score}/100</span>
          </div>
        </div>
        <div class="fiche-actions">
          <a class="btn sm ghost" href="mailto:${f.email}" title="Envoyer un email">${iconHtml('mail')}</a>
          <a class="btn sm ghost wa-btn" href="https://wa.me/${(f.tel||'').replace(/[^\d+]/g,'').replace(/^\+/,'')}" target="_blank" title="WhatsApp">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/></svg>
          </a>
        </div>
      </div>

      <div class="fiche-layout">
        <!-- Col gauche : infos -->
        <div class="fiche-col-left" style="display:flex;flex-direction:column;gap:var(--gap)">
          <div class="card flush">
            <div class="card-head"><h3>Informations</h3><button class="btn sm ghost">${iconHtml('pencil')}</button></div>
            <div class="card-body">
              <dl style="margin:0">
                <div class="info-row"><dt>Métier</dt><dd>${f.metier}</dd></div>
                <div class="info-row"><dt>Permis</dt><dd>${f.permis}</dd></div>
                <div class="info-row"><dt>Nationalité</dt><dd>${f.nationalite}</dd></div>
              </dl>
            </div>
          </div>

          <div class="card flush">
            <div class="card-head"><h3>Compétences</h3><button class="btn sm ghost">${iconHtml('plus')}</button></div>
            <div class="card-body">
              <div class="skill-tags">${skills}</div>
            </div>
          </div>

          <div class="card flush">
            <div class="card-head"><h3>Langues</h3></div>
            <div class="card-body"><div class="skill-tags">${langues}</div></div>
          </div>

          <div class="card flush">
            <div class="card-head"><h3>Documents</h3><button class="btn sm ghost" id="doc-upload">${iconHtml('upload')}</button></div>
            <div class="card-body">
              <button class="btn btn-block" id="open-docs" style="justify-content:space-between">
                <span style="display:inline-flex;align-items:center;gap:8px">${iconHtml('folder')} <b>5 documents</b></span>
                <span style="color:var(--text-3);font-size:11.5px;display:inline-flex;align-items:center;gap:4px">Ouvrir ${iconHtml('chevron-right')}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Col centre : CV viewer -->
        <div class="fiche-col-center">
          <div class="card flush cv-viewer-wrap">
            <div class="card-head cv-viewer-toolbar">
              <div><h3>CV · ${f.prenom} ${f.nom}</h3><p>Page 1 / 2 · Mis à jour aujourd'hui</p></div>
              <div class="cv-zoom-tools">
                <button class="btn sm ghost" id="cv-zoom-out" title="Dézoomer">${iconHtml('zoom-out')}</button>
                <span class="chip slate tnum" id="cv-zoom-val">100%</span>
                <button class="btn sm ghost" id="cv-zoom-in" title="Zoomer">${iconHtml('zoom-in')}</button>
                <button class="btn sm ghost" id="cv-zoom-fit" title="Ajuster">${iconHtml('maximize-2')}</button>
                <button class="btn sm">${iconHtml('download')} PDF</button>
              </div>
            </div>
            <div class="card-body cv-viewer-body" id="cv-viewer-body">
              <div class="cv-page" id="cv-page">
                <!-- En-tête candidat -->
                <div class="cv-head">
                  <div class="cv-photo">${f.photo ? `<img src="${f.photo}" alt="${f.prenom}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>` : f.initials}</div>
                  <div class="cv-ident">
                    <h1>${f.prenom} ${f.nom}</h1>
                    <div class="cv-role">${f.metier}</div>
                    <div class="cv-contact">
                      <span>${iconHtml('map-pin')} ${f.ville}</span>
                      <span>${iconHtml('phone')} ${f.tel}</span>
                      <span>${iconHtml('mail')} ${f.email}</span>
                    </div>
                  </div>
                </div>

                <div class="cv-grid">
                  <aside class="cv-aside">
                    <div class="cv-block">
                      <h2>Compétences</h2>
                      <ul class="cv-skills">
                        ${f.skills.map(s => `<li>${s}</li>`).join('')}
                      </ul>
                    </div>
                    <div class="cv-block">
                      <h2>Langues</h2>
                      <ul class="cv-langs">
                        ${f.langues.map(l => `<li>${l}</li>`).join('')}
                      </ul>
                    </div>
                    <div class="cv-block">
                      <h2>Informations</h2>
                      <dl class="cv-info">
                        <dt>Permis</dt><dd>${f.permis}</dd>
                        <dt>Nationalité</dt><dd>${f.nationalite}</dd>
                        <dt>Disponible</dt><dd>${f.disponible}</dd>
                      </dl>
                    </div>
                  </aside>

                  <main class="cv-main">
                    <section class="cv-block">
                      <h2>Profil professionnel</h2>
                      <p>${f.profil}</p>
                    </section>

                    <section class="cv-block">
                      <h2>Expérience professionnelle</h2>
                      ${(f.experiences||[]).map(x => `
                        <article class="cv-xp">
                          <div class="cv-xp-head">
                            <div>
                              <h3>${x.poste}</h3>
                              <div class="cv-xp-co">${x.entreprise}${x.lieu ? ` · ${x.lieu}` : ''}</div>
                            </div>
                            <div class="cv-xp-date">${x.periode}</div>
                          </div>
                          <ul>${(x.puces||[]).map(p => `<li>${p}</li>`).join('')}</ul>
                        </article>
                      `).join('')}
                    </section>

                    <section class="cv-block">
                      <h2>Formations & certifications</h2>
                      <ul class="cv-edu">
                        ${(f.formations||[]).map(fo => `<li><b>${fo.titre}</b>${fo.etab ? ` — ${fo.etab}` : ''} <span>${fo.annee}</span></li>`).join('')}
                      </ul>
                    </section>
                  </main>
                </div>

                <footer class="cv-foot">
                  <span>${f.prenom} ${f.nom} · CV 2026</span>
                  <span>Page 1 / 1</span>
                </footer>
              </div>
            </div>
          </div>
        </div>

        <!-- Col droite : activité + notes -->
        <div class="fiche-col-right" style="display:flex;flex-direction:column;gap:var(--gap)">
          <div class="card flush">
            <div class="card-head">
              <div><h3>Timeline</h3><p>Toutes les actions sur ce candidat</p></div>
            </div>
            <div class="card-body">
              <div class="timeline">${timeline}</div>
            </div>
          </div>

          <div class="card flush">
            <div class="card-head"><h3>Notes internes</h3><button class="btn sm ghost">${iconHtml('plus')}</button></div>
            <div class="card-body">
              ${f.notes ? `
                <div style="background:var(--warning-soft);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--text-2)">
                  <b style="color:var(--text);display:block;margin-bottom:4px">⚠ ${f.notes.warn}</b>
                  ${f.notes.body}
                  <div style="font-size:11px;color:var(--text-3);margin-top:6px">${f.notes.auteur}</div>
                </div>
              ` : `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:14px 0">Aucune note pour le moment</div>`}
              <textarea class="textarea" placeholder="Ajouter une note…" style="margin-top:10px"></textarea>
            </div>
          </div>
        </div>
      </div>
    `;

    // Documents modal
    const openDocsBtn = document.getElementById('open-docs');
    if (openDocsBtn) openDocsBtn.addEventListener('click', openDocsModal);

    // CV zoom controls
    const page = document.getElementById('cv-page');
    const valEl = document.getElementById('cv-zoom-val');
    const body = document.getElementById('cv-viewer-body');
    let zoom = 1;
    function applyZoom(){
      if (!page || !valEl) return;
      page.style.transform = `scale(${zoom})`;
      page.style.transformOrigin = 'top left';
      valEl.textContent = Math.round(zoom*100) + '%';
    }
    document.getElementById('cv-zoom-in') ?.addEventListener('click', () => { zoom = Math.min(2, zoom + 0.1); applyZoom(); });
    document.getElementById('cv-zoom-out')?.addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.1); applyZoom(); });
    document.getElementById('cv-zoom-fit')?.addEventListener('click', () => { zoom = 1; applyZoom(); });
    // Ctrl/Cmd + scroll → zoom inside viewer
    body?.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoom = Math.max(0.5, Math.min(2, zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
      applyZoom();
    }, { passive: false });
  }

  function openDocsModal(){
    const iconHtml = n => `<i class="lucide lucide-${n}"></i>`;
    const f = window.__TF_CURRENT_FICHE || window.TF_DATA.fiches[0];
    const docs = f.docs || [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h3>Documents · ${f.prenom} ${f.nom}</h3>
            <p>${docs.length} fichier${docs.length > 1 ? 's' : ''}</p>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn sm">${iconHtml('upload')} Ajouter</button>
            <button class="btn sm ghost" data-close>${iconHtml('x')}</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="doc-list">
            ${docs.map(d => `
              <div class="doc-row">
                <div class="doc-icon ${d.tone}">${iconHtml(d.icon)}</div>
                <div class="doc-meta">
                  <div class="doc-name">${d.name}</div>
                  <div class="doc-sub">
                    <span class="chip slate" style="padding:1px 7px;font-size:10px">${d.type}</span>
                    <span>${d.size}</span>
                    <span>·</span>
                    <span>Ajouté le ${d.date}</span>
                  </div>
                </div>
                <div class="doc-actions">
                  <button class="btn sm ghost" title="Aperçu">${iconHtml('eye')}</button>
                  <button class="btn sm ghost" title="Télécharger">${iconHtml('download')}</button>
                  <button class="btn sm ghost" title="Plus">${iconHtml('more-horizontal')}</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); }
    });
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  window.TF_FICHE = { render };
})();
