// Génère 6 PDFs CV/certificat fictifs pour Test 3 OneDrive sync
// Usage : npx tsx scripts/gen-test-onedrive-pdfs.ts

import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const OUT = '/Users/joaobarbosa/Desktop/talentflow-test-fixtures/'

async function makePdf(outName: string, title: string, blocks: Array<{ heading?: string; lines: string[] }>) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595, 842]) // A4 portrait
  let y = 800

  const draw = (text: string, f: any = font, size = 11, color = rgb(0.15, 0.15, 0.15)) => {
    if (y < 60) { page = doc.addPage([595, 842]); y = 800 }
    page.drawText(text, { x: 50, y, size, font: f, color })
    y -= size + 4
  }

  draw(title, fontBold, 18, rgb(0, 0.3, 0.6))
  y -= 6
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) })
  y -= 14

  for (const b of blocks) {
    if (b.heading) {
      y -= 8
      draw(b.heading, fontBold, 13, rgb(0, 0.3, 0.6))
      y -= 2
    }
    for (const line of b.lines) draw(line)
  }

  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, outName), bytes)
  return path.join(OUT, outName)
}

async function main() {
  // ── 1. CV Mathieu Berset (nouveau candidat) ────────────────────────────
  const cv1 = await makePdf('test-od-nouveau-cv.pdf', 'Mathieu Berset', [
    { lines: [
      'Électricien qualifié',
      'Né le 12/03/1988 à Sion (VS), Suisse',
      'Email: mathieu.berset.test@example.ch',
      'Téléphone: +41 79 123 45 67',
      'Rue des Remparts 42, 1950 Sion, Suisse',
    ] },
    { heading: 'Expériences professionnelles', lines: [
      '2020 - 2025 : Électricien qualifié — Helvetia Électricité SA, Sion',
      '  Installation de tableaux électriques tertiaires et industriels,',
      '  câblage en atelier et sur chantier, mise en service.',
      '',
      '2016 - 2020 : Électricien de chantier — Construct-Valais SARL, Sierre',
      '  Pose de gaines, tirage de câbles, raccordements prises et luminaires,',
      '  lecture de plans et respect des normes NIBT.',
      '',
      '2013 - 2016 : Apprenti Électricien CFC — Romandie Élec, Martigny',
      '  Formation complète en courant fort, respect des règles sécurité.',
    ] },
    { heading: 'Formation', lines: [
      '2013 - 2016 : CFC d\'Installateur-Électricien — CFP Martigny',
      '2010 - 2013 : Cycle d\'orientation — CO Sion',
    ] },
    { heading: 'Compétences', lines: [
      '• Installation tableaux électriques tertiaires',
      '• Câblage industriel et raccordement armoires',
      '• Lecture de schémas et plans d\'exécution',
      '• Maîtrise NIBT 2020 (normes suisses)',
      '• Diagnostic pannes courant fort',
      '• Mise en service installations domestiques',
      '• Gestion chantier et respect planning',
      '• Conduite chariot élévateur',
    ] },
    { heading: 'Langues', lines: [
      'Français (natif) — Allemand (B1) — Anglais (A2)',
    ] },
  ])

  // ── 2. Copie EXACTE du fichier 1 (même SHA256) ─────────────────────────
  const cv2 = path.join(OUT, 'test-od-meme-cv.pdf')
  fs.copyFileSync(cv1, cv2)

  // ── 3. CV Sophie Wicky v1 ──────────────────────────────────────────────
  await makePdf('test-od-update-v1.pdf', 'Sophie Wicky', [
    { lines: [
      'Assistante administrative',
      'Née le 25/07/1992 à Monthey (VS), Suisse',
      'Email: sophie.wicky.test@example.ch',
      'Téléphone: +41 78 234 56 78',
      'Avenue de l\'Industrie 15, 1870 Monthey, Suisse',
    ] },
    { heading: 'Expériences professionnelles', lines: [
      '2022 - 2024 : Assistante administrative — Cabinet Dupuis Sàrl, Monthey',
      '  Gestion agendas, accueil clients, facturation et rapprochements bancaires.',
      '',
      '2018 - 2022 : Secrétaire — Garage du Rhône, Collombey',
      '  Accueil téléphonique, planification rendez-vous, suivi devis.',
    ] },
    { heading: 'Formation', lines: [
      '2017 - 2018 : CFC Employée de commerce — EPCA Monthey',
    ] },
    { heading: 'Compétences', lines: [
      '• Suite Microsoft Office (Word, Excel, Outlook)',
      '• Facturation et suivi comptabilité de base',
      '• Gestion agendas multi-collaborateurs',
      '• Accueil physique et téléphonique',
      '• Rédaction correspondance professionnelle',
      '• Classement et archivage numérique',
    ] },
    { heading: 'Langues', lines: [
      'Français (natif) — Anglais (B1)',
    ] },
  ])

  // ── 4. CV Sophie Wicky v2 (update, même personne) ──────────────────────
  await makePdf('test-od-update-v2.pdf', 'Sophie Wicky', [
    { lines: [
      'Responsable administrative',
      'Née le 25/07/1992 à Monthey (VS), Suisse',
      'Email: sophie.wicky.test@example.ch',
      'Téléphone: +41 78 234 56 78',
      'Avenue de l\'Industrie 15, 1870 Monthey, Suisse',
    ] },
    { heading: 'Expériences professionnelles', lines: [
      '2024 - présent : Responsable administrative — Cabinet Dupuis Sàrl, Monthey',
      '  Promotion interne : gestion équipe de 3 assistantes, coordination',
      '  avec la direction, supervision du suivi comptable et des devis.',
      '',
      '2022 - 2024 : Assistante administrative — Cabinet Dupuis Sàrl, Monthey',
      '  Gestion agendas, accueil clients, facturation et rapprochements bancaires.',
      '',
      '2018 - 2022 : Secrétaire — Garage du Rhône, Collombey',
      '  Accueil téléphonique, planification rendez-vous, suivi devis.',
    ] },
    { heading: 'Formation', lines: [
      '2017 - 2018 : CFC Employée de commerce — EPCA Monthey',
      '2024 : Formation continue Management d\'équipe — IFFP',
    ] },
    { heading: 'Compétences', lines: [
      '• Suite Microsoft Office (Word, Excel, Outlook)',
      '• Facturation et suivi comptabilité avancée',
      '• Gestion agendas multi-collaborateurs',
      '• Accueil physique et téléphonique',
      '• Rédaction correspondance professionnelle',
      '• Classement et archivage numérique',
      '• Management d\'équipe (3 personnes)',
      '• Reporting mensuel à la direction',
    ] },
    { heading: 'Langues', lines: [
      'Français (natif) — Anglais (B1)',
    ] },
  ])

  // ── 5. Certificat de travail pour Mathieu Berset ───────────────────────
  await makePdf('test-od-certificat-existant.pdf', 'Certificat de travail', [
    { lines: [
      'Helvetia Électricité SA',
      'Rue de l\'Industrie 8, 1950 Sion',
      '',
      'Sion, le 15 février 2025',
    ] },
    { heading: 'Certificat de travail', lines: [
      '',
      'Nous certifions que Monsieur Mathieu Berset, né le 12 mars 1988,',
      'a été employé dans notre entreprise du 1er janvier 2020 au 31 janvier 2025',
      'en qualité d\'Électricien qualifié à plein temps.',
      '',
      'Monsieur Berset a assumé les tâches suivantes :',
      '  • Installation de tableaux électriques tertiaires et industriels',
      '  • Câblage en atelier et sur chantier',
      '  • Mise en service d\'installations domestiques et tertiaires',
      '  • Diagnostic de pannes courant fort',
      '',
      'Nous avons apprécié son sérieux, sa ponctualité et sa capacité',
      'à travailler de manière autonome dans le respect des normes NIBT.',
      '',
      'Il quitte notre entreprise à sa propre demande pour évoluer',
      'professionnellement. Nous lui souhaitons plein succès pour la suite.',
      '',
      '',
      'Jean-Marc Delacroix',
      'Directeur Helvetia Électricité SA',
    ] },
  ])

  // ── 6. Certificat de travail orphelin (Patricia Chevrier) ──────────────
  await makePdf('test-od-certificat-inconnu.pdf', 'Certificat de travail', [
    { lines: [
      'Boulangerie du Vieux-Moulin Sàrl',
      'Rue du Bourg 12, 1920 Martigny',
      '',
      'Martigny, le 28 juin 2024',
    ] },
    { heading: 'Certificat de travail', lines: [
      '',
      'Nous certifions que Madame Patricia Chevrier, née le 3 novembre 1975,',
      'a été employée dans notre boulangerie du 15 mars 2019 au 30 juin 2024',
      'en qualité de Vendeuse-caissière à temps partiel (80%).',
      '',
      'Madame Chevrier a assumé les tâches suivantes :',
      '  • Accueil et service à la clientèle',
      '  • Encaissement et gestion de la caisse',
      '  • Mise en place des vitrines',
      '  • Préparation des commandes clients',
      '  • Contrôle et rotation des stocks',
      '',
      'Nous avons apprécié sa disponibilité, son sens du contact client',
      'et son implication quotidienne dans la bonne tenue du magasin.',
      '',
      'Elle quitte notre entreprise pour convenance personnelle.',
      'Nous lui souhaitons le meilleur pour son avenir professionnel.',
      '',
      '',
      'Marie-France Gaillard',
      'Gérante Boulangerie du Vieux-Moulin Sàrl',
    ] },
  ])

  // ── Résumé ──
  console.log('━'.repeat(70))
  console.log('6 PDFs générés dans', OUT)
  console.log('━'.repeat(70))
  const files = [
    'test-od-nouveau-cv.pdf',
    'test-od-meme-cv.pdf',
    'test-od-update-v1.pdf',
    'test-od-update-v2.pdf',
    'test-od-certificat-existant.pdf',
    'test-od-certificat-inconnu.pdf',
  ]
  for (const f of files) {
    const stat = fs.statSync(path.join(OUT, f))
    console.log(`  ${f.padEnd(45)} ${(stat.size / 1024).toFixed(1).padStart(6)} KB`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
