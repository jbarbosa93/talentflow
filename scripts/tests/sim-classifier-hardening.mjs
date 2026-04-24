#!/usr/bin/env node
/**
 * Simulation — classifier non-CV (v1.9.102)
 *
 * 3 versions comparées :
 *   V1_OLD      — pré-v1.9.101 (patterns contenu 2000 chars prioritaires)
 *   V2_CURRENT  — v1.9.101 actuellement en prod (CV-markers prioritaires)
 *   V3_NEW      — v1.9.102 proposé (7 règles, IA explicite priorité max)
 *
 * Datasets :
 *   A) 100 CVs réels (candidats avec exp + cv_texte_brut) → attendu 100% CV
 *   B) 20 non-CVs synthétiques → attendu 100% non-CV
 *   C) 5 cas Loïc Arluna → 1 CV + 4 non-CV (régression check v1.9.101)
 *   D) 3 nouveaux cas réels (Manor, Sandra, Marjorie) → attendu 100% non-CV
 *   E) 1 cas Zahmoul → warning name_ambiguity détecté
 *
 * Usage : set -a; source .env.local; set +a; node scripts/sim-classifier-hardening.mjs
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFIERS
// ═══════════════════════════════════════════════════════════════════════════

const GENERIC_EMAIL_PREFIX = /^(info|contact|rh|hr|hrdirektion|personal|sekretariat|secretariat|admin|direction|accueil|reception|office)@/

// ─── V1_OLD (pré-v1.9.101, patterns contenu prioritaires) ────────────────
function classifyV1Old({ analyse, texteCV }) {
  let docType = (analyse?.document_type) || 'cv'
  let isNotCV = !!docType && docType !== 'cv'

  if (!isNotCV || docType === 'autre') {
    const contentLower = (texteCV || '').slice(0, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const strictContentType =
      /certificat de travail|certificat d'emploi|certificat d'apprentissage|attestation de travail|arbeitszeugnis|zeugnis/.test(contentLower) ? 'certificat' :
      /attestation de formation|attestation de reussite|zertifikat/.test(contentLower) ? 'attestation' :
      /lettre de motivation|bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste|je vous prie d['\s]agreer|mes salutations distinguees|l['\s]expression de mes salutations|sehr geehrte|mit freundlichen gr[uü]ssen/.test(contentLower) ? 'lettre_motivation' :
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null
    if (strictContentType) return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
  }
  if (!isNotCV && analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
  }
  if (!isNotCV) {
    const hasExperiences = Array.isArray(analyse?.experiences) && analyse.experiences.length > 0
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
  }
  return { docType, isNotCV, reason: isNotCV ? 'ia' : 'default' }
}

// ─── V2_CURRENT (v1.9.101 actuel en prod) ────────────────────────────────
function classifyV2Current({ analyse, texteCV }) {
  const iaDocType = (analyse?.document_type) || 'cv'
  const iaSaysNotCV = !!iaDocType && iaDocType !== 'cv'

  const experiences = Array.isArray(analyse?.experiences) ? analyse.experiences : []
  const competences = Array.isArray(analyse?.competences) ? analyse.competences : []
  const formationsDetails = Array.isArray(analyse?.formations_details) ? analyse.formations_details : []
  const titrePoste = (analyse?.titre_poste || '').trim()
  const formationField = (analyse?.formation || '').trim()

  const hasExperiences = experiences.length >= 1
  const hasCompetences = competences.length >= 2
  const hasFormation = formationsDetails.length >= 1 || formationField.length >= 5
  const hasTitre = titrePoste.length >= 3
  const hasStrongCvMarker = hasExperiences || hasCompetences || hasFormation || hasTitre

  const textLen = (texteCV || '').length

  if (hasStrongCvMarker) return { docType: 'cv', isNotCV: false, reason: 'cv_markers' }
  if (iaSaysNotCV) return { docType: iaDocType, isNotCV: true, reason: 'ia' }
  if (analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
  }
  if (textLen < 1500 && !hasExperiences) {
    const contentLower = (texteCV || '').slice(0, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const strictContentType =
      /certificat de travail|certificat d'emploi|certificat d'apprentissage|attestation de travail|arbeitszeugnis|zeugnis/.test(contentLower) ? 'certificat' :
      /attestation de formation|attestation de reussite|zertifikat/.test(contentLower) ? 'attestation' :
      /lettre de motivation|bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste|je vous prie d['\s]agreer|mes salutations distinguees|l['\s]expression de mes salutations|sehr geehrte|mit freundlichen gr[uü]ssen/.test(contentLower) ? 'lettre_motivation' :
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null
    if (strictContentType) return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
  }
  const nom = (analyse?.nom || '').trim()
  const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
  if (hasName && !hasExperiences) return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
  return { docType: iaDocType, isNotCV: iaSaysNotCV, reason: 'default' }
}

// ─── V3_NEW (v1.9.102 proposé — 7 règles dans l'ordre strict) ────────────
// Règle 1 : IA explicite non-CV (certificat/attestation/lettre_motivation/contrat/diplome) → non-CV
// Règle 2 : Patterns HAUTE CONFIANCE en-tête 0-500 chars → non-CV
// Règle 3 : CV-markers DURCIS (exp ≥ 2 ET (comp ≥ 3 OU formation ≥ 1)) → CV
// Règle 4 : Email générique + aucun marker fort → non-CV
// Règle 5 : Texte court (<1500) + aucun marker + pas d'exp + pattern contenu → non-CV
// Règle 6 : hasName + aucune exp → diplôme
// Règle 7 : Fallback IA document_type
const IA_EXPLICIT_NOT_CV = new Set(['certificat', 'attestation', 'lettre_motivation', 'contrat', 'diplome', 'bulletin_salaire', 'permis', 'reference', 'formation'])

function classifyV3New({ analyse, texteCV }) {
  const iaDocType = (analyse?.document_type) || 'cv'

  const experiences = Array.isArray(analyse?.experiences) ? analyse.experiences : []
  const competences = Array.isArray(analyse?.competences) ? analyse.competences : []
  const formationsDetails = Array.isArray(analyse?.formations_details) ? analyse.formations_details : []
  const titrePoste = (analyse?.titre_poste || '').trim()
  const formationField = (analyse?.formation || '').trim()

  const hasExperiences = experiences.length >= 1
  const hasFormation = formationsDetails.length >= 1 || formationField.length >= 5
  const textLen = (texteCV || '').length

  // ── Règle 1 : IA explicite non-CV → respect absolu (priorité max) ─────
  if (IA_EXPLICIT_NOT_CV.has(iaDocType)) {
    return { docType: iaDocType, isNotCV: true, reason: 'ia' }
  }

  // ── Règle 2 : Patterns HAUTE CONFIANCE en-tête 0-500 chars ────────────
  // Un vrai CV ne commence JAMAIS par "Certificat de travail", "Je soussigné",
  // "Nous certifions que", etc. Ces patterns en en-tête sont des signaux forts.
  const header = (texteCV || '').slice(0, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const headerPattern =
    /certificat de travail|certificat d'emploi|certificat d'apprentissage/.test(header) ? 'certificat' :
    /attestation de travail|attestation d'emploi/.test(header) ? 'certificat' :
    /arbeitszeugnis|zeugnis/.test(header) ? 'certificat' :
    /je soussign[ée]|nous certifions que|wir bestatigen|wir bestätigen/.test(header) ? 'certificat' :
    /attestation de formation|attestation de reussite|zertifikat/.test(header) ? 'attestation' :
    /bewerbungsschreiben|objet\s*:\s*candidature|candidature spontanee|candidature pour le poste/.test(header) ? 'lettre_motivation' :
    null
  if (headerPattern) {
    return { docType: headerPattern, isNotCV: true, reason: 'content_pattern' }
  }
  // Lettre motivation courte (< 1500 chars + "Madame, Monsieur" dans 0-200 chars)
  if (textLen < 1500 && textLen > 0) {
    const head200 = header.slice(0, 200)
    if (/madame[\s,]+monsieur|sehr geehrte/.test(head200)) {
      return { docType: 'lettre_motivation', isNotCV: true, reason: 'content_pattern' }
    }
  }

  // ── Règle 3 : CV-markers DURCIS (tie-breaker) ──────────────────────────
  // Variante A (cas général) : exp ≥ 2 ET (comp ≥ 3 OU formation)
  // Variante B (indépendants) : exp ≥ 1 ET comp ≥ 5 ET titre_poste ≥ 3 chars
  //   → protège les CVs avec 1 seule exp bien remplie + titre cohérent
  //   (ex: Nicolas Kilchenmann info@niki-pictures.com indépendant dessinateur)
  const hasTitre = titrePoste.length >= 3
  const variantA = experiences.length >= 2 && (competences.length >= 3 || hasFormation)
  const variantB = experiences.length >= 1 && competences.length >= 5 && hasTitre
  if (variantA || variantB) {
    return { docType: 'cv', isNotCV: false, reason: 'cv_markers' }
  }

  // ── Règle 4 : Email générique + aucun marker fort → non-CV ────────────
  if (analyse?.email) {
    const emailLower = String(analyse.email).toLowerCase().trim()
    if (GENERIC_EMAIL_PREFIX.test(emailLower)) {
      return { docType: 'certificat', isNotCV: true, reason: 'email_generique' }
    }
  }

  // ── Règle 5 : Texte court + pas d'exp + pattern contenu ───────────────
  if (textLen < 1500 && !hasExperiences && textLen > 0) {
    const contentLower = (texteCV || '').slice(0, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const strictContentType =
      /bulletin de salaire|fiche de paie|lohnabrechnung/.test(contentLower) ? 'bulletin_salaire' :
      /permis de travail|permis de sejour|autorisation de travail|aufenthaltsbewilligung/.test(contentLower) ? 'permis' :
      /lettre de recommandation|lettre de reference|referenzschreiben/.test(contentLower) ? 'reference' :
      /contrat de travail|avenant au contrat|arbeitsvertrag/.test(contentLower) ? 'contrat' :
      null
    if (strictContentType) return { docType: strictContentType, isNotCV: true, reason: 'content_pattern' }
  }

  // ── Règle 6 : hasName + aucune exp → diplôme ──────────────────────────
  {
    const nom = (analyse?.nom || '').trim()
    const hasName = !!(nom && nom !== 'Candidat' && nom.length > 1)
    if (hasName && !hasExperiences) {
      return { docType: 'diplome', isNotCV: true, reason: 'no_experience' }
    }
  }

  // ── Règle 7 : Fallback IA document_type ───────────────────────────────
  // Si IA dit 'autre' ou autre valeur ≠ 'cv' → conserver verdict non-CV
  const fallbackNotCv = iaDocType !== 'cv'
  return { docType: iaDocType, isNotCV: fallbackNotCv, reason: 'default' }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATOR — name_ambiguity (logique miroir de lib/cv-extraction-validator.ts)
// ═══════════════════════════════════════════════════════════════════════════
function detectNameAmbiguity({ texteCV, analyse }) {
  // On regarde les 200 premiers chars du texte OU les tokens candidats dans nom/prenom
  const head = (texteCV || '').slice(0, 200)
  // Capture les tokens entièrement en MAJUSCULES de longueur >= 3 (évite "Mr", "M.")
  const matches = head.match(/\b[A-ZÀ-Ý]{3,}\b/g) || []
  const uniq = Array.from(new Set(matches))
  if (uniq.length >= 2) {
    return {
      field: 'nom_prenom',
      severity: 'warning',
      code: 'name_ambiguity',
      message: `Nom/prénom à vérifier (tokens MAJUSCULES ambigus : ${uniq.slice(0, 3).join(', ')})`,
      tokens: uniq,
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// DATASETS
// ═══════════════════════════════════════════════════════════════════════════

async function fetchRealCvs(sampleSize = 100) {
  const { data: rows, error } = await supabase
    .from('candidats')
    .select('id, nom, prenom, email, titre_poste, competences, experiences, cv_texte_brut')
    .not('cv_texte_brut', 'is', null)
    .limit(1000)
  if (error) throw error
  const valid = (rows || []).filter(r =>
    (r.cv_texte_brut || '').length > 300 &&
    Array.isArray(r.experiences) && r.experiences.length >= 1
  )
  return valid.sort(() => Math.random() - 0.5).slice(0, sampleSize)
}

const SYNTHETIC_NON_CV = [
  { label: 'Certificat travail FR', analyse: { document_type: 'certificat', nom: 'Dupont', experiences: [], competences: [] }, texteCV: `ENTREPRISE ABC SA\nCertificat de travail\n\nNous certifions que Monsieur Jean Dupont, né le 12/03/1985, a travaillé du 01/09/2018 au 31/12/2023. Salaire.` },
  { label: 'Attestation travail', analyse: { document_type: 'attestation', nom: 'Martin', experiences: [] }, texteCV: `Attestation de travail\n\nPar la présente, nous attestons que Madame Claire Martin a été employée en qualité de vendeuse.` },
  { label: 'Lettre motivation FR', analyse: { document_type: 'lettre_motivation', nom: 'Bernard', experiences: [] }, texteCV: `Objet : Candidature pour le poste de Magasinier\n\nMadame, Monsieur,\n\nJe me permets de vous adresser ma candidature spontanee pour le poste.` },
  { label: 'Lettre motivation DE', analyse: { document_type: 'lettre_motivation', nom: 'Muller', experiences: [] }, texteCV: `Bewerbungsschreiben\n\nSehr geehrte Damen und Herren, gerne bewerbe ich mich.` },
  { label: 'Arbeitszeugnis', analyse: { document_type: 'certificat', nom: 'Schmidt', experiences: [] }, texteCV: `FIRMA XYZ AG\nArbeitszeugnis\n\nHerr Peter Schmidt war vom 01.03.2019 bis 31.08.2023 taetig.` },
  { label: 'Bulletin salaire', analyse: { document_type: 'bulletin_salaire', nom: 'Silva', experiences: [] }, texteCV: `Bulletin de salaire octobre 2023\nPaulo Silva\nBrut 5400 CHF.` },
  { label: 'Permis travail', analyse: { document_type: 'permis', nom: 'Costa', experiences: [] }, texteCV: `Canton du Valais\nAutorisation de travail / permis de sejour\nFernando Costa.` },
  { label: 'Lettre recommandation', analyse: { document_type: 'reference', nom: 'Ferreira', experiences: [] }, texteCV: `Lettre de recommandation\nJ'ai eu le plaisir de travailler avec Monsieur Antonio Ferreira.` },
  { label: 'Contrat travail pur', analyse: { document_type: 'contrat', nom: 'Lopez', experiences: [] }, texteCV: `CONTRAT DE TRAVAIL\nEntre ABC SA et Monsieur Carlos Lopez.` },
  { label: 'Certif CFC diplôme', analyse: { document_type: 'certificat', nom: 'Rossi', experiences: [] }, texteCV: `SEFRI\nCertificat federal de capacite\nMarco Rossi, Macon CFC.` },
  { label: 'Email RH (scan IA cv)', analyse: { document_type: 'cv', nom: 'Weber', email: 'rh@entreprise.ch', experiences: [] }, texteCV: `ENTREPRISE WEBER SARL\nAttestation\n\nMonsieur X a travaille...` },
  { label: 'Email info (scan IA cv)', analyse: { document_type: 'cv', nom: 'Muster', email: 'info@example.ch', experiences: [] }, texteCV: `Aucun contenu expressif.` },
  { label: 'Attestation formation', analyse: { document_type: 'attestation', nom: 'Bolt', experiences: [] }, texteCV: `Attestation de formation\nMadame Bolt a suivi la formation Securite.` },
  { label: 'Certificat apprentissage', analyse: { document_type: 'certificat', nom: 'Gomez', experiences: [] }, texteCV: `Entreprise ABC SA\nCertificat d'apprentissage\nJuan Gomez apprentissage macon 2018-2021.` },
  { label: 'Zeugnis court', analyse: { document_type: 'certificat', nom: 'Keller', experiences: [] }, texteCV: `Zeugnis fuer Herr Keller. Guter Mitarbeiter.` },
  { label: 'Permis conduire', analyse: { document_type: 'permis', nom: 'Brown', experiences: [] }, texteCV: `Permis de conduire\nCategorie B\nValable 12/03/2030.` },
  { label: 'LM longue vide d\'exp', analyse: { document_type: 'lettre_motivation', nom: 'Dubois', experiences: [] }, texteCV: `Objet : Candidature spontanee\n\nMadame, Monsieur,\n\nSuite a votre annonce...` },
  { label: 'Scan illisible', analyse: { document_type: 'autre', nom: '', experiences: [] }, texteCV: `[scan-non-lisible]` },
  { label: 'Diplôme CFC', analyse: { document_type: 'diplome', nom: 'Silva', experiences: [] }, texteCV: `Certificat federal de capacite\nSilva Maria\nAssistante socio-educative 2022.` },
  { label: 'Fiche paie', analyse: { document_type: 'bulletin_salaire', nom: 'Alves', experiences: [] }, texteCV: `Fiche de paie mars 2022\nAlves Joao.` },
]

const LOIC_ARLUNA_CASES = [
  {
    label: 'Loïc Arluna cv.docx (CV légitime phrase parasite)',
    analyse: { document_type: 'cv', nom: 'Arluna', prenom: 'Loïc', email: 'loic.arluna@example.ch', titre_poste: 'Constructeur de route / Machiniste', competences: ['CACES', 'Cariste', 'Gestion stock', 'Logistique', 'Informatique'], experiences: [ { poste: 'Magasinier', entreprise: 'Sabeco SA', periode: 'Jan 2021 - Dec 2023', description: 'Gestion stock. Suite a la resiliation de mon contrat de travail en decembre 2023...' }, { poste: 'Aide', entreprise: 'Coop', periode: '2018-2020' } ], formations_details: [{ diplome: 'CFC Logistique', etablissement: 'CEPM', annee: '2017' }] },
    texteCV: `LOIC ARLUNA\nConstructeur de route / Machiniste\nRoute savolar 18, 1893 Illarsaz\n+41 79 xxx xx xx | loic.arluna@example.ch\nNe le 15/06/1995\n\nEXPERIENCE PROFESSIONNELLE\n2021-2023 : Magasinier Sabeco SA - Suite a la resiliation de mon contrat de travail en decembre 2023, je suis disponible...\n\n2018-2020 : Aide-magasinier Coop\n\nFORMATION\n2014-2017 : CFC Logistique CEPM Martigny\n\nCOMPETENCES\nCACES, Cariste, Gestion stock`,
    expected: 'cv',
  },
  { label: 'Arluna Loïc lettre motivation.docx', analyse: { document_type: 'lettre_motivation', nom: 'Arluna', prenom: 'Loïc', experiences: [], competences: [] }, texteCV: `Objet : Candidature pour le poste de Magasinier\n\nMadame, Monsieur,\n\nJe me permets...`, expected: 'non-cv' },
  { label: 'SABECO_Attestation (certif travail)', analyse: { document_type: 'certificat', nom: 'Arluna', prenom: 'Loïc', experiences: [] }, texteCV: `SABECO SA\nCertificat de travail\nLoic Arluna.`, expected: 'non-cv' },
  { label: 'Personal_Data-06-04 (certif email rh)', analyse: { document_type: 'cv', nom: 'Arluna', email: 'rh@sabeco.ch', experiences: [] }, texteCV: `SABECO SA\nContact: rh@sabeco.ch`, expected: 'non-cv' },
  { label: 'Personal_Data-07-04 (certif scan 2)', analyse: { document_type: 'certificat', nom: 'Arluna', experiences: [] }, texteCV: `ENTREPRISE\nAttestation de travail\nCe document atteste.`, expected: 'non-cv' },
]

// ─── Dataset D — 3 cas réels depuis le batch test (IA + input exacts du dump) ─
const NEW_REAL_CASES = [
  {
    label: 'Cas 7 — Certificat Manor (Manuel Monteiro Bastos)',
    analyse: {
      document_type: 'certificat',  // ← l'IA a correctement identifié
      nom: 'Monteiro Bastos',
      prenom: 'Manuel',
      email: '',
      telephone: '',
      titre_poste: 'Apprenti Gestionnaire du Commerce de Détail',
      competences: ['Conseil', 'Entretien', 'Gestion commandes', 'Gestion stocks', 'Promotions', 'Service client', 'Multimédia', 'Formation CFC'],
      experiences: [{ poste: 'Apprenti Gestionnaire', entreprise: 'Manor SA', periode: '01/08/2019 - 03/05/2021' }],
      formations_details: [],
    },
    texteCV: '', // vision-pdf → pas de texte extrait natif
    expected: 'non-cv',
  },
  {
    label: 'Cas 9 — Lettre motivation Sandra Devaud',
    analyse: {
      document_type: 'lettre_motivation',  // ← l'IA a correctement identifié
      nom: 'Devaud',
      prenom: 'Sandra',
      email: 'sandradevaud@hotmail.com',
      telephone: '078.843.46.92',
      titre_poste: 'Ouvrière d\'usine',
      competences: ['Condition physique', 'Adaptabilité', 'Apprentissage rapide', 'Rigueur', 'Rapidité d\'exécution'],
      experiences: [],
      formations_details: [],
    },
    texteCV: `Sandra Devaud\nChemin des Acacias 12\n1870 Monthey\n+41 78 843 46 92\nsandradevaud@hotmail.com\n\nMadame, Monsieur,\n\nPar la présente, je me permets de vous adresser ma candidature spontanée pour un poste d'ouvrière d'usine à 100%. Candidate motivée en reconversion professionnelle vers le secteur de la production industrielle. Dotée d'une excellente condition physique et d'une grande capacité d'adaptation, je cherche à développer de nouvelles compétences dans un environnement exigeant.\n\nJe suis disponible dès maintenant et peux m'adapter aux horaires d'équipe.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.\n\nSandra Devaud`,
    expected: 'non-cv',
  },
  {
    label: 'Cas 12 — Certificat travail Marjorie Marmolejo',
    analyse: {
      document_type: 'certificat',  // ← l'IA a correctement identifié
      nom: 'Marmolejo Zambrano',
      prenom: 'Marjorie Yanina',
      email: 'info@cosmotec.ch',  // email entreprise (employeur qui délivre le certif)
      telephone: '+41 24 482 06 20',
      titre_poste: 'Opératrice de conditionnement à 100%',
      competences: ['Conditionnement', 'Vérification', 'Montage', 'Assemblage', 'Contrôle', 'Lavage', 'Identification', 'Fiches techniques', 'Procédures', 'Assurance Qualité'],
      experiences: [
        { poste: 'Opératrice', entreprise: 'COSMOTEC SA', periode: '26 juin 2025 - 19 décembre 2025' },
        { poste: 'Opératrice', entreprise: 'COSMOTEC SA', periode: '1er octobre 2025 - 19 décembre 2025' },
      ],
      formations_details: [],
    },
    texteCV: '', // vision-pdf → pas de texte natif
    expected: 'non-cv',
  },
]

// ─── Dataset E — cas Zahmoul (test warning name_ambiguity) ─────────────────
const ZAHMOUL_CASE = {
  label: 'Cas 18 — Zahmoul/Chaouwki (2 tokens MAJUSCULES en-tête)',
  analyse: {
    document_type: 'cv',
    nom: 'Chaouwki',
    prenom: 'Zahmoul',
    email: 'zahmoulchaouwki@gmail.com',
    titre_poste: 'Tuyauteur expérimenté',
    experiences: Array.from({ length: 9 }, (_, i) => ({ poste: 'Tuyauteur', periode: `202${i}` })),
    competences: Array.from({ length: 8 }, (_, i) => `comp${i}`),
    formations_details: [],
  },
  texteCV: `ZAHMOUL CHAOUWKI\nTuyauteur expérimenté\n\nEmail: zahmoulchaouwki@gmail.com\nTéléphone: +41 78 441 33 88\n\nEXPÉRIENCES :\n2026 Tuyauteur Valiantjob intérim\n2025 Tuyauteur Gigafactory Douai...`,
  expected: { classification: 'cv', warning: 'name_ambiguity' },
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════════

function isCv(r) { return !r.isNotCV }
function fmt(r) { return `${isCv(r) ? 'CV ' : 'NON-CV'} [${r.docType}/${r.reason}]` }

async function main() {
  console.log('━'.repeat(80))
  console.log('SIMULATION — classifier v1.9.102')
  console.log('V1_OLD (pré-1.9.101) vs V2_CURRENT (1.9.101 prod) vs V3_NEW (1.9.102 proposé)')
  console.log('━'.repeat(80))

  // ── Dataset A : 100 CVs réels ─────────────────────────────────────────
  console.log('\n📊 Dataset A — 100 CVs réels (attendu 100% CV)')
  const realCvs = await fetchRealCvs(100)
  console.log(`   ${realCvs.length} CVs fetchés`)
  const a = { v1: 0, v2: 0, v3: 0, v3Regr: [] }
  for (const c of realCvs) {
    const input = {
      analyse: { document_type: 'cv', nom: c.nom, prenom: c.prenom, email: c.email, titre_poste: c.titre_poste, competences: c.competences || [], experiences: c.experiences || [] },
      texteCV: c.cv_texte_brut || '',
    }
    if (isCv(classifyV1Old(input))) a.v1++
    if (isCv(classifyV2Current(input))) a.v2++
    const v3 = classifyV3New(input)
    if (isCv(v3)) a.v3++
    else a.v3Regr.push(`  - ${c.prenom} ${c.nom}: ${fmt(v3)} (${(c.experiences || []).length} exp, ${(c.competences || []).length} comp)`)
  }
  console.log(`  V1_OLD     : ${a.v1}/${realCvs.length} classés CV`)
  console.log(`  V2_CURRENT : ${a.v2}/${realCvs.length} classés CV`)
  console.log(`  V3_NEW     : ${a.v3}/${realCvs.length} classés CV`)
  if (a.v3Regr.length) { console.log('  ⚠️ V3 rejette :'); a.v3Regr.slice(0, 15).forEach(s => console.log(s)) }

  // ── Dataset B : 20 non-CVs synthétiques ──────────────────────────────
  console.log('\n📊 Dataset B — 20 non-CVs synthétiques (attendu 100% non-CV)')
  const b = { v1: 0, v2: 0, v3: 0, v3Miss: [] }
  for (const syn of SYNTHETIC_NON_CV) {
    const input = { analyse: syn.analyse, texteCV: syn.texteCV }
    if (!isCv(classifyV1Old(input))) b.v1++
    if (!isCv(classifyV2Current(input))) b.v2++
    const v3 = classifyV3New(input)
    if (!isCv(v3)) b.v3++
    else b.v3Miss.push(`  - ${syn.label}: ${fmt(v3)}`)
  }
  console.log(`  V1_OLD     : ${b.v1}/${SYNTHETIC_NON_CV.length} classés non-CV`)
  console.log(`  V2_CURRENT : ${b.v2}/${SYNTHETIC_NON_CV.length} classés non-CV`)
  console.log(`  V3_NEW     : ${b.v3}/${SYNTHETIC_NON_CV.length} classés non-CV`)
  if (b.v3Miss.length) { console.log('  ⚠️ V3 laisse passer :'); b.v3Miss.forEach(s => console.log(s)) }

  // ── Dataset C : Loïc Arluna ──────────────────────────────────────────
  console.log('\n📊 Dataset C — 5 cas Loïc Arluna (régression check)')
  for (const cas of LOIC_ARLUNA_CASES) {
    const input = { analyse: cas.analyse, texteCV: cas.texteCV }
    const v1 = classifyV1Old(input), v2 = classifyV2Current(input), v3 = classifyV3New(input)
    const exp = cas.expected === 'cv'
    const mark = (r) => (isCv(r) === exp ? '✅' : '❌')
    console.log(`  ${cas.label}`)
    console.log(`    attendu=${cas.expected}  V1 ${mark(v1)} ${fmt(v1)}  V2 ${mark(v2)} ${fmt(v2)}  V3 ${mark(v3)} ${fmt(v3)}`)
  }

  // ── Dataset D : 3 nouveaux cas réels ─────────────────────────────────
  console.log('\n📊 Dataset D — 3 cas réels batch test (Manor/Sandra/Marjorie — attendu non-CV)')
  let dFixed = 0
  for (const cas of NEW_REAL_CASES) {
    const input = { analyse: cas.analyse, texteCV: cas.texteCV }
    const v1 = classifyV1Old(input), v2 = classifyV2Current(input), v3 = classifyV3New(input)
    const exp = cas.expected === 'cv'
    const mark = (r) => (isCv(r) === exp ? '✅' : '❌')
    if (isCv(v3) === exp) dFixed++
    console.log(`  ${cas.label}`)
    console.log(`    attendu=${cas.expected}  V1 ${mark(v1)} ${fmt(v1)}  V2 ${mark(v2)} ${fmt(v2)}  V3 ${mark(v3)} ${fmt(v3)}`)
  }

  // ── Dataset E : Zahmoul warning ───────────────────────────────────────
  console.log('\n📊 Dataset E — Cas Zahmoul (warning name_ambiguity)')
  const zInput = { analyse: ZAHMOUL_CASE.analyse, texteCV: ZAHMOUL_CASE.texteCV }
  const zV3 = classifyV3New(zInput)
  const zWarn = detectNameAmbiguity(zInput)
  console.log(`  ${ZAHMOUL_CASE.label}`)
  console.log(`    classif V3 : ${fmt(zV3)} ${isCv(zV3) ? '✅' : '❌'} (attendu CV)`)
  console.log(`    warning    : ${zWarn ? `✅ ${zWarn.code} — ${zWarn.message}` : '❌ non détecté'}`)

  // ── Synthèse ──────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(80))
  console.log('RÉSUMÉ V3_NEW (v1.9.102 proposé)')
  console.log('━'.repeat(80))
  console.log(`A) 100 CVs réels                        : ${a.v3}/100      ${a.v3 === 100 ? '✅' : '❌'}`)
  console.log(`B) 20 non-CVs synthétiques              : ${b.v3}/20      ${b.v3 === 20 ? '✅' : '❌'}`)
  console.log(`C) Loïc Arluna (1 CV + 4 non-CV)        : ${LOIC_ARLUNA_CASES.filter(cas => { const v3 = classifyV3New({ analyse: cas.analyse, texteCV: cas.texteCV }); return isCv(v3) === (cas.expected === 'cv') }).length}/5       (voir détail ci-dessus)`)
  console.log(`D) Nouveaux cas réels (Manor/Sandra/M.) : ${dFixed}/3       ${dFixed === 3 ? '✅' : '❌'}`)
  console.log(`E) Warning Zahmoul                       : ${zWarn ? 'détecté ✅' : 'non détecté ❌'}   + classifié CV ${isCv(zV3) ? '✅' : '❌'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
