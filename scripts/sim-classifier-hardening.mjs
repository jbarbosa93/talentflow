#!/usr/bin/env node
/**
 * Simulation — durcissement classifier non-CV (v1.10.0)
 *
 * Objectif :
 *   Comparer OLD (lib/document-classification.ts actuel) vs NEW (CV-markers prioritaires)
 *   sur 3 datasets :
 *     A) 100 CVs réels (candidats avec cv_texte_brut + experiences) → attendu 100% CV
 *     B) 20 cas synthétiques non-CV (certif/attestation/lettre/permis…) → attendu 100% non-CV
 *     C) 5 cas Loïc Arluna (1 CV à débugger + 4 non-CV cascade) → attendu 1 CV + 4 non-CV
 *
 * Aucune modification DB ni fichier source. Lecture seule.
 *
 * Usage : node --env-file=.env.local scripts/sim-classifier-hardening.mjs
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── Classifier OLD (copie fidèle de lib/document-classification.ts) ─────────
const GENERIC_EMAIL_PREFIX = /^(info|contact|rh|hr|hrdirektion|personal|sekretariat|secretariat|admin|direction|accueil|reception|office)@/

function classifyOld({ analyse, texteCV }) {
  let docType = (analyse?.document_type) || 'cv'
  let isNotCV = !!docType && docType !== 'cv'

  if (!isNotCV || docType === 'autre') {
    const contentLower = (texteCV || '').slice(0, 2000)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    const strictContentType =
      /certificat de travail|certificat d'emploi|certificat d'apprentissage|attestation de travail|arbeitszeugnis|zeugnis/.test(contentLower) ? 'certificat' :
      /attestation de formation|attestation de reussite|zertifikat/.test(contentLower) ? 'attestation' :
      /lettre de motivation|bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste|je vous prie d['\s]agreer|mes salutations distinguees|l['\s]expression de mes salutations|sehr geehrte|mit freundlichen gr[uü]ssen/.test(contentLower) ? 'lettre_motivation' :
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null

    if (strictContentType) {
      return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
    }
  }

  if (!isNotCV && analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  if (!isNotCV) {
    const hasExperiences = Array.isArray(analyse?.experiences) && analyse.experiences.length > 0
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  return { docType, isNotCV, reason: isNotCV ? 'ia' : 'default' }
}

// ─── Classifier NEW — CV-markers prioritaires ────────────────────────────────
// Règle : si CV-markers forts présents → c'est un CV, on ignore les patterns parasites.
// Les patterns non-CV déclassent seulement si AUCUN marker fort + texte court (<1500) + pas d'exp.
function classifyNew({ analyse, texteCV }) {
  const iaDocType = (analyse?.document_type) || 'cv'
  const iaSaysNotCV = !!iaDocType && iaDocType !== 'cv'

  // ── Computed CV-markers ──────────────────────────────────────────────────
  const experiences = Array.isArray(analyse?.experiences) ? analyse.experiences : []
  const competences = Array.isArray(analyse?.competences) ? analyse.competences : []
  const formationsDetails = Array.isArray(analyse?.formations_details) ? analyse.formations_details : []
  const titrePoste = (analyse?.titre_poste || '').trim()
  const formationField = (analyse?.formation || '').trim()

  const hasExperiences = experiences.length >= 1
  const hasCompetences = competences.length >= 2
  const hasFormation = formationsDetails.length >= 1 || formationField.length >= 5
  const hasTitre = titrePoste.length >= 3

  // CV-marker fort = au moins un de ces signaux positifs
  const hasStrongCvMarker = hasExperiences || hasCompetences || hasFormation || hasTitre

  const textLen = (texteCV || '').length

  // ── 1. CV-markers forts présents → c'est un CV, on stoppe ici ────────────
  // Fix v1.10.0 : la présence d'expériences/compétences/formations/titre suffit à valider.
  //   - Cas Loïc Arluna : texte contient "contrat de travail" dans une expérience pro → CV
  //   - Cas Caryl Dubrit : email info@dubrit-services.ch (indépendant) → CV
  // Les signaux positifs (markers) priment sur les signaux négatifs (patterns/email).
  if (hasStrongCvMarker) {
    return { docType: 'cv', isNotCV: false, reason: 'cv_markers' }
  }

  // ── 2. IA explicite non-CV + AUCUN marker → on fait confiance IA ─────────
  if (iaSaysNotCV) {
    return { docType: iaDocType, isNotCV: true, reason: 'ia' }
  }

  // ── 3. Email générique → non-CV (uniquement sans markers) ────────────────
  // info@/rh@/contact@ sans aucun CV-marker = boîte entreprise (scan de certif).
  if (analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  // ── 4. Pas de markers forts → patterns non-CV autorisés, mais SEULEMENT si ─
  // texte court (< 1500 chars) et pas d'expériences. Un vrai certificat/attestation
  // tient sur 1-2 pages ; un CV fait typiquement > 1500 chars.
  if (textLen < 1500 && !hasExperiences) {
    const contentLower = (texteCV || '').slice(0, 2000)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    const strictContentType =
      /certificat de travail|certificat d'emploi|certificat d'apprentissage|attestation de travail|arbeitszeugnis|zeugnis/.test(contentLower) ? 'certificat' :
      /attestation de formation|attestation de reussite|zertifikat/.test(contentLower) ? 'attestation' :
      /lettre de motivation|bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste|je vous prie d['\s]agreer|mes salutations distinguees|l['\s]expression de mes salutations|sehr geehrte|mit freundlichen gr[uü]ssen/.test(contentLower) ? 'lettre_motivation' :
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null

    if (strictContentType) {
      return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
    }
  }

  // ── 5. Pas de markers, pas d'exp, hasName → diplôme/certificat générique ─
  {
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  // ── 6. Fallback IA ────────────────────────────────────────────────────────
  return { docType: iaDocType, isNotCV: iaSaysNotCV, reason: iaSaysNotCV ? 'ia' : 'default' }
}

// ─── Datasets ────────────────────────────────────────────────────────────────

async function fetchRealCvs(sampleSize = 100) {
  // Fallback : query manuelle (on a besoin d'un pool large pour pouvoir filtrer exp >= 1)
  const { data: rows, error: err2 } = await supabase
    .from('candidats')
    .select('id, nom, prenom, email, titre_poste, competences, experiences, cv_texte_brut')
    .not('cv_texte_brut', 'is', null)
    .limit(1000)
  if (err2) throw err2

  const valid = (rows || []).filter(r =>
    (r.cv_texte_brut || '').length > 300 &&
    Array.isArray(r.experiences) && r.experiences.length >= 1
  )
  // Shuffle + take sampleSize
  const shuffled = valid.sort(() => Math.random() - 0.5).slice(0, sampleSize)
  return shuffled
}

// Cas synthétiques non-CV — représentent les types réels qu'on croise en prod
const SYNTHETIC_NON_CV = [
  {
    label: 'Certificat de travail classique (FR)',
    analyse: { document_type: 'certificat', nom: 'Dupont', experiences: [], competences: [] },
    texteCV: `ENTREPRISE ABC SA\nCertificat de travail\n\nNous certifions que Monsieur Jean Dupont, né le 12/03/1985, a travaillé dans notre entreprise du 01/09/2018 au 31/12/2023 en qualité de Monteur qualifié. Il a donné entière satisfaction et nous le recommandons vivement.\n\nFait à Sion le 05/01/2024.\nSignature : Le directeur RH`
  },
  {
    label: 'Attestation de travail courte',
    analyse: { document_type: 'attestation', nom: 'Martin', experiences: [] },
    texteCV: `Attestation de travail\n\nPar la présente, nous attestons que Madame Claire Martin a été employée en qualité de vendeuse du 01/05/2020 au 30/04/2023 dans notre société. Salaire mensuel brut CHF 4800.-`
  },
  {
    label: 'Lettre de motivation FR',
    analyse: { document_type: 'lettre_motivation', nom: 'Bernard', experiences: [] },
    texteCV: `Objet : Candidature pour le poste de Magasinier\n\nMadame, Monsieur,\n\nJe me permets de vous adresser ma candidature spontanee pour le poste de magasinier. Mes competences acquises au fil des annees me permettent...\n\nJe vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.\n\nPierre Bernard`
  },
  {
    label: 'Lettre de motivation DE',
    analyse: { document_type: 'lettre_motivation', nom: 'Muller', experiences: [] },
    texteCV: `Bewerbungsschreiben\n\nSehr geehrte Damen und Herren,\n\nMit grossem Interesse habe ich Ihre Stellenanzeige gelesen. Gerne moechte ich mich als Lagerist bei Ihnen bewerben.\n\nMit freundlichen Gruessen,\nHans Muller`
  },
  {
    label: 'Arbeitszeugnis (certificat DE)',
    analyse: { document_type: 'certificat', nom: 'Schmidt', experiences: [] },
    texteCV: `FIRMA XYZ AG\nArbeitszeugnis\n\nHerr Peter Schmidt war vom 01.03.2019 bis 31.08.2023 als Magaziner in unserem Betrieb taetig. Seine Arbeit war stets zufriedenstellend.\n\nZeugnis ausgestellt am 05.09.2023.`
  },
  {
    label: 'Bulletin de salaire',
    analyse: { document_type: 'bulletin_salaire', nom: 'Silva', experiences: [] },
    texteCV: `Bulletin de salaire - Mois d'octobre 2023\n\nEmploye : Paulo Silva\nNº AVS : 756.xxxx.xxxx.xx\n\nSalaire brut : 5400.00 CHF\nDeductions sociales : -540.00\nSalaire net : 4860.00 CHF`
  },
  {
    label: 'Permis de travail',
    analyse: { document_type: 'permis', nom: 'Costa', experiences: [] },
    texteCV: `Canton du Valais\nAutorisation de travail / permis de sejour\n\nTitulaire : Fernando Costa\nValable jusqu'au : 31/12/2025\nActivite : salariee`
  },
  {
    label: 'Lettre de recommandation',
    analyse: { document_type: 'reference', nom: 'Ferreira', experiences: [] },
    texteCV: `Lettre de recommandation\n\nJ'ai eu le plaisir de travailler avec Monsieur Antonio Ferreira pendant 3 ans. Il a toujours fait preuve de grand professionnalisme. Je le recommande vivement pour tout poste dans le secteur du batiment.`
  },
  {
    label: 'Contrat de travail pur',
    analyse: { document_type: 'contrat', nom: 'Lopez', experiences: [] },
    texteCV: `CONTRAT DE TRAVAIL\n\nEntre la societe ABC SA, ci-apres "l'employeur", et Monsieur Carlos Lopez, ci-apres "l'employe", il est conclu un contrat de travail a duree indeterminee avec prise d'effet au 01/01/2024.\n\nSalaire : 5200 CHF brut / mois.`
  },
  {
    label: 'Certificat CFC diplôme seul',
    analyse: { document_type: 'certificat', nom: 'Rossi', experiences: [] },
    texteCV: `SEFRI\nCertificat federal de capacite\n\nDelivre a Marco Rossi, ne le 15/05/1999\nProfession : Macon CFC\nDate : 30/06/2020`
  },
  {
    label: 'Email générique RH (attestation scan)',
    analyse: { document_type: 'cv', nom: 'Weber', email: 'rh@entreprise.ch', experiences: [] },
    texteCV: `ENTREPRISE WEBER SARL\nAttestation\n\nMonsieur X a travaille...`
  },
  {
    label: 'Email générique info (certificat scan)',
    analyse: { document_type: 'cv', nom: 'Muster', email: 'info@example.ch', experiences: [] },
    texteCV: `Aucun contenu expressif sinon info entreprise.`
  },
  {
    label: 'Attestation de formation pure',
    analyse: { document_type: 'attestation', nom: 'Bolt', experiences: [] },
    texteCV: `Attestation de formation\n\nNous certifions que Madame Usa Bolt a suivi avec succes la formation "Securite au travail" du 10/01/2024 au 15/01/2024.\n\nDuree : 40 heures. Resultat : reussi.`
  },
  {
    label: 'Certificat d\'apprentissage',
    analyse: { document_type: 'certificat', nom: 'Gomez', experiences: [] },
    texteCV: `Entreprise ABC SA\nCertificat d'apprentissage\n\nNous certifions que Juan Gomez a effectue son apprentissage de macon au sein de notre entreprise du 01/08/2018 au 31/07/2021.\n\nResultats : bons.`
  },
  {
    label: 'Zeugnis court (DE)',
    analyse: { document_type: 'certificat', nom: 'Keller', experiences: [] },
    texteCV: `Zeugnis fuer Herr Keller. Guter Mitarbeiter. Wir wuenschen ihm alles Gute.`
  },
  {
    label: 'Permis de conduire',
    analyse: { document_type: 'permis', nom: 'Brown', experiences: [] },
    texteCV: `Permis de conduire\nCategorie B\nValable jusqu'au 12/03/2030`
  },
  {
    label: 'Lettre motivation longue mais vide d\'expérience',
    analyse: { document_type: 'lettre_motivation', nom: 'Dubois', experiences: [] },
    texteCV: `Objet : Candidature spontanee\n\nMadame, Monsieur,\n\nSuite a votre annonce publiee recemment je me permets...\n\nJe vous prie d'agreer mes salutations distinguees.\n\nClaire Dubois`
  },
  {
    label: 'Scan illisible (IA a dit "autre")',
    analyse: { document_type: 'autre', nom: '', experiences: [] },
    texteCV: `[scan-non-lisible]`
  },
  {
    label: 'Diplôme CFC sans contenu CV',
    analyse: { document_type: 'diplome', nom: 'Silva', experiences: [] },
    texteCV: `Certificat federal de capacite\n\nSilva Maria\nProfession : Assistante socio-educative\nDate : 2022`
  },
  {
    label: 'Fiche de paie ancienne',
    analyse: { document_type: 'bulletin_salaire', nom: 'Alves', experiences: [] },
    texteCV: `Fiche de paie mars 2022\nNom : Alves Joao\nBrut : 4500\nNet : 3980`
  },
]

// Cas Loïc Arluna — 1 CV + 4 non-CVs
const LOIC_ARLUNA_CASES = [
  {
    label: 'Loïc Arluna cv.docx (CV légitime avec phrase parasite "contrat")',
    analyse: {
      document_type: 'cv',
      nom: 'Arluna',
      prenom: 'Loïc',
      email: 'loic.arluna@example.ch',
      titre_poste: 'Manutentionnaire / Logisticien',
      competences: ['CACES', 'Cariste', 'Gestion stock', 'Logistique', 'Informatique'],
      experiences: [
        { poste: 'Magasinier', entreprise: 'Sabeco SA', periode: 'Jan 2021 - Dec 2023', description: 'Gestion du stock, preparation de commandes, inventaires. Suite a la resiliation de mon contrat de travail en decembre 2023, je suis disponible immediatement.' },
        { poste: 'Aide-magasinier', entreprise: 'Coop', periode: '2018-2020', description: 'Reception marchandises, manutention' },
      ],
      formations_details: [{ diplome: 'CFC Logistique', etablissement: 'CEPM Martigny', annee: '2017' }],
    },
    texteCV: `LOIC ARLUNA\nManutentionnaire / Logisticien\n\nContact: loic.arluna@example.ch | +41 79 xxx xx xx\nNe le 15/06/1995 - Monthey, Valais\n\nEXPERIENCE PROFESSIONNELLE\n\n2021-2023 : Magasinier, Sabeco SA, Sion\n- Gestion complete du stock et des inventaires\n- Preparation de commandes et expeditions\n- Utilisation chariot elevateur (CACES)\nSuite a la resiliation de mon contrat de travail en decembre 2023, je suis disponible immediatement pour un nouveau poste.\n\n2018-2020 : Aide-magasinier, Coop, Monthey\n- Reception des marchandises et controle qualite\n- Rangement et manutention\n\nFORMATION\n2014-2017 : CFC Logistique, CEPM Martigny\n\nCOMPETENCES\n- Cariste experimente (CACES)\n- Gestion de stock et inventaires\n- Informatique bureautique\n- Esprit d'equipe\n\nLANGUES\nFrancais (natif), Anglais (B1), Allemand (scolaire)`,
    expected: 'cv',
  },
  {
    label: 'Arluna Loïc lettre motivation.docx',
    analyse: { document_type: 'lettre_motivation', nom: 'Arluna', prenom: 'Loïc', experiences: [], competences: [] },
    texteCV: `Objet : Candidature pour le poste de Magasinier\n\nMadame, Monsieur,\n\nJe me permets de vous adresser ma candidature spontanee pour le poste de magasinier. Fort de mon experience...\n\nJe vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.\n\nLoic Arluna`,
    expected: 'non-cv',
  },
  {
    label: 'SABECO_Attestation (certificat de travail Sabeco)',
    analyse: { document_type: 'certificat', nom: 'Arluna', prenom: 'Loïc', experiences: [] },
    texteCV: `SABECO SA\nCertificat de travail\n\nNous certifions que Monsieur Loic Arluna, ne le 15/06/1995, a travaille au sein de notre societe du 01/01/2021 au 31/12/2023 en qualite de magasinier.\n\nIl a donne entiere satisfaction.\n\nSion, le 05/01/2024.`,
    expected: 'non-cv',
  },
  {
    label: 'Personal_Data-06-04 (certificat scan email générique)',
    analyse: { document_type: 'cv', nom: 'Arluna', prenom: 'Loïc', email: 'rh@sabeco.ch', experiences: [] },
    texteCV: `[document scanne - extraction partielle]\nSABECO SA\nContact: rh@sabeco.ch\n\nInformations personnelles de l'employe`,
    expected: 'non-cv',
  },
  {
    label: 'Personal_Data-07-04 (certificat scan 2)',
    analyse: { document_type: 'certificat', nom: 'Arluna', experiences: [] },
    texteCV: `ENTREPRISE\nAttestation de travail\n\nCe document atteste que Loic Arluna a ete employe...`,
    expected: 'non-cv',
  },
]

// ─── Runner ─────────────────────────────────────────────────────────────────
function applyBoth(input) {
  return {
    old: classifyOld(input),
    new: classifyNew(input),
  }
}

function isCv(result) { return !result.isNotCV }

function fmt(result) {
  return `${isCv(result) ? 'CV ' : 'NON-CV'} [${result.docType} via ${result.reason}]`
}

async function main() {
  console.log('━'.repeat(80))
  console.log('SIMULATION — durcissement classifier non-CV (v1.10.0)')
  console.log('━'.repeat(80))
  console.log()

  // ── Dataset A : 100 CVs réels ─────────────────────────────────────────
  console.log('📊 Dataset A — 100 CVs réels (fetch en cours...)')
  const realCvs = await fetchRealCvs(100)
  console.log(`   ${realCvs.length} CVs récupérés`)
  console.log()

  let aStats = { total: 0, oldCv: 0, newCv: 0, oldRegress: [], newRegress: [], diffs: [] }
  for (const c of realCvs) {
    const input = {
      analyse: {
        document_type: 'cv', // tous sont en base donc analysés comme CV par IA
        nom: c.nom,
        prenom: c.prenom,
        email: c.email,
        titre_poste: c.titre_poste,
        competences: c.competences || [],
        experiences: c.experiences || [],
      },
      texteCV: c.cv_texte_brut || '',
    }
    const { old, new: neu } = applyBoth(input)
    aStats.total++
    if (isCv(old)) aStats.oldCv++
    if (isCv(neu)) aStats.newCv++
    if (!isCv(old)) aStats.oldRegress.push(`  - ${c.prenom} ${c.nom} (id ${c.id.slice(0,8)}) : ${fmt(old)}`)
    if (!isCv(neu)) aStats.newRegress.push(`  - ${c.prenom} ${c.nom} (id ${c.id.slice(0,8)}) : ${fmt(neu)}`)
    if (isCv(old) !== isCv(neu)) {
      aStats.diffs.push(`  - ${c.prenom} ${c.nom} : OLD=${fmt(old)}  →  NEW=${fmt(neu)}`)
    }
  }

  console.log(`Dataset A — CVs réels (attendu 100% CV)`)
  console.log(`  OLD : ${aStats.oldCv}/${aStats.total} classés CV (${aStats.total - aStats.oldCv} faux positifs non-CV)`)
  console.log(`  NEW : ${aStats.newCv}/${aStats.total} classés CV (${aStats.total - aStats.newCv} faux positifs non-CV)`)
  if (aStats.oldRegress.length) { console.log('  ⚠️ OLD rejette à tort :'); aStats.oldRegress.slice(0, 5).forEach(s => console.log(s)) }
  if (aStats.newRegress.length) { console.log('  ⚠️ NEW rejette à tort :'); aStats.newRegress.slice(0, 10).forEach(s => console.log(s)) }
  console.log()

  // ── Dataset B : 20 non-CVs synthétiques ──────────────────────────────
  console.log('📊 Dataset B — 20 non-CVs synthétiques (attendu 100% non-CV)')
  let bStats = { total: 0, oldNotCv: 0, newNotCv: 0, oldMiss: [], newMiss: [], diffs: [] }
  for (const syn of SYNTHETIC_NON_CV) {
    const { old, new: neu } = applyBoth({ analyse: syn.analyse, texteCV: syn.texteCV })
    bStats.total++
    if (!isCv(old)) bStats.oldNotCv++
    if (!isCv(neu)) bStats.newNotCv++
    if (isCv(old)) bStats.oldMiss.push(`  - ${syn.label} : OLD = ${fmt(old)}`)
    if (isCv(neu)) bStats.newMiss.push(`  - ${syn.label} : NEW = ${fmt(neu)}`)
    if (isCv(old) !== isCv(neu)) {
      bStats.diffs.push(`  - ${syn.label} : OLD=${fmt(old)}  →  NEW=${fmt(neu)}`)
    }
  }
  console.log(`  OLD : ${bStats.oldNotCv}/${bStats.total} classés non-CV`)
  console.log(`  NEW : ${bStats.newNotCv}/${bStats.total} classés non-CV`)
  if (bStats.oldMiss.length) { console.log('  ⚠️ OLD laisse passer :'); bStats.oldMiss.forEach(s => console.log(s)) }
  if (bStats.newMiss.length) { console.log('  ⚠️ NEW laisse passer :'); bStats.newMiss.forEach(s => console.log(s)) }
  console.log()

  // ── Dataset C : Loïc Arluna ──────────────────────────────────────────
  console.log('📊 Dataset C — 5 cas Loïc Arluna (1 CV à débugger + 4 non-CV cascade)')
  for (const cas of LOIC_ARLUNA_CASES) {
    const { old, new: neu } = applyBoth({ analyse: cas.analyse, texteCV: cas.texteCV })
    const expectedCv = cas.expected === 'cv'
    const oldOk = isCv(old) === expectedCv ? '✅' : '❌'
    const newOk = isCv(neu) === expectedCv ? '✅' : '❌'
    console.log(`\n  ${cas.label}`)
    console.log(`    attendu  : ${cas.expected}`)
    console.log(`    OLD ${oldOk} : ${fmt(old)}`)
    console.log(`    NEW ${newOk} : ${fmt(neu)}`)
  }
  console.log()

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('━'.repeat(80))
  console.log('RÉSUMÉ')
  console.log('━'.repeat(80))
  const aOldOk = aStats.oldCv === aStats.total
  const aNewOk = aStats.newCv === aStats.total
  const bOldOk = bStats.oldNotCv === bStats.total
  const bNewOk = bStats.newNotCv === bStats.total
  console.log(`A) CVs réels (100% CV attendu)     : OLD ${aOldOk ? '✅' : '❌'} (${aStats.oldCv}/${aStats.total})  |  NEW ${aNewOk ? '✅' : '❌'} (${aStats.newCv}/${aStats.total})`)
  console.log(`B) Non-CVs synthétiques (100% not) : OLD ${bOldOk ? '✅' : '❌'} (${bStats.oldNotCv}/${bStats.total})  |  NEW ${bNewOk ? '✅' : '❌'} (${bStats.newNotCv}/${bStats.total})`)
  console.log()
  console.log(`Régression NEW vs OLC sur A (nouveaux rejets) : ${Math.max(0, aStats.oldCv - aStats.newCv)}`)
  console.log(`Gains NEW vs OLD sur A (moins de faux positifs) : ${Math.max(0, aStats.newCv - aStats.oldCv)}`)
  console.log(`Régression NEW vs OLD sur B (non-CVs laissés passer) : ${Math.max(0, bStats.oldNotCv - bStats.newNotCv)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
