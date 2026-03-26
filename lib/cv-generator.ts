// lib/cv-generator.ts
// Génère un CV PDF brandé avec le logo L-Agence SA
// Utilise pdf-lib (déjà installé)

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

interface CandidatData {
  prenom?: string | null
  nom?: string | null
  email?: string | null
  telephone?: string | null
  localisation?: string | null
  titre_poste?: string | null
  date_naissance?: string | null
  resume_ia?: string | null
  competences?: string[] | null
  formation?: string | null
  langues?: string[] | null
  permis_conduire?: boolean | null
  experiences?: { poste: string; entreprise: string; periode: string; description: string }[] | null
  formations_details?: { diplome: string; etablissement: string; annee: string }[] | null
}

interface RecruiterInfo {
  nom: string
  prenom: string
  email: string
  telephone?: string
  entreprise?: string
}

interface CVOptions {
  recruiterInfo?: RecruiterInfo
  includedSections?: string[]
  customContent?: Record<string, string>
}

// Couleurs
const YELLOW = rgb(247 / 255, 201 / 255, 72 / 255)
const DARK = rgb(28 / 255, 26 / 255, 20 / 255)
const GRAY = rgb(107 / 255, 114 / 255, 128 / 255)
const LIGHT_GRAY = rgb(229 / 255, 231 / 255, 235 / 255)
const WHITE = rgb(1, 1, 1)

const PAGE_WIDTH = 595.28  // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

// Helper : wrap text into lines
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

// Helper : calculer l'âge
function calculerAge(dateNaissance: string | null): number | null {
  if (!dateNaissance) return null
  const s = dateNaissance.trim()
  if (/^\d{1,3}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 120 ? n : null
  }
  if (/^\d{4}$/.test(s)) {
    return new Date().getFullYear() - parseInt(s, 10)
  }
  const euMatch = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/)
  if (euMatch) {
    const birth = new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]))
    if (!isNaN(birth.getTime())) {
      const today = new Date()
      let age = today.getFullYear() - birth.getFullYear()
      const m = today.getMonth() - birth.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
      return age > 0 && age < 120 ? age : null
    }
  }
  return null
}

export async function generateBrandedCV(
  candidat: CandidatData,
  options: CVOptions = {}
): Promise<Uint8Array> {
  const { recruiterInfo, includedSections, customContent } = options

  const doc = await PDFDocument.create()
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Essayer de charger le logo
  let logoPng: Awaited<ReturnType<typeof doc.embedPng>> | null = null
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-agence.png')
    const logoBytes = fs.readFileSync(logoPath)
    logoPng = await doc.embedPng(logoBytes)
  } catch {
    // Logo non trouvé — fallback texte
  }

  function shouldInclude(section: string) {
    if (!includedSections || includedSections.length === 0) return true
    return includedSections.includes(section)
  }

  function getContent(field: string, defaultValue: string) {
    return customContent?.[field] ?? defaultValue
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  function newPageIfNeeded(needed: number): PDFPage {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
    return page
  }

  function drawSectionTitle(title: string) {
    newPageIfNeeded(30)
    y -= 10
    // Yellow line
    page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_WIDTH, height: 2, color: YELLOW })
    y -= 12
    page.drawText(title.toUpperCase(), { x: MARGIN, y, font: helveticaBold, size: 10, color: DARK })
    y -= 12
  }

  function drawText(text: string, opts?: { fontSize?: number; font?: PDFFont; color?: typeof DARK; indent?: number; maxWidth?: number }) {
    const fontSize = opts?.fontSize ?? 10
    const font = opts?.font ?? helvetica
    const color = opts?.color ?? DARK
    const indent = opts?.indent ?? 0
    const maxWidth = opts?.maxWidth ?? (CONTENT_WIDTH - indent)
    const lines = wrapText(text, font, fontSize, maxWidth)
    for (const line of lines) {
      newPageIfNeeded(fontSize + 4)
      page.drawText(line, { x: MARGIN + indent, y, font, size: fontSize, color })
      y -= fontSize + 4
    }
  }

  // ═══════════════════ HEADER — CLEAN, NO YELLOW ═══════════════════

  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold)

  // Logo text "L-AGENCE" in serif (same weight, no bold on L)
  const logoY = PAGE_HEIGHT - MARGIN - 10
  page.drawText('L', { x: MARGIN, y: logoY, font: timesRoman, size: 36, color: DARK })
  page.drawText('-AGENCE', { x: MARGIN + timesRoman.widthOfTextAtSize('L', 36), y: logoY, font: timesRoman, size: 22, color: DARK })
  page.drawText('Emplois fixes & temporaires', { x: MARGIN, y: logoY - 18, font: helvetica, size: 8, color: GRAY })

  // Recruiter info top-right
  const rightX = PAGE_WIDTH - MARGIN
  if (recruiterInfo) {
    const recName = `${recruiterInfo.prenom} ${recruiterInfo.nom}`
    page.drawText(recName, { x: rightX - helveticaBold.widthOfTextAtSize(recName, 11), y: logoY, font: helveticaBold, size: 11, color: DARK })
    const recRole = 'Consultant'
    page.drawText(recRole, { x: rightX - helvetica.widthOfTextAtSize(recRole, 9), y: logoY - 14, font: helvetica, size: 9, color: GRAY })
    // Numéro mobile du recruteur
    if (recruiterInfo.telephone) {
      page.drawText(recruiterInfo.telephone, { x: rightX - helvetica.widthOfTextAtSize(recruiterInfo.telephone, 8), y: logoY - 26, font: helvetica, size: 8, color: GRAY })
    }
    if (recruiterInfo.email) {
      page.drawText(recruiterInfo.email, { x: rightX - helvetica.widthOfTextAtSize(recruiterInfo.email, 8), y: logoY - 38, font: helvetica, size: 8, color: GRAY })
    }
  }

  // Thin separator line
  page.drawRectangle({ x: MARGIN, y: logoY - 48, width: CONTENT_WIDTH, height: 1, color: LIGHT_GRAY })

  // "Dossier candidat · date" small, right-aligned under separator
  const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  const dossierLabel = `Dossier candidat · ${dateStr}`
  page.drawText(dossierLabel, {
    x: PAGE_WIDTH - MARGIN - helvetica.widthOfTextAtSize(dossierLabel, 8),
    y: logoY - 62,
    font: helvetica,
    size: 8,
    color: GRAY,
  })

  y = logoY - 72

  // ═══════════════════ CANDIDAT NAME ═══════════════════

  const fullName = getContent('nom_complet', [candidat.prenom, candidat.nom].filter(Boolean).join(' ') || 'Candidat')
  page.drawText(fullName, { x: MARGIN, y, font: helveticaBold, size: 20, color: DARK })
  y -= 20

  if (candidat.titre_poste) {
    page.drawText(getContent('titre_poste', candidat.titre_poste), { x: MARGIN, y, font: helvetica, size: 12, color: GRAY })
    y -= 16
  }

  // Info line : localisation · âge · permis · outillé — toggles FORCENT l'affichage
  const showLoc = customContent?.show_localisation !== '0'
  const showAge = customContent?.show_age !== '0'
  const showPermis = customContent?.show_permis !== '0'
  const showOutille = customContent?.show_outille === '1'

  const infoParts: string[] = []
  if (showLoc) {
    const loc = getContent('localisation', candidat.localisation || '')
    if (loc) infoParts.push(loc)
  }
  const age = calculerAge(candidat.date_naissance ?? null)
  if (showAge && age) infoParts.push(`${age} ans`)
  // Permis : afficher si coché, même si pas en base
  if (showPermis) infoParts.push('Permis de conduire')
  if (showOutille) infoParts.push('Outillé')
  if (infoParts.length > 0) {
    page.drawText(infoParts.join('  ·  '), { x: MARGIN, y, font: helvetica, size: 10, color: GRAY })
    y -= 14
  }

  // Separator — plus compact
  y -= 4
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 1, color: LIGHT_GRAY })
  y -= 10

  // ═══════════════════ RÉSUMÉ ═══════════════════

  if (shouldInclude('resume') && candidat.resume_ia) {
    drawSectionTitle('Profil')
    drawText(getContent('resume_ia', candidat.resume_ia), { fontSize: 10, color: GRAY })
    y -= 8
  }

  // ═══════════════════ COMPÉTENCES ═══════════════════

  if (shouldInclude('competences') && candidat.competences && candidat.competences.length > 0) {
    drawSectionTitle('Compétences')
    // Support compétences custom depuis le customizer (séparées par virgule)
    const customComps = customContent?.competences?.trim()
    const comps = customComps ? customComps.split(',').map((s: string) => s.trim()).filter(Boolean) : candidat.competences
    // Draw as inline tags
    let xPos = MARGIN
    for (const comp of comps) {
      const w = helvetica.widthOfTextAtSize(comp, 9) + 14
      if (xPos + w > PAGE_WIDTH - MARGIN) {
        xPos = MARGIN
        y -= 20
      }
      newPageIfNeeded(22)
      // Tag background — arrondi, centré verticalement
      page.drawRectangle({ x: xPos, y: y - 2, width: w, height: 16, color: rgb(254 / 255, 243 / 255, 199 / 255), borderColor: rgb(217 / 255, 119 / 255, 6 / 255), borderWidth: 0.5, opacity: 0.7 })
      page.drawText(comp, { x: xPos + 7, y: y + 2, font: helvetica, size: 9, color: DARK })
      xPos += w + 5
    }
    y -= 24
  }

  // ═══════════════════ EXPÉRIENCES ═══════════════════

  if (shouldInclude('experiences') && candidat.experiences && candidat.experiences.length > 0) {
    drawSectionTitle('Expériences professionnelles')
    for (const exp of candidat.experiences) {
      newPageIfNeeded(50)
      drawText(exp.poste, { font: helveticaBold, fontSize: 11 })
      drawText(`${exp.entreprise}  ·  ${exp.periode}`, { fontSize: 9, color: GRAY })
      if (exp.description) {
        y -= 2
        drawText(exp.description, { fontSize: 9, color: GRAY, indent: 0 })
      }
      y -= 10
    }
  }

  // ═══════════════════ FORMATIONS ═══════════════════

  if (shouldInclude('formations') && candidat.formations_details && candidat.formations_details.length > 0) {
    drawSectionTitle('Formations')
    for (const f of candidat.formations_details) {
      newPageIfNeeded(30)
      drawText(`${f.diplome}`, { font: helveticaBold, fontSize: 10 })
      drawText(`${f.etablissement}  ·  ${f.annee}`, { fontSize: 9, color: GRAY })
      y -= 8
    }
  } else if (shouldInclude('formations') && candidat.formation) {
    drawSectionTitle('Formation')
    drawText(getContent('formation', candidat.formation), { fontSize: 10, color: GRAY })
    y -= 8
  }

  // ═══════════════════ LANGUES ═══════════════════

  if (shouldInclude('langues') && candidat.langues && candidat.langues.length > 0) {
    drawSectionTitle('Langues')
    drawText(candidat.langues.join('  ·  '), { fontSize: 10 })
    y -= 8
  }

  // ═══════════════════ FOOTER — SIGNATURE STYLE ═══════════════════

  const footerTop = 80
  // Separator line
  page.drawRectangle({ x: MARGIN, y: footerTop, width: CONTENT_WIDTH, height: 1, color: LIGHT_GRAY })

  // Left side: L-AGENCE + agency info
  const fLeftY = footerTop - 16
  page.drawText('L', { x: MARGIN, y: fLeftY, font: timesRoman, size: 20, color: DARK })
  page.drawText('-AGENCE', { x: MARGIN + timesRoman.widthOfTextAtSize('L', 20), y: fLeftY, font: timesRoman, size: 14, color: DARK })
  page.drawText('Emplois fixes & temporaires', { x: MARGIN, y: fLeftY - 14, font: helvetica, size: 7, color: GRAY })
  page.drawText('+41 24 552 18 70  |  info@l-agence.ch', { x: MARGIN, y: fLeftY - 26, font: helvetica, size: 8, color: GRAY })
  page.drawText('Avenue des Alpes 3, 1870 Monthey - CH', { x: MARGIN, y: fLeftY - 38, font: helvetica, size: 7, color: GRAY })

  // Confidential notice centered at very bottom
  const confText = 'Document confidentiel'
  page.drawText(confText, {
    x: (PAGE_WIDTH - helvetica.widthOfTextAtSize(confText, 7)) / 2,
    y: 12,
    font: helvetica,
    size: 7,
    color: rgb(200/255, 200/255, 200/255),
  })

  return doc.save()
}
