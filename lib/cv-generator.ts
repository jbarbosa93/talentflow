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
    if (y - needed < MARGIN + 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
    return page
  }

  function drawSectionTitle(title: string) {
    newPageIfNeeded(40)
    y -= 20
    // Yellow line
    page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_WIDTH, height: 2, color: YELLOW })
    y -= 18
    page.drawText(title.toUpperCase(), { x: MARGIN, y, font: helveticaBold, size: 11, color: DARK })
    y -= 18
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

  // ═══════════════════ HEADER ═══════════════════

  // Yellow header band
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 100, width: PAGE_WIDTH, height: 100, color: YELLOW })

  // Logo
  if (logoPng) {
    const logoScale = 60 / logoPng.height
    page.drawImage(logoPng, {
      x: MARGIN,
      y: PAGE_HEIGHT - 85,
      width: logoPng.width * logoScale,
      height: 60,
    })
  } else {
    page.drawText('L-AGENCE', { x: MARGIN, y: PAGE_HEIGHT - 65, font: helveticaBold, size: 22, color: DARK })
    page.drawText('Emplois fixes & temporaires', { x: MARGIN, y: PAGE_HEIGHT - 82, font: helvetica, size: 9, color: DARK })
  }

  // "DOSSIER CANDIDAT" à droite
  page.drawText('DOSSIER CANDIDAT', {
    x: PAGE_WIDTH - MARGIN - helveticaBold.widthOfTextAtSize('DOSSIER CANDIDAT', 12),
    y: PAGE_HEIGHT - 55,
    font: helveticaBold,
    size: 12,
    color: DARK,
  })

  // Date
  const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  page.drawText(dateStr, {
    x: PAGE_WIDTH - MARGIN - helvetica.widthOfTextAtSize(dateStr, 9),
    y: PAGE_HEIGHT - 72,
    font: helvetica,
    size: 9,
    color: DARK,
  })

  y = PAGE_HEIGHT - 120

  // ═══════════════════ CANDIDAT NAME ═══════════════════

  const fullName = getContent('nom_complet', [candidat.prenom, candidat.nom].filter(Boolean).join(' ') || 'Candidat')
  page.drawText(fullName, { x: MARGIN, y, font: helveticaBold, size: 22, color: DARK })
  y -= 24

  if (candidat.titre_poste) {
    page.drawText(getContent('titre_poste', candidat.titre_poste), { x: MARGIN, y, font: helvetica, size: 14, color: GRAY })
    y -= 20
  }

  // Info line : localisation · âge · permis — controlled by customContent flags
  const showLoc = customContent?.show_localisation !== '0'
  const showAge = customContent?.show_age !== '0'
  const showPermis = customContent?.show_permis !== '0'

  const infoParts: string[] = []
  if (showLoc) {
    const loc = getContent('localisation', candidat.localisation || '')
    if (loc) infoParts.push(loc)
  }
  const age = calculerAge(candidat.date_naissance ?? null)
  if (showAge && age) infoParts.push(`${age} ans`)
  if (showPermis && candidat.permis_conduire) infoParts.push('Permis de conduire')
  if (infoParts.length > 0) {
    page.drawText(infoParts.join('  ·  '), { x: MARGIN, y, font: helvetica, size: 10, color: GRAY })
    y -= 16
  }

  // Separator
  y -= 8
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 1, color: LIGHT_GRAY })
  y -= 16

  // ═══════════════════ RÉSUMÉ ═══════════════════

  if (shouldInclude('resume') && candidat.resume_ia) {
    drawSectionTitle('Profil')
    drawText(getContent('resume_ia', candidat.resume_ia), { fontSize: 10, color: GRAY })
    y -= 8
  }

  // ═══════════════════ COMPÉTENCES ═══════════════════

  if (shouldInclude('competences') && candidat.competences && candidat.competences.length > 0) {
    drawSectionTitle('Compétences')
    const comps = candidat.competences
    // Draw as inline tags
    let xPos = MARGIN
    for (const comp of comps) {
      const w = helvetica.widthOfTextAtSize(comp, 9) + 16
      if (xPos + w > PAGE_WIDTH - MARGIN) {
        xPos = MARGIN
        y -= 22
      }
      newPageIfNeeded(24)
      // Tag background
      page.drawRectangle({ x: xPos, y: y - 4, width: w, height: 18, color: rgb(255 / 255, 243 / 255, 196 / 255) })
      page.drawText(comp, { x: xPos + 8, y: y, font: helvetica, size: 9, color: DARK })
      xPos += w + 6
    }
    y -= 28
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

  // Footer style signature email (dark band + recruiter info)
  const footerH = 70
  const footerY = 0

  // Dark background band
  page.drawRectangle({ x: 0, y: footerY, width: PAGE_WIDTH, height: footerH, color: DARK })
  // Yellow accent line at top
  page.drawRectangle({ x: 0, y: footerH, width: PAGE_WIDTH, height: 3, color: YELLOW })

  if (recruiterInfo) {
    const recName = `${recruiterInfo.prenom} ${recruiterInfo.nom}`
    page.drawText(recName, { x: MARGIN, y: footerH - 22, font: helveticaBold, size: 11, color: WHITE })
    const recTitle = recruiterInfo.entreprise || 'L-Agence SA'
    page.drawText(recTitle, { x: MARGIN, y: footerH - 36, font: helvetica, size: 9, color: YELLOW })
    const contactParts = [recruiterInfo.email, recruiterInfo.telephone].filter(Boolean).join('  |  ')
    if (contactParts) {
      page.drawText(contactParts, { x: MARGIN, y: footerH - 50, font: helvetica, size: 8, color: rgb(180/255, 180/255, 180/255) })
    }
  } else {
    page.drawText('L-AGENCE', { x: MARGIN, y: footerH - 24, font: helveticaBold, size: 14, color: YELLOW })
    page.drawText('Emplois fixes & temporaires', { x: MARGIN, y: footerH - 40, font: helvetica, size: 9, color: rgb(180/255, 180/255, 180/255) })
  }

  // Confidential notice right side in footer
  const confText = 'Document confidentiel'
  page.drawText(confText, {
    x: PAGE_WIDTH - MARGIN - helvetica.widthOfTextAtSize(confText, 8),
    y: footerH - 50,
    font: helvetica,
    size: 8,
    color: rgb(120/255, 120/255, 120/255),
  })

  return doc.save()
}
