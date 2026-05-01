// TalentFlow V2 — Mock data (Suisse romande, réaliste)

window.TF_DATA = (() => {
  const metiers = [
    'Maçon', 'Électricien', 'Chauffeur PL', 'Aide-soignant(e)', 'Carreleur',
    'Menuisier', 'Peintre en bâtiment', 'Infirmier(ère)', 'Opérateur CNC',
    'Couvreur', 'Monteur sanitaire', 'Ferrailleur', 'Grutier', 'Ébéniste',
    'Mécanicien auto', 'Logisticien', 'Cariste', 'Chef de chantier', 'ASSC',
  ];
  const villes = [
    'Monthey, Suisse', 'Sion, Suisse', 'Martigny, Suisse', 'Lausanne, Suisse',
    'Genève, Suisse', 'Fribourg, Suisse', 'Vevey, Suisse', 'Yverdon, Suisse',
    'Bex, Suisse', 'Bulle, Suisse', 'Aigle, Suisse', 'Morges, Suisse',
  ];
  const prenoms = ['Pedro', 'Maria', 'João', 'Sofia', 'Luís', 'Carla', 'Miguel', 'Beatriz', 'Antonio', 'Patricia', 'Ricardo', 'Isabel', 'Bruno', 'Cristina', 'Tiago', 'Leïla', 'Youssef', 'Sandra', 'Claudio', 'Aïcha', 'Jean-Marc', 'Noémie', 'Aleksander', 'Fatima'];
  const noms = ['Ferreira', 'da Silva', 'dos Santos', 'Costa', 'Pereira', 'Gonçalves', 'Oliveira', 'Martins', 'Rodrigues', 'Carvalho', 'Benchaar', 'Ait-Hamou', 'Fragoso Costa', 'Melo', 'Machado', 'Reis', 'Bernardes', 'Lopes', 'Morin', 'Dupuis'];
  const statuts = [
    { k:'nouveau',   lbl:'Nouveau',   cls:'slate' },
    { k:'contacte',  lbl:'Contacté',  cls:'blue' },
    { k:'entretien', lbl:'Entretien', cls:'amber' },
    { k:'place',     lbl:'Placé',     cls:'green' },
    { k:'refuse',    lbl:'Refusé',    cls:'red' },
  ];
  const consultants = ['JB', 'SG', 'NL'];

  // Deterministic seeded random
  let seed = 42;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pickW = (arr, weights) => {
    const total = weights.reduce((a,b)=>a+b, 0);
    let r = rnd() * total;
    for (let i=0; i<arr.length; i++){ r -= weights[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length-1];
  };

  const candidats = [];
  for (let i=0; i<48; i++){
    const prenom = pick(prenoms);
    const nom = pick(noms);
    const s = pickW(statuts, [3, 4, 3, 2, 1]);
    const gender = rnd() > 0.7 ? 'women' : 'men';
    const photoIdx = Math.floor(rnd() * 99);
    // Some candidates don't have photos (realistic) — show initials fallback
    const hasPhoto = rnd() > 0.25;
    candidats.push({
      id: 1000 + i,
      prenom, nom,
      initials: (prenom[0] + nom[0]).toUpperCase(),
      photo: hasPhoto ? `https://randomuser.me/api/portraits/${gender}/${photoIdx}.jpg` : null,
      metier: pick(metiers),
      ville: pick(villes),
      tel: `+41 7${Math.floor(rnd()*9)+1} ${Math.floor(100+rnd()*900)} ${Math.floor(10+rnd()*90)} ${Math.floor(10+rnd()*90)}`,
      email: `${prenom.toLowerCase().replace(/[^a-z]/g,'')}.${nom.toLowerCase().replace(/[^a-z]/g,'')}@email.ch`,
      score: Math.floor(50 + rnd() * 50),
      statut: s,
      consultant: pick(consultants),
      isNew: rnd() > 0.72,
      importDays: Math.floor(rnd() * 28),
      experience: Math.floor(1 + rnd() * 25),
      age: Math.floor(22 + rnd() * 36),
      note: 1 + Math.floor(rnd() * 5),
    });
  }

  const kpis = [
    { label:'Candidats actifs',   value: 6302, delta: '+148', dir:'up',   icon:'users',        tone:'',        spark:[40,44,42,48,51,55,58,62,67,72,78,82,88,94] },
    { label:'Clients actifs',     value: 1247, delta: '+12',  dir:'up',   icon:'building-2',   tone:'blue',    spark:[30,32,31,34,38,42,44,45,48,50,52,54,56,58] },
    { label:'Missions ouvertes',  value: 312,  delta: '+18',  dir:'up',   icon:'briefcase',    tone:'green',   spark:[210,220,230,235,240,255,260,270,280,285,295,300,308,312] },
    { label:'Placements · avril', value: 89,   delta: '-3',   dir:'down', icon:'trending-up',  tone:'purple',  spark:[60,64,70,68,72,78,75,80,82,78,85,82,87,89] },
  ];

  // Candidats importés / mois (bar chart) — jan → avr
  const imports = [
    { m:'Nov', v: 342 }, { m:'Déc', v: 298 }, { m:'Jan', v: 412 }, { m:'Fév', v: 488 },
    { m:'Mar', v: 524 }, { m:'Avr', v: 378 },
  ];

  const pipelineConsultants = [
    { name:'João',    segs:{nouveau: 22, contacte: 18, entretien: 9, place: 6, refuse: 4} },
    { name:'Seb',     segs:{nouveau: 15, contacte: 22, entretien: 12, place: 8, refuse: 3} },
    { name:'Noémie',  segs:{nouveau: 12, contacte: 14, entretien: 7, place: 4, refuse: 2} },
  ];

  const activity = [
    { type:'import', text:'<b>432 CV</b> importés depuis OneDrive', sub:'Sync automatique', time:'il y a 5 min' },
    { type:'match',  text:'Match fort sur <b>Pedro Ferreira</b> — Maçon', sub:'Score 18/20 · Offre #2844 Rossetti SA', time:'il y a 12 min' },
    { type:'note',   text:'<b>Sofia da Silva</b> a été placée chez Boulanger SA', sub:'Contrat du 22 avril', time:'il y a 38 min' },
    { type:'alert',  text:'3 candidats en attente de validation', sub:'Zone uncertain — score 9/20', time:'il y a 1 h' },
    { type:'import', text:'<b>Luís Costa</b> réactivé — nouveau CV reçu', sub:'Même fichier, date différente', time:'il y a 2 h' },
    { type:'match',  text:'Entretien confirmé avec <b>Miguel Pereira</b>', sub:'Mardi 22 avril · 14h30', time:'il y a 3 h' },
  ];

  const reminders = [
    { day: 22, mo:'avr', title:'Entretien — Pedro Ferreira', sub:'Rossetti SA · 14h30 · Monthey' },
    { day: 23, mo:'avr', title:'Relance — Boulanger SA', sub:'3 candidats maçon en attente de retour' },
    { day: 24, mo:'avr', title:'Signature contrat — Sofia da Silva', sub:'Boulanger SA · Début 01.05' },
  ];

  // ─── 10 fiches CV détaillées ────────────────────────────────────────────────
  // Profils réalistes Valais/Vaud, métiers BTP/industrie/santé/logistique.
  const fiches = [
    {
      id: 1000, prenom: 'Pedro', nom: 'Ferreira', initials: 'PF',
      photo: 'https://randomuser.me/api/portraits/men/32.jpg',
      metier: 'Maçon qualifié', ville: 'Monthey, Suisse',
      tel: '+41 79 482 17 56', email: 'pedro.ferreira@email.ch',
      score: 94, statut: statuts[2], consultant: 'João Barbosa',
      disponible: '01.05.2026', permis: 'B — Suisse', experience: 12, nationalite: 'Portugaise',
      langues: ['FR (courant)','PT (natif)','IT (basique)'],
      skills: ['Coffrage', 'Béton armé', 'Maçonnerie pierre', 'Lecture de plans', 'Sécurité chantier', 'SUVA', 'Permis grue'],
      profil: "Maçon qualifié avec 12 ans d'expérience sur chantiers résidentiels et industriels en Suisse romande. Spécialisé en coffrage, béton armé et maçonnerie pierre naturelle. Permis grue à tour et formation SUVA sécurité chantier. Bilingue français/portugais, notions d'italien.",
      experiences: [
        { poste:"Chef d'équipe maçonnerie", entreprise:'Rossetti SA', lieu:'Sion, VS', periode:'2021 — 2026',
          puces:["Gestion d'équipes de 4 à 8 maçons sur chantiers résidentiels et commerciaux","Lecture de plans, organisation des approvisionnements et suivi sécurité SUVA","Réalisation de structures en béton armé jusqu'à 6 étages (projet Les Collines, Sion)"] },
        { poste:'Maçon qualifié', entreprise:'Boulanger Construction', lieu:'Monthey, VS', periode:'2016 — 2021',
          puces:["Coffrage, ferraillage et coulage sur chantiers de villas individuelles et petits immeubles","Maçonnerie traditionnelle pierre naturelle (rénovations patrimoine valaisan)"] },
        { poste:'Aide-maçon', entreprise:'BTP Valais', lieu:'Martigny, VS', periode:'2014 — 2016',
          puces:["Apprentissage pratique post-CFC, support aux équipes maçonnerie et béton"] },
      ],
      formations: [
        { titre:'CFC Maçon', etab:'École Technique, Sion', annee:'2014' },
        { titre:'Permis grue à tour', etab:'CFST', annee:'2019' },
        { titre:'SUVA Sécurité chantier', etab:'Module coffrage hauteur', annee:'2022' },
        { titre:'Premiers secours', etab:'Samaritains Valais', annee:'2023' },
      ],
      notes: { warn:'Disponible immédiatement', body:'Cherche mission longue durée. A refusé un poste à Lausanne (trop loin).', auteur:'João · 17 avr 11:48' },
      timeline: [
        { icon:'file-up',    tone:'',       title:'CV mis à jour',   body:'Nouvelle version reçue via OneDrive — sync automatique', time:"Aujourd'hui · 09:12" },
        { icon:'user-check', tone:'green',  title:'Entretien réussi',body:'Rossetti SA — feedback positif, prêt pour placement', time:'Hier · 16:30' },
        { icon:'mail',       tone:'blue',   title:'Email envoyé',    body:'Confirmation entretien du 22 avril', time:'18 avril · 14:02' },
        { icon:'pencil',     tone:'purple', title:'Note ajoutée',    body:'Disponible immédiatement, cherche mission longue durée', time:'17 avril · 11:48' },
        { icon:'file-plus',  tone:'',       title:'Candidat créé',   body:'Import manuel depuis CV_Ferreira_2026.pdf', time:'15 avril · 08:23' },
      ],
      docs: [
        { name:'CV_Ferreira_2026.pdf',        type:'CV',           size:'284 Ko', date:'22 avr 2026', icon:'file-text',   tone:'' },
        { name:'Permis_B.pdf',                type:'Permis',       size:'412 Ko', date:'15 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'Diplôme_CFC_Maçon.pdf',       type:'Formation',    size:'876 Ko', date:'15 avr 2026', icon:'award',       tone:'purple' },
        { name:'Permis_grue_tour_CFST.pdf',   type:'Certification',size:'521 Ko', date:'15 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'SUVA_Sécurité_2022.pdf',      type:'Certification',size:'198 Ko', date:'03 mar 2025', icon:'shield-check',tone:'green' },
        { name:'Lettre_recommandation_Rossetti.pdf', type:'Référence', size:'156 Ko', date:'28 fév 2026', icon:'mail', tone:'amber' },
      ],
    },
    {
      id: 1001, prenom: 'Sofia', nom: 'da Silva', initials: 'SS',
      photo: 'https://randomuser.me/api/portraits/women/44.jpg',
      metier: 'Aide-soignante CFC', ville: 'Sion, Suisse',
      tel: '+41 78 645 22 81', email: 'sofia.dasilva@email.ch',
      score: 88, statut: statuts[3], consultant: 'Noémie Lavigne',
      disponible: '15.05.2026', permis: 'B — Suisse', experience: 8, nationalite: 'Portugaise',
      langues: ['FR (natif)','PT (natif)','EN (intermédiaire)'],
      skills: ['Soins quotidiens', 'EMS', 'Hygiène hospitalière', 'Mobilisation patient', 'Dossier patient', 'Travail de nuit'],
      profil: "Aide-soignante CFC avec 8 ans d'expérience en EMS et soins à domicile. Habituée aux résidents Alzheimer et soins palliatifs. Disponible pour shifts de jour, nuit et weekend. Empathique, ponctuelle, à l'aise en équipe pluridisciplinaire.",
      experiences: [
        { poste:'Aide-soignante référente', entreprise:'EMS Castel Notre-Dame', lieu:'Martigny, VS', periode:'2022 — 2026',
          puces:["Référente unité fermée Alzheimer (24 résidents)","Formation continue des nouvelles collègues sur les protocoles EMS","Coordination avec infirmières-cheffes et médecin traitant"] },
        { poste:'Aide-soignante', entreprise:'Spitex Valais central', lieu:'Sion, VS', periode:'2018 — 2022',
          puces:["Soins à domicile pour 12 à 18 patients/jour","Toilettes, prises de tension, prévention des escarres"] },
      ],
      formations: [
        { titre:'CFC Assistante en soins et santé communautaire (ASSC)', etab:'École Santé-Social Valais', annee:'2018' },
        { titre:'Formation Alzheimer & démences', etab:'Croix-Rouge Valais', annee:'2023' },
      ],
      notes: { warn:'Préfère mission longue durée', body:'Disponible nuits et weekends. Refuse les remplacements de moins de 2 semaines.', auteur:'Noémie · 19 avr 14:22' },
      timeline: [
        { icon:'check-circle', tone:'green', title:'Placement confirmé', body:'EMS Castel Notre-Dame — début 15 mai', time:"Aujourd'hui · 10:45" },
        { icon:'file-signature', tone:'blue', title:'Contrat envoyé', body:'CDI 80% — signature en attente', time:'Hier · 16:00' },
        { icon:'user-check', tone:'green', title:'Entretien réussi', body:'Très bon feedback de la directrice EMS', time:'18 avril · 09:30' },
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Coordonnées RH transmises', time:'15 avril · 11:12' },
      ],
      docs: [
        { name:'CV_DaSilva_2026.pdf', type:'CV', size:'312 Ko', date:'14 avr 2026', icon:'file-text', tone:'' },
        { name:'CFC_ASSC.pdf', type:'Formation', size:'742 Ko', date:'14 avr 2026', icon:'award', tone:'purple' },
        { name:'Permis_B.pdf', type:'Permis', size:'398 Ko', date:'14 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'Lettre_référence_Spitex.pdf', type:'Référence', size:'168 Ko', date:'10 avr 2026', icon:'mail', tone:'amber' },
      ],
    },
    {
      id: 1002, prenom: 'Aleksander', nom: 'Markovic', initials: 'AM',
      photo: 'https://randomuser.me/api/portraits/men/52.jpg',
      metier: 'Soudeur TIG/MIG', ville: 'Vevey, Suisse',
      tel: '+41 76 312 88 04', email: 'a.markovic@email.ch',
      score: 91, statut: statuts[1], consultant: 'João Barbosa',
      disponible: 'Immédiate', permis: 'B — Suisse', experience: 15, nationalite: 'Serbe (permis C)',
      langues: ['FR (courant)','SR (natif)','DE (basique)','EN (intermédiaire)'],
      skills: ['Soudure TIG', 'Soudure MIG/MAG', 'Acier inox', 'Lecture iso', 'Tuyauterie industrielle', 'Cert. EN ISO 9606'],
      profil: "Soudeur certifié EN ISO 9606 avec 15 ans d'expérience en industrie agroalimentaire et chimique. Spécialisé soudure TIG inox sur tuyauteries process. Habitué environnements ATEX et qualifications X-Ray.",
      experiences: [
        { poste:'Soudeur certifié TIG', entreprise:'Nestlé Manufacturing', lieu:'Orbe, VD', periode:'2019 — 2026',
          puces:["Soudure TIG inox 304/316 sur lignes de production agroalimentaire","Qualifications X-Ray validées chaque année","Maintenance préventive et urgente sur tuyauteries process"] },
        { poste:'Soudeur MIG/MAG', entreprise:'Bobst Mex', lieu:'Mex, VD', periode:'2014 — 2019',
          puces:["Soudure de structures et carters pour machines d'emballage","Lecture de plans techniques complexes (cotation ISO)"] },
        { poste:'Soudeur (atelier)', entreprise:'MetalServ Belgrade', lieu:'Belgrade, RS', periode:'2010 — 2014',
          puces:["Premier emploi — atelier de chaudronnerie industrielle"] },
      ],
      formations: [
        { titre:'Certification EN ISO 9606-1 (TIG inox)', etab:'SVS Schweisstechnik', annee:'2020' },
        { titre:'Brevet de soudeur', etab:'École technique Belgrade', annee:'2009' },
        { titre:'Habilitation ATEX zone 1/2', etab:'Bureau Veritas', annee:'2022' },
      ],
      notes: { warn:'Excellent technique', body:'Très demandé. Entretien validé par 2 clients en 2025, refus pour raison salariale.', auteur:'João · 12 avr 15:30' },
      timeline: [
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Proposition mission Bobst Mex', time:"Aujourd'hui · 11:22" },
        { icon:'phone', tone:'', title:'Appel téléphonique', body:'Discussion conditions salariales', time:'Hier · 17:45' },
        { icon:'file-plus', tone:'', title:'Candidat réactivé', body:'Nouveau CV reçu (mise à jour qualifications)', time:'10 avril · 08:14' },
      ],
      docs: [
        { name:'CV_Markovic_2026.pdf', type:'CV', size:'298 Ko', date:'10 avr 2026', icon:'file-text', tone:'' },
        { name:'Cert_EN_ISO_9606.pdf', type:'Certification', size:'441 Ko', date:'10 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'Habilitation_ATEX.pdf', type:'Certification', size:'287 Ko', date:'10 avr 2026', icon:'shield-check', tone:'green' },
        { name:'Permis_C.pdf', type:'Permis', size:'401 Ko', date:'10 avr 2026', icon:'badge-check', tone:'blue' },
      ],
    },
    {
      id: 1003, prenom: 'Maria', nom: 'Gonçalves', initials: 'MG',
      photo: 'https://randomuser.me/api/portraits/women/65.jpg',
      metier: 'Logisticienne CFC', ville: 'Aigle, Suisse',
      tel: '+41 78 119 64 27', email: 'maria.goncalves@email.ch',
      score: 82, statut: statuts[1], consultant: 'Seb Gillioz',
      disponible: '01.06.2026', permis: 'B — Suisse', experience: 6, nationalite: 'Suisse-Portugaise',
      langues: ['FR (natif)','PT (natif)','DE (intermédiaire)','EN (intermédiaire)'],
      skills: ['CFC Logistique', 'SAP MM/WM', 'Cariste cat. R489-3', 'Inventaire', 'Réception/expédition', 'Excel avancé'],
      profil: "Logisticienne CFC avec 6 ans d'expérience en entrepôt agroalimentaire et industriel. Maîtrise SAP MM/WM, cariste catégorie 3 et 5. Cherche évolution vers poste de coordination ou chef d'équipe logistique.",
      experiences: [
        { poste:"Logisticienne — préparation commandes", entreprise:'Migros Distribution', lieu:'Suhr, AG', periode:'2022 — 2026',
          puces:["Préparation commandes B2B (HoReCa) — 80 lignes/jour en moyenne","Saisie SAP, inventaires tournants mensuels, gestion des écarts","Formation des nouveaux apprentis (3 stagiaires sur 2 ans)"] },
        { poste:'Cariste — réception', entreprise:'Logitec SA', lieu:'Aigle, VD', periode:'2020 — 2022',
          puces:["Réception camions, contrôle qualité et étiquetage","Cariste R489-3 (chariots à mât rétractable)"] },
      ],
      formations: [
        { titre:'CFC Logistique', etab:'CFP Aigle', annee:'2020' },
        { titre:'Cariste R489 cat. 3 et 5', etab:'CRES Lausanne', annee:'2021' },
        { titre:'SAP Logistics — formation interne', etab:'Migros Genossenschafts-Bund', annee:'2023' },
      ],
      notes: { warn:'Souhaite évolution', body:'Cherche poste avec responsabilités d\'équipe. Pas intéressée par missions courtes < 6 mois.', auteur:'Seb · 16 avr 09:00' },
      timeline: [
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Présentation offre Coop Aigle', time:'Hier · 14:30' },
        { icon:'pencil', tone:'purple', title:'Note ajoutée', body:'Cherche poste avec responsabilités d\'équipe', time:'16 avril · 09:00' },
        { icon:'file-up', tone:'', title:'CV mis à jour', body:'Ajout certification SAP', time:'14 avril · 16:18' },
      ],
      docs: [
        { name:'CV_Goncalves_2026.pdf', type:'CV', size:'342 Ko', date:'14 avr 2026', icon:'file-text', tone:'' },
        { name:'CFC_Logistique.pdf', type:'Formation', size:'612 Ko', date:'14 avr 2026', icon:'award', tone:'purple' },
        { name:'Permis_cariste_R489.pdf', type:'Certification', size:'234 Ko', date:'14 avr 2026', icon:'badge-check', tone:'blue' },
      ],
    },
    {
      id: 1004, prenom: 'João', nom: 'Oliveira', initials: 'JO',
      photo: 'https://randomuser.me/api/portraits/men/15.jpg',
      metier: 'Électricien CFC', ville: 'Martigny, Suisse',
      tel: '+41 79 271 03 92', email: 'joao.oliveira@email.ch',
      score: 89, statut: statuts[2], consultant: 'João Barbosa',
      disponible: '15.05.2026', permis: 'B — Suisse', experience: 9, nationalite: 'Portugaise',
      langues: ['FR (courant)','PT (natif)','EN (basique)'],
      skills: ['Installation BT', 'Câblage tableau', 'Domotique KNX', 'Lecture schémas', 'Norme NIBT', 'Permis échelle'],
      profil: "Électricien CFC avec 9 ans d'expérience en bâtiment résidentiel et tertiaire. Maîtrise des installations basse tension, tableaux électriques et domotique KNX. Habitué aux contrôles ESTI et normes NIBT.",
      experiences: [
        { poste:"Électricien chef de chantier", entreprise:'ElectroSion SA', lieu:'Sion, VS', periode:'2022 — 2026',
          puces:["Coordination de chantiers résidentiels (villas + immeubles 12 appartements)","Réception ESTI, conformité NIBT, levée de réserves","Installation domotique KNX sur 4 villas haut-de-gamme (Crans-Montana)"] },
        { poste:'Électricien CFC', entreprise:'Burgener Électricité', lieu:'Martigny, VS', periode:'2017 — 2022',
          puces:["Câblage tableaux, tirage de câbles, prises et luminaires","Petits dépannages chez clients particuliers et entreprises"] },
      ],
      formations: [
        { titre:'CFC Électricien de montage', etab:'CFP Sion', annee:'2017' },
        { titre:'Certification KNX Partner Basic', etab:'KNX Association', annee:'2023' },
        { titre:'Travail en hauteur — échelle/échafaudage', etab:'SUVA', annee:'2024' },
      ],
      notes: { warn:'Entretien planifié', body:'RDV mardi 22 avril 14h30 chez ElectroValais SA. Très motivé.', auteur:'João · 18 avr 17:00' },
      timeline: [
        { icon:'calendar', tone:'amber', title:'Entretien planifié', body:'ElectroValais SA — mardi 22 avril 14h30', time:'Hier · 17:00' },
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Confirmation horaire et adresse', time:'Hier · 14:12' },
        { icon:'phone', tone:'', title:'Appel téléphonique', body:'Discussion conditions et type de mission', time:'17 avril · 11:00' },
      ],
      docs: [
        { name:'CV_Oliveira_2026.pdf', type:'CV', size:'276 Ko', date:'17 avr 2026', icon:'file-text', tone:'' },
        { name:'CFC_Electricien.pdf', type:'Formation', size:'692 Ko', date:'17 avr 2026', icon:'award', tone:'purple' },
        { name:'KNX_Partner.pdf', type:'Certification', size:'312 Ko', date:'17 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'SUVA_Travail_hauteur.pdf', type:'Certification', size:'201 Ko', date:'17 avr 2026', icon:'shield-check', tone:'green' },
      ],
    },
    {
      id: 1005, prenom: 'Leïla', nom: 'Benchaar', initials: 'LB',
      photo: 'https://randomuser.me/api/portraits/women/22.jpg',
      metier: 'Infirmière HES', ville: 'Lausanne, Suisse',
      tel: '+41 79 884 51 14', email: 'leila.benchaar@email.ch',
      score: 95, statut: statuts[2], consultant: 'Noémie Lavigne',
      disponible: '01.07.2026', permis: 'C — UE', experience: 11, nationalite: 'Marocaine (permis C)',
      langues: ['FR (natif)','AR (natif)','EN (courant)','DE (basique)'],
      skills: ['Soins aigus', 'Service urgences', 'Médication IV', 'Prise en charge polytraumatisé', 'Encadrement étudiants', 'IPS'],
      profil: "Infirmière HES diplômée avec 11 ans d'expérience dont 7 en service d'urgences au CHUV. Référente IPS (infirmière praticienne spécialisée) en cardiologie depuis 2024. Bilingue FR/AR, niveau B2 allemand.",
      experiences: [
        { poste:'Infirmière référente — Urgences', entreprise:'CHUV', lieu:'Lausanne, VD', periode:'2018 — 2026',
          puces:["Prise en charge urgences vitales (polytraumatisés, AVC, IDM)","Encadrement de 4 stagiaires HES par semestre","Référente du protocole sepsis depuis 2022"] },
        { poste:'Infirmière diplômée', entreprise:'Hôpital de Sion', lieu:'Sion, VS', periode:'2014 — 2018',
          puces:["Service de médecine interne — patients chroniques","Coordination avec les médecins assistants et chefs de clinique"] },
      ],
      formations: [
        { titre:'Bachelor HES Soins infirmiers', etab:'HEdS La Source, Lausanne', annee:'2014' },
        { titre:'CAS Infirmière praticienne spécialisée (IPS)', etab:'Université de Lausanne', annee:'2024' },
        { titre:'Formation continue — Sepsis & soins critiques', etab:'CHUV', annee:'2022' },
      ],
      notes: { warn:'Profil rare', body:'Niveau exceptionnel. À placer chez un client premium uniquement (HUG, Hirslanden).', auteur:'Noémie · 11 avr 10:00' },
      timeline: [
        { icon:'calendar', tone:'amber', title:'Entretien planifié', body:'Hirslanden Lausanne — vendredi 25 avril 10h', time:"Aujourd'hui · 08:30" },
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Présentation profil + dossier complet', time:'18 avril · 15:42' },
        { icon:'pencil', tone:'purple', title:'Note ajoutée', body:'Profil rare, à placer chez un client premium', time:'11 avril · 10:00' },
      ],
      docs: [
        { name:'CV_Benchaar_2026.pdf', type:'CV', size:'412 Ko', date:'08 avr 2026', icon:'file-text', tone:'' },
        { name:'Bachelor_HES.pdf', type:'Formation', size:'891 Ko', date:'08 avr 2026', icon:'award', tone:'purple' },
        { name:'CAS_IPS.pdf', type:'Formation', size:'654 Ko', date:'08 avr 2026', icon:'award', tone:'purple' },
        { name:'Permis_C.pdf', type:'Permis', size:'389 Ko', date:'08 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'Reference_CHUV.pdf', type:'Référence', size:'201 Ko', date:'05 avr 2026', icon:'mail', tone:'amber' },
      ],
    },
    {
      id: 1006, prenom: 'Bruno', nom: 'Costa', initials: 'BC',
      photo: 'https://randomuser.me/api/portraits/men/76.jpg',
      metier: 'Chauffeur PL — cat. C/E', ville: 'Bex, Suisse',
      tel: '+41 76 408 71 59', email: 'bruno.costa@email.ch',
      score: 78, statut: statuts[0], consultant: 'Seb Gillioz',
      disponible: 'Immédiate', permis: 'C/E + ADR', experience: 14, nationalite: 'Portugaise',
      langues: ['FR (courant)','PT (natif)','ES (intermédiaire)'],
      skills: ['Permis C/E', 'ADR base + citerne', 'OACP à jour', 'Tachy numérique', 'International longue distance'],
      profil: "Chauffeur PL cat. C/E avec 14 ans de longue distance international (CH/FR/IT/ES). Permis ADR base et citerne, OACP à jour jusqu'en 2027. Habitué transports temperature-controlled et marchandises dangereuses ADR cl. 3.",
      experiences: [
        { poste:'Chauffeur international longue distance', entreprise:'Transports Bex SA', lieu:'Bex, VD', periode:'2018 — 2026',
          puces:["Tournées hebdomadaires CH-FR-IT-ES (frigorifique)","Transport ADR classe 3 (carburants) sur certaines tournées","Aucun accident en 14 ans de carrière"] },
        { poste:'Chauffeur national', entreprise:'Coop Logistique', lieu:'Bussigny, VD', periode:'2012 — 2018',
          puces:["Distribution magasins Coop Suisse romande","Tournées de nuit, déchargement sur quai"] },
      ],
      formations: [
        { titre:'Permis C/E', etab:'OCN Vaud', annee:'2011' },
        { titre:'ADR base + citerne', etab:'ASTAG', annee:'2019' },
        { titre:'OACP — modules continus', etab:'ASTAG', annee:'2024' },
      ],
      notes: null,
      timeline: [
        { icon:'file-plus', tone:'', title:'Candidat créé', body:'Import OneDrive automatique', time:"Aujourd'hui · 07:42" },
        { icon:'sparkles', tone:'amber', title:'Match IA détecté', body:'Score 16/20 sur Offre #2901 (Transports VS)', time:"Aujourd'hui · 07:43" },
      ],
      docs: [
        { name:'CV_Costa_Bruno_2026.pdf', type:'CV', size:'298 Ko', date:'22 avr 2026', icon:'file-text', tone:'' },
        { name:'Permis_CE.pdf', type:'Permis', size:'421 Ko', date:'22 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'OACP_2024.pdf', type:'Certification', size:'234 Ko', date:'22 avr 2026', icon:'badge-check', tone:'blue' },
        { name:'ADR_base_citerne.pdf', type:'Certification', size:'298 Ko', date:'22 avr 2026', icon:'shield-check', tone:'green' },
      ],
    },
    {
      id: 1007, prenom: 'Patricia', nom: 'Reis', initials: 'PR',
      photo: 'https://randomuser.me/api/portraits/women/89.jpg',
      metier: 'Peintre en bâtiment', ville: 'Fribourg, Suisse',
      tel: '+41 78 562 18 77', email: 'patricia.reis@email.ch',
      score: 73, statut: statuts[0], consultant: 'Seb Gillioz',
      disponible: '05.05.2026', permis: 'B — Suisse', experience: 5, nationalite: 'Brésilienne (permis B)',
      langues: ['FR (courant)','PT (natif)','ES (courant)'],
      skills: ['Peinture intérieure', 'Façade', 'Crépi/enduit', 'Tapisserie', 'Préparation supports', 'Travail en hauteur'],
      profil: "Peintre en bâtiment avec 5 ans d'expérience en peinture intérieure résidentielle et façade. Habituée chantiers neufs et rénovations. Permis travail en hauteur valide. Soigneuse, propre, ponctuelle.",
      experiences: [
        { poste:'Peintre en bâtiment', entreprise:'Décor Plus Fribourg', lieu:'Fribourg, FR', periode:'2022 — 2026',
          puces:["Peinture intérieure sur chantiers résidentiels neufs (immeubles 8-30 logements)","Crépi extérieur et façade sur chantiers de rénovation"] },
        { poste:'Aide-peintre', entreprise:'Atelier Couleurs SA', lieu:'Bulle, FR', periode:'2021 — 2022',
          puces:["Préparation supports, enduit, ponçage, masquage","Apprentissage rapide des techniques de finition haut-de-gamme"] },
      ],
      formations: [
        { titre:'AFP Peintre en bâtiment', etab:'CFP Fribourg', annee:'2021' },
        { titre:'Travail en hauteur — échafaudage', etab:'SUVA', annee:'2023' },
      ],
      notes: null,
      timeline: [
        { icon:'file-plus', tone:'', title:'Candidat créé', body:'Réponse à annonce — site web', time:"Aujourd'hui · 14:18" },
        { icon:'sparkles', tone:'', title:'Score IA calculé', body:'73/100 — bon profil junior', time:"Aujourd'hui · 14:19" },
      ],
      docs: [
        { name:'CV_Reis_2026.pdf', type:'CV', size:'231 Ko', date:'22 avr 2026', icon:'file-text', tone:'' },
        { name:'AFP_Peintre.pdf', type:'Formation', size:'487 Ko', date:'22 avr 2026', icon:'award', tone:'purple' },
        { name:'Permis_B.pdf', type:'Permis', size:'378 Ko', date:'22 avr 2026', icon:'badge-check', tone:'blue' },
      ],
    },
    {
      id: 1008, prenom: 'Tiago', nom: 'Martins', initials: 'TM',
      photo: 'https://randomuser.me/api/portraits/men/41.jpg',
      metier: 'Carreleur', ville: 'Riddes, Suisse',
      tel: '+41 79 712 04 65', email: 'tiago.martins@email.ch',
      score: 86, statut: statuts[1], consultant: 'João Barbosa',
      disponible: '01.05.2026', permis: 'B — Suisse', experience: 10, nationalite: 'Portugaise',
      langues: ['FR (intermédiaire)','PT (natif)','ES (basique)'],
      skills: ['Pose grand format', 'Mosaïque', 'Joints époxy', 'Étanchéité salle de bain', 'Découpe diamant', 'CFC Carreleur'],
      profil: "Carreleur CFC avec 10 ans d'expérience en pose grand format (60x120, 120x240) et mosaïque haut-de-gamme. Spécialisé salles de bains et cuisines design. Très soigné, finitions parfaites.",
      experiences: [
        { poste:'Carreleur CFC', entreprise:'Tiles & Stones SA', lieu:'Sion, VS', periode:'2019 — 2026',
          puces:["Pose grand format (jusqu'à 120x240) sur villas haut-de-gamme","Mosaïque vénitienne et marbre sur salles de bains","Réception client final + photos avant/après"] },
        { poste:'Aide-carreleur puis Carreleur', entreprise:'Carrelages Valais', lieu:'Martigny, VS', periode:'2016 — 2019',
          puces:["Apprentissage progressif, montée en autonomie en 2 ans"] },
      ],
      formations: [
        { titre:'CFC Carreleur', etab:'CFP Sion', annee:'2018' },
        { titre:'Spécialisation pose grand format', etab:'Tiles & Stones Academy', annee:'2022' },
      ],
      notes: { warn:'Très bon technique', body:'Excellent retour client sur 3 chantiers consécutifs. À privilégier sur projets exigeants.', auteur:'João · 14 avr 11:30' },
      timeline: [
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'Présentation mission Crans-Montana', time:'Hier · 10:15' },
        { icon:'pencil', tone:'purple', title:'Note ajoutée', body:'Excellent retour client sur 3 chantiers', time:'14 avril · 11:30' },
      ],
      docs: [
        { name:'CV_Martins_2026.pdf', type:'CV', size:'265 Ko', date:'14 avr 2026', icon:'file-text', tone:'' },
        { name:'CFC_Carreleur.pdf', type:'Formation', size:'598 Ko', date:'14 avr 2026', icon:'award', tone:'purple' },
        { name:'Photos_realisations.pdf', type:'Portfolio', size:'4.2 Mo', date:'14 avr 2026', icon:'image', tone:'amber' },
      ],
    },
    {
      id: 1009, prenom: 'Cristina', nom: 'Bernardes', initials: 'CB',
      photo: 'https://randomuser.me/api/portraits/women/33.jpg',
      metier: 'Opératrice CNC', ville: 'Yverdon, Suisse',
      tel: '+41 78 094 55 38', email: 'cristina.bernardes@email.ch',
      score: 81, statut: statuts[1], consultant: 'Seb Gillioz',
      disponible: '15.05.2026', permis: 'B — Suisse', experience: 7, nationalite: 'Portugaise',
      langues: ['FR (courant)','PT (natif)','EN (intermédiaire)'],
      skills: ['Programmation CN', 'Fanuc', 'Heidenhain', 'Lecture de plans', 'Métrologie', 'Tournage 3 axes', 'Fraisage 5 axes'],
      profil: "Opératrice CNC avec 7 ans d'expérience en usinage de précision. Programmation Fanuc et Heidenhain. Habituée séries courtes et prototypes médicaux/horlogers. Tolérances jusqu'au µm.",
      experiences: [
        { poste:'Opératrice CNC fraisage 5 axes', entreprise:'Précitech Yverdon', lieu:'Yverdon, VD', periode:'2021 — 2026',
          puces:["Usinage de pièces médicales (implants titane) — tolérances ±5µm","Programmation Heidenhain et contrôle qualité métrologique"] },
        { poste:'Opératrice tournage CNC', entreprise:'Mécanique Jura', lieu:'Le Sentier, VD', periode:'2018 — 2021',
          puces:["Tournage de séries courtes pour industrie horlogère","Fanuc et Mazak"] },
      ],
      formations: [
        { titre:'CFC Polymécanicienne', etab:'CFP Yverdon', annee:'2018' },
        { titre:'Formation Heidenhain TNC640', etab:'Heidenhain Suisse', annee:'2022' },
      ],
      notes: { warn:'Profil bilingue rare', body:'Une des rares profils CNC qui parle portugais courant — utile pour ateliers à dominante PT.', auteur:'Seb · 13 avr 16:00' },
      timeline: [
        { icon:'phone', tone:'', title:'Appel téléphonique', body:'Disponibilité confirmée pour mai', time:"Aujourd'hui · 11:00" },
        { icon:'mail', tone:'blue', title:'Email envoyé', body:'CV transmis chez Précitech Vallorbe', time:'Hier · 15:22' },
      ],
      docs: [
        { name:'CV_Bernardes_2026.pdf', type:'CV', size:'287 Ko', date:'12 avr 2026', icon:'file-text', tone:'' },
        { name:'CFC_Polymecanique.pdf', type:'Formation', size:'612 Ko', date:'12 avr 2026', icon:'award', tone:'purple' },
        { name:'Heidenhain_TNC640.pdf', type:'Certification', size:'334 Ko', date:'12 avr 2026', icon:'badge-check', tone:'blue' },
      ],
    },
  ];

  // Sync les 10 premières lignes du tableau avec les fiches détaillées
  // (mêmes IDs, photos, métiers — pour que cliquer sur la ligne ouvre la bonne fiche)
  fiches.forEach((f, i) => {
    if (candidats[i]){
      Object.assign(candidats[i], {
        id: f.id,
        prenom: f.prenom,
        nom: f.nom,
        initials: f.initials,
        photo: f.photo,
        metier: f.metier,
        ville: f.ville,
        tel: f.tel,
        email: f.email,
        score: f.score,
        statut: f.statut,
      });
    }
  });

  // Default fiche = première (Pedro Ferreira), pour compat avec l'ancien code
  const fiche = fiches[0];

  return { candidats, statuts, kpis, imports, pipelineConsultants, activity, reminders, fiche, fiches };
})();
