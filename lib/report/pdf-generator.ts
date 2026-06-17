// TalentFlow Rapports — Génération du PDF final stampé (Phase 5)
// v2.3.7
//
// Génère 2 fichiers par document :
//   1. rapport_signe_S{n}_...pdf  : rapport stampé (sans footer audit, avec ligne header discrète)
//   2. certificat_signature_S{n}_...pdf : certificat standalone (signataires + SHA-256 + ZertES)
//
// Pattern aligné sur lib/sign/pdf-generator.ts :
//   1. Download PDF source du template depuis Storage
//   2. Hash SHA-256 du PDF source (preuve ZertES)
//   3. Multi-pass stampPdf : pass 1 fields candidat, pass 2 fields client (sans footer)
//   4. Ajout ligne audit discrète en haut de la page 1
//   5. Certificat standalone (buildCertificatePdf)
//   6. Upload des 2 fichiers + persist signed_pdf_paths

import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampPdf } from '@/lib/sign/pdf-stamp'
import { computeFormulaValue, getDayOffsetFromSection, dateForDayOfWeek } from '@/lib/sign/field-helpers'
import { safePdfText } from '@/lib/sign/safe-text'
import { pointageHours, type PointageValue } from '@/lib/sign/pointage'
import type { SignField } from '@/lib/sign/types'
import { uploadSignDocument, SIGN_BUCKET } from '@/lib/sign/storage'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { SignDocument, SignTemplate } from '@/lib/sign/types'
import type { ReportLink, ReportSubmission } from './types'
import { getWeekDates } from './week-helpers'
import { formatDateChDot } from './text-format'

export interface GeneratedReportDoc {
  name: string
  path: string
  sha256: string
  pdfBase64: string
}

export interface GenerateReportPdfArgs {
  link: ReportLink
  submission: ReportSubmission
  /** Données candidat lié pour pré-fill (firstName/lastName/etc.) */
  candidat?: {
    prenom?: string | null
    nom?: string | null
    email?: string | null
  } | null
}

/**
 * v2.11.4 — Dates TOUJOURS dérivées de la semaine (déterministe), côté serveur.
 *
 * Les champs Date d'un rapport (un par jour) sont calculables à 100 % depuis
 * week_start (Lundi = week_start, Mardi = +1, …) + le n° de semaine (dateFormat
 * « WW »). L'auto-fill existait déjà côté candidat (app/report/[slug]) mais
 * pouvait être contourné/écrasé par un brouillon → des soumissions arrivaient
 * avec des dates vides → ligne Date blanche dans le PDF (bug Landry Renia 15/06).
 *
 * On garantit ici : à la génération, tout champ date VIDE est rempli depuis
 * week_start. Les valeurs explicitement saisies par le candidat sont préservées.
 */
function enrichReportDateValues(
  fields: SignField[] | undefined,
  values: Record<string, unknown> | null | undefined,
  weekStartRaw: string | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(values || {}) }
  const weekStart = String(weekStartRaw || '').slice(0, 10)
  if (!weekStart) return out
  for (const f of fields || []) {
    if (f.type !== 'date') continue
    const cur = out[f.id]
    const hasVal = cur !== undefined && cur !== null && String(cur).trim() !== ''
    if (hasVal) continue
    const offset = getDayOffsetFromSection(f.wizardSection)
    if (offset !== null) {
      const d = dateForDayOfWeek(weekStart, offset)
      if (d) out[f.id] = d
    } else if (((f as any).dateFormat || '').toString().includes('WW')) {
      out[f.id] = weekStart
    }
  }
  return out
}

/**
 * Génère les PDFs finaux stampés pour une submission completed.
 * Retourne 2 docs par document template : rapport + certificat.
 * Best-effort : retourne tableau vide si template absent ou erreurs.
 */
export async function generateReportPdf(
  args: GenerateReportPdfArgs,
): Promise<GeneratedReportDoc[]> {
  const supabase = createAdminClient()
  const { link, submission, candidat } = args

  if (!link.template_id) {
    console.warn('[report/pdf-generator] pas de template_id, génération impossible')
    return []
  }

  // 1. Récup template (sign_templates avec kind='report')
  const { data: tpl } = await supabase
    .from('sign_templates' as any)
    .select('id, name, documents, kind')
    .eq('id', link.template_id)
    .maybeSingle()
  const template = tpl as unknown as Pick<SignTemplate, 'id' | 'name' | 'documents'> | null
  const documents = (template?.documents || []) as SignDocument[]
  if (documents.length === 0) {
    console.warn('[report/pdf-generator] template sans documents')
    return []
  }

  // 2. Construit l'autoFill candidat (recipient 1) et client (recipient 2)
  // v2.3.9 Bug 9 — PRIORITÉ link.candidat_name (source unique stockée à la
  // création du lien) > concat candidat lié en DB > vide. Le lien peut
  // exister sans candidat_id (saisie manuelle) — sans cette priorité, le
  // field type='fullname' du template restait vide dans le PDF stampé.
  const fullNameFromLink = (link.candidat_name || '').trim()
  const fullNameFromDB = candidat
    ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim()
    : ''
  const fullNameCandidate = fullNameFromLink || fullNameFromDB
  const candFirstName = candidat?.prenom || (fullNameCandidate.split(/\s+/)[0] || '')
  const candLastName = candidat?.nom || (fullNameCandidate.split(/\s+/).slice(1).join(' ') || '')
  const candEmail = link.candidat_email || candidat?.email || ''
  console.log('[report/pdf-generator] candidate name resolved:', {
    fullNameFromLink: fullNameFromLink || '(empty)',
    fullNameFromDB: fullNameFromDB || '(empty)',
    final: fullNameCandidate || '(EMPTY — field will be blank)',
  })

  const clientFullName = link.client_name || ''
  const clientParts = clientFullName.trim().split(/\s+/)
  const clientFirstName = clientParts[0] || ''
  const clientLastName = clientParts.slice(1).join(' ') || ''

  // Date du jour de finalisation (utilisée comme date de signature)
  const finalizedAt = submission.client_signed_at
    ? new Date(submission.client_signed_at)
    : new Date()
  // v2.3.8 Bug 8 — formatDateChDot déterministe (JJ.MM.AAAA) ; toLocaleDateString
  // peut renvoyer des slashes selon le build ICU sur Vercel.
  const todayStr = formatDateChDot(finalizedAt)

  const generated: GeneratedReportDoc[] = []
  for (const doc of documents) {
    if (!doc.storage_path) continue
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(SIGN_BUCKET)
        .download(doc.storage_path)
      if (dlErr || !blob) {
        console.warn('[report/pdf-generator] download failed', doc.name, dlErr?.message)
        continue
      }
      const sourceBuf = new Uint8Array(await blob.arrayBuffer())
      const sha256 = createHash('sha256').update(sourceBuf).digest('hex')
      console.log('[report/pdf-generator] PDF ready:', doc.name, sourceBuf.length + 'B', '— fields:', (doc.fields || []).length, '— path:', doc.storage_path)

      // v2.3.11 Bug 3 — Diagnostic page sizes : log dimensions de chaque page
      // du PDF source pour comprendre les décalages de stamp vs viewer.
      try {
        const probePdf = await PDFDocument.load(sourceBuf, { ignoreEncryption: true })
        const probePages = probePdf.getPages()
        for (let i = 0; i < probePages.length; i++) {
          const { width, height } = probePages[i].getSize()
          const isA4Portrait  = Math.abs(width - 595) < 5 && Math.abs(height - 842) < 5
          const isA4Landscape = Math.abs(width - 842) < 5 && Math.abs(height - 595) < 5
          const isUSLetter    = Math.abs(width - 612) < 5 && Math.abs(height - 792) < 5
          console.log(`[report/pdf-generator] Page ${i + 1}/${probePages.length}: ${Math.round(width)}x${Math.round(height)}pt`, {
            A4_portrait: isA4Portrait,
            A4_landscape: isA4Landscape,
            USLetter: isUSLetter,
            ratio: (width / height).toFixed(3),
          })
        }
      } catch (probeErr) {
        console.warn('[report/pdf-generator] Diag page sizes failed', probeErr)
      }

      let currentBuf: Uint8Array = sourceBuf

      // v2.3.9 Bug 9 — Diagnostic warnings côté serveur :
      // (a) Signatures trop petites dans le template (w<150pt OR h<60pt) : impossible
      //     de corriger via code sans déborder hors de la box. Log warning pour que
      //     l'admin agrandisse le field dans l'éditeur de template.
      // (b) Heuristique v2.3.8 "promote text→fullname" SUPPRIMÉE : le diagnostic SQL
      //     a confirmé que les fields type='fullname' sont bien configurés dans
      //     les templates rapport. La heuristique était inutile et risquait de
      //     promouvoir des fields texte légitimes (ex: notes) en fullname.
      const A4_W = 595, A4_H = 842
      for (const f of doc.fields || []) {
        if (f.type !== 'signature') continue
        const wPts = (f.width || 0) * A4_W
        const hPts = (f.height || 0) * A4_H
        if (wPts < 150 || hPts < 60) {
          console.warn('[report/pdf-generator] ⚠️ Signature TROP PETITE — agrandir dans editeur template', {
            template_id: link.template_id,
            field_id: f.id,
            recipientOrder: f.recipientOrder ?? 1,
            width_pts: Math.round(wPts),
            height_pts: Math.round(hPts),
            recommended: 'width >= 200pt, height >= 80pt',
          })
        }
      }

      // v2.11.4 — Dates TOUJOURS remplies depuis week_start (garantie serveur)
      const enrichedFieldValues = enrichReportDateValues(
        doc.fields, submission.field_values, (submission as any).week_start,
      )

      // ─── Pass 1 : fields recipientOrder=1 (Candidat) ───
      const candFields = (doc.fields || []).filter(f => (f.recipientOrder ?? 1) === 1)
      if (candFields.length > 0) {
        currentBuf = await stampPdf({
          pdfBuffer: currentBuf,
          fields: candFields,
          fieldValues: enrichedFieldValues,
          signatureDataUrl: submission.candidate_signature_data_url,
          autoFill: {
            firstName: candFirstName,
            lastName: candLastName,
            fullName: fullNameCandidate || candEmail,
            email: candEmail,
            today: todayStr,
            companyName: link.client_name || '',
            title: '',
          },
          envelopeId: link.id,
          recipientName: fullNameCandidate || candEmail || 'Collaborateur',
          recipientEmail: candEmail,
          signedAt: submission.candidate_signed_at
            ? new Date(submission.candidate_signed_at)
            : finalizedAt,
          signedIp: submission.candidate_signed_ip,
          addAuditFooter: false,
        })
        console.log('[report/pdf-generator] Pass 1 (cand) done:', currentBuf.length + 'B')
      }

      // ─── Pass 2 : fields recipientOrder=2 (Client) — sans footer ───
      const clientFields = (doc.fields || []).filter(f => (f.recipientOrder ?? 1) === 2)
      currentBuf = await stampPdf({
        pdfBuffer: currentBuf,
        fields: clientFields,
        fieldValues: enrichedFieldValues,
        signatureDataUrl: submission.client_signature_data_url,
        autoFill: {
          firstName: clientFirstName,
          lastName: clientLastName,
          fullName: clientFullName || link.client_email || 'Client',
          email: link.client_email || '',
          today: todayStr,
          companyName: link.client_name || '',
          title: '',
        },
        envelopeId: link.id,
        recipientName: clientFullName || link.client_email || 'Client',
        recipientEmail: link.client_email || '',
        signedAt: submission.client_signed_at
          ? new Date(submission.client_signed_at)
          : finalizedAt,
        signedIp: submission.client_signed_ip,
        addAuditFooter: false,
      })
      console.log('[report/pdf-generator] Pass 2 (client) done:', currentBuf.length + 'B')

      // ─── 2.5 : Ligne audit discrete en haut de la page 1 ───
      currentBuf = await addAuditHeaderToReport(currentBuf, {
        linkId: link.id,
        finalizedAt,
      })
      console.log('[report/pdf-generator] Audit header added:', currentBuf.length + 'B')

      // ─── 2.6 : v2.9.82 — Page annexe « Détail des pointages » (si champs timbrage) ───
      currentBuf = await appendTimbrageAnnex(currentBuf, doc, submission.field_values || {})

      // ─── 3a : Upload rapport ───
      const reportName = buildReportFilename(link, submission, candidat)
      const reportBlob = new Blob([currentBuf as BlobPart], { type: 'application/pdf' })
      const reportPath = await uploadSignDocument(
        'signed',
        `reports/${link.id}/${submission.id}`,
        reportBlob,
        reportName,
      )
      const reportBase64 = Buffer.from(currentBuf).toString('base64')
      generated.push({ name: reportName, path: reportPath, sha256, pdfBase64: reportBase64 })
      console.log('[report/pdf-generator] Report uploaded, path:', reportPath)

      // ─── 3b : Certificat standalone ───
      const certBuf = await buildCertificatePdf({
        link,
        submission,
        candidat,
        documentName: doc.name,
        documentSha256: sha256,
      })
      console.log('[report/pdf-generator] Certificate done:', certBuf.length + 'B')

      const certName = buildCertFilename(link, submission, candidat)
      const certBlob = new Blob([certBuf as BlobPart], { type: 'application/pdf' })
      const certPath = await uploadSignDocument(
        'signed',
        `reports/${link.id}/${submission.id}`,
        certBlob,
        certName,
      )
      const certBase64 = Buffer.from(certBuf).toString('base64')
      generated.push({ name: certName, path: certPath, sha256, pdfBase64: certBase64 })
      console.log('[report/pdf-generator] Certificate uploaded, path:', certPath)

    } catch (e) {
      console.error(
        '[report/pdf-generator] stamp FAILED',
        doc.name,
        e instanceof Error ? { message: e.message, stack: e.stack?.split('\n').slice(0, 5).join(' | ') } : String(e),
      )
    }
  }

  // 4. Persist signed_pdf_paths
  if (generated.length > 0) {
    const persistable = generated.map(d => ({ name: d.name, path: d.path, sha256: d.sha256 }))
    const { error } = await supabase
      .from('report_submissions' as any)
      .update({ signed_pdf_paths: persistable })
      .eq('id', submission.id)
    if (error) console.error('[report/pdf-generator] persist error', error)
  }

  return generated
}

// ─── Filename helpers ──────────────────────────────────────────────────

/** Normalise un nom : retire accents, garde [A-Za-z0-9-], remplace les espaces par _. */
function normalizeNamePart(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 \-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

/** Extrait nom_prenom depuis candidat (prio) ou link.candidat_name (fallback split sur premier espace).
 *  Format final : "Nom_Prenom". Si nom inconnu, retourne juste "Prenom". Si rien, "candidat". */
function buildCandidatNamePart(link: ReportLink, candidat?: { prenom?: string | null; nom?: string | null } | null): string {
  // Source prio : candidat lié (champs séparés en DB, fiables)
  if (candidat?.nom || candidat?.prenom) {
    const nom = normalizeNamePart(candidat.nom || '')
    const prenom = normalizeNamePart(candidat.prenom || '')
    if (nom && prenom) return `${nom}_${prenom}`
    return nom || prenom
  }
  // Fallback : split candidat_name sur 1er espace (convention "Prénom Nom" partout dans l'app)
  const raw = (link.candidat_name || '').trim()
  if (raw) {
    const parts = raw.split(/\s+/)
    if (parts.length >= 2) {
      const prenom = normalizeNamePart(parts[0])
      const nom = normalizeNamePart(parts.slice(1).join(' '))
      return `${nom}_${prenom}`
    }
    return normalizeNamePart(raw)
  }
  return 'candidat'
}

function buildReportFilename(link: ReportLink, submission: ReportSubmission, candidat?: { prenom?: string | null; nom?: string | null } | null): string {
  try {
    const week = getWeekDates(submission.week_start)
    const namePart = buildCandidatNamePart(link, candidat)
    return `${namePart}_Semaine_${week.weekNumber}.pdf`
  } catch {
    return 'rapport_signe.pdf'
  }
}

function buildCertFilename(link: ReportLink, submission: ReportSubmission, candidat?: { prenom?: string | null; nom?: string | null } | null): string {
  try {
    const week = getWeekDates(submission.week_start)
    const namePart = buildCandidatNamePart(link, candidat)
    return `${namePart}_Semaine_${week.weekNumber}_Certificat.pdf`
  } catch {
    return 'certificat_signature.pdf'
  }
}

// ─── v2.9.82 — Page annexe « Détail des pointages » (timbrage) ────────────
// Si le document contient des champs `time`, on ajoute une page récapitulant,
// jour par jour (wizardSection), l'entrée / pause / sortie + total + position GPS.
// Le tableau principal ne montre que le total ; le détail vit ici (auditable).
async function appendTimbrageAnnex(
  pdfBuffer: Uint8Array,
  doc: SignDocument,
  fieldValues: Record<string, unknown>,
): Promise<Uint8Array> {
  const pointageFields = (doc.fields || []).filter(f => f.type === 'pointage')
  const timeFields = (doc.fields || []).filter(f => f.type === 'time')
  if (pointageFields.length === 0 && timeFields.length === 0) return pdfBuffer

  const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.11, 0.10, 0.08)
  const grey = rgb(0.42, 0.45, 0.50)
  const green = rgb(0.08, 0.50, 0.20)

  let page = pdf.addPage([595, 842])
  let y = 800
  const draw = (txt: string, x: number, size: number, f = helv, color = ink) =>
    page.drawText(safePdfText(txt), { x, y, size, font: f, color })
  const newPageIfNeeded = (min = 70) => { if (y < min) { page = pdf.addPage([595, 842]); y = 800 } }
  // v2.9.89 — Affiche l'adresse lisible (rue + localité) si résolue au pointage,
  // sinon repli sur les coordonnées brutes. v2.9.96 — précision (±m) retirée.
  const fmtGps = (g?: { lat?: number; lng?: number; acc?: number; address?: string }) => {
    if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') return ''
    return g.address
      ? g.address
      : `GPS ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`
  }

  draw('Détail des pointages', 40, 16, bold); y -= 10
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.9, 0.78, 0.3) }); y -= 22

  // v2.9.91 — Zone de travail : par section (jour) ou hebdo (sans section de jour).
  const amber = rgb(0.57, 0.25, 0.05)
  const zoneFields = (doc.fields || []).filter(f => f.type === 'zone')
  const zoneFor = (sec: string): string => {
    const z = zoneFields.find(f => (f.wizardSection || '').trim() === sec.trim() && String(fieldValues[f.id] || '').trim())
    return z ? String(fieldValues[z.id]).trim() : ''
  }
  const daySectionsSet = new Set(pointageFields.map(p => (p.wizardSection || '').trim()))
  const weekZoneField = zoneFields.find(f => !daySectionsSet.has((f.wizardSection || '').trim()) && String(fieldValues[f.id] || '').trim())
  if (weekZoneField) {
    draw(`Zone de travail : ${String(fieldValues[weekZoneField.id]).trim()}`, 40, 11, bold, amber); y -= 18
  }

  let grandTotal = 0

  // ── Pointeuses (1 champ = 1 jour) ──
  for (const f of pointageFields) {
    newPageIfNeeded(110)
    // v2.9.90 — Priorité à la section (= jour : Lundi/Mardi…) plutôt qu'au libellé du champ.
    const day = (f.wizardSection || f.tooltip || f.label || 'Jour').toString()
    const zoneVal = zoneFor(f.wizardSection || '')
    const v = (fieldValues[f.id] && typeof fieldValues[f.id] === 'object')
      ? fieldValues[f.id] as PointageValue : {} as PointageValue
    draw(day, 40, 12, bold); y -= 16
    if (zoneVal) { draw(`Zone : ${zoneVal}`, 52, 9.5, helv, amber); y -= 13; newPageIfNeeded(60) }
    if (v.absent) {
      // v2.9.88 — Jour d'absence : motif affiché ici (certificat), 0h dans le rapport.
      const reason = (v.absenceReason || '').trim()
      draw(`Absent${reason ? ` — ${reason}` : ''}`, 52, 10, helv, rgb(0.63, 0.38, 0.03)); y -= 14
      draw('Total : 0.00 h', 52, 10, bold, green); y -= 20
    } else {
      draw(`Debut : ${v.start || '—'}`, 52, 10, helv); y -= 14
      const sg = fmtGps(v.startGps); if (sg) { draw(`  ${sg}`, 60, 8.5, helv, grey); y -= 12; newPageIfNeeded(60) }
      for (let i = 0; i < (v.pauses || []).length; i++) {
        const pz = v.pauses![i]
        draw(`Pause ${i + 1} : ${pz.from || '—'} -> ${pz.to || '—'}`, 52, 10, helv); y -= 14
        newPageIfNeeded(60)
      }
      draw(`Fin : ${v.end || '—'}`, 52, 10, helv); y -= 14
      const eg = fmtGps(v.endGps); if (eg) { draw(`  ${eg}`, 60, 8.5, helv, grey); y -= 12; newPageIfNeeded(60) }
      const h = pointageHours(v); grandTotal += h
      draw(`Total : ${h.toFixed(2)} h`, 52, 10, bold, green); y -= 20
    }
  }

  // ── Champs heure simples (ancien modèle, regroupés par section) ──
  if (timeFields.length > 0) {
    const groups = new Map<string, SignField[]>()
    for (const f of timeFields) {
      const sec = (f.wizardSection || 'Heures').trim() || 'Heures'
      if (!groups.has(sec)) groups.set(sec, [])
      groups.get(sec)!.push(f)
    }
    for (const [day, fields] of groups) {
      newPageIfNeeded(90)
      draw(day, 40, 12, bold); y -= 16
      for (const f of fields) {
        const v = fieldValues[f.id]
        draw(`• ${(f.tooltip || f.label || 'Heure')} : ${v ? String(v) : '—'}`, 52, 10, helv); y -= 14
        newPageIfNeeded(60)
      }
      const total = computeFormulaValue(
        { id: 'tmp', type: 'formula', formulaOp: 'worktime', formulaSourceIds: fields.map(f => f.id) } as unknown as SignField,
        fieldValues,
      )
      if (total !== null) { grandTotal += total; draw(`Total : ${total.toFixed(2)} h`, 52, 10, bold, green); y -= 18 }
      y -= 6
    }
  }

  // ── Total général de la semaine ──
  newPageIfNeeded(60)
  y -= 6
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.7, color: rgb(0.8, 0.8, 0.8) }); y -= 18
  draw(`TOTAL SEMAINE : ${grandTotal.toFixed(2)} h`, 40, 13, bold, green)

  return await pdf.save()
}

// ─── Ligne audit discrete sur la page 1 du rapport ────────────────────

async function addAuditHeaderToReport(
  pdfBuffer: Uint8Array,
  opts: { linkId: string; finalizedAt: Date },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()
  if (pages.length === 0) return pdfBuffer

  const page = pages[0]
  const { height } = page.getSize()
  // v2.3.8 Bug 8 — formatDateChDot deterministe (JJ.MM.AAAA)
  const dateStr = formatDateChDot(opts.finalizedAt)
  const refId = opts.linkId.replace(/-/g, '').slice(0, 8)
  // Tous les caracteres ici sont dans WinAnsi (Latin-1)
  const text = `TalentFlow Sign · Rapport valide le ${dateStr} · Ref. ${refId}`
  page.drawText(text, {
    x: 40,
    y: height - 8,
    size: 6.5,
    font: helv,
    color: rgb(0.60, 0.60, 0.65),
  })
  return await pdf.save()
}

// ─── Certificat standalone ─────────────────────────────────────────────

interface CertStandaloneArgs {
  link: ReportLink
  submission: ReportSubmission
  candidat?: { prenom?: string | null; nom?: string | null; email?: string | null } | null
  documentName: string
  documentSha256: string
}

async function buildCertificatePdf(args: CertStandaloneArgs): Promise<Uint8Array> {
  const { link, submission, candidat, documentName, documentSha256 } = args

  // Crée un nouveau PDF standalone (pas d'append sur le rapport)
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const courier = await pdf.embedFont(StandardFonts.Courier)

  // A4 portrait
  const page = pdf.addPage([595, 842])
  const W = 595
  const margin = 50
  let y = 842 - margin

  // Bandeau jaune brand
  page.drawRectangle({
    x: 0, y: y - 12, width: W, height: 6,
    color: rgb(0.918, 0.706, 0.031),
  })
  y -= 24

  // v2.6.3 — Vrai logo L-Agence officiel (PNG transparent texte noir). Fallback texte.
  let logoEmbedded = false
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-agence-officiel-noir.png')
    const logoBytes = fs.readFileSync(logoPath)
    const logoPng = await pdf.embedPng(logoBytes)
    const targetWidth = 200
    const ratio = logoPng.height / logoPng.width
    const targetHeight = targetWidth * ratio
    page.drawImage(logoPng, {
      x: (W - targetWidth) / 2,
      y: y - targetHeight,
      width: targetWidth,
      height: targetHeight,
    })
    y -= targetHeight + 6
    logoEmbedded = true
  } catch {
    // Fallback texte
  }
  if (!logoEmbedded) {
    const logoText = 'L-AGENCE SA'
    const logoSize = 22
    page.drawText(logoText, {
      x: (W - helvBold.widthOfTextAtSize(logoText, logoSize)) / 2,
      y: y - logoSize, size: logoSize, font: helvBold, color: rgb(0.11, 0.10, 0.08),
    })
    y -= logoSize + 6
  }
  const sub = 'TalentFlow Sign · Certificat de rapport hebdomadaire'
  page.drawText(sub, {
    x: (W - helv.widthOfTextAtSize(sub, 9)) / 2,
    y: y - 9, size: 9, font: helv, color: rgb(0.42, 0.45, 0.50),
  })
  y -= 32

  // Titre principal
  const title = 'Certificat de signature'
  page.drawText(title, {
    x: (W - helvBold.widthOfTextAtSize(title, 24)) / 2,
    y, size: 24, font: helvBold, color: rgb(0.11, 0.10, 0.08),
  })
  y -= 30

  // Bloc rapport
  drawLabel(page, 'Rapport', margin, y, helvBold)
  y -= 14
  drawKv(page, 'Titre', link.title, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Document', documentName, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Semaine', `${formatDateChDot(submission.week_start)} au ${formatDateChDot(submission.week_end)}`, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Lien permanent', link.slug, margin, y, helv, helvBold); y -= 26

  // ─── Tableau signataires 6 colonnes ───
  // Largeur totale contenu : 595 - 2*50 = 495pt
  // Colonnes : Role(65) Nom(100) Entreprise(100) Email(100) IP(75) Signe le(55)
  const COL = {
    role:       margin,           // 50
    nom:        margin + 65,      // 115
    entreprise: margin + 165,     // 215
    email:      margin + 265,     // 315
    ip:         margin + 365,     // 415
    date:       margin + 440,     // 490
  }

  drawLabel(page, 'Signataires', margin, y, helvBold)
  y -= 14

  // En-tête tableau
  page.drawRectangle({
    x: margin - 4, y: y - 4, width: W - margin * 2 + 8, height: 18,
    color: rgb(0.96, 0.94, 0.87),
  })
  const headerStyle = { size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) }
  page.drawText('Role',        { x: COL.role,       y, ...headerStyle })
  page.drawText('Nom',         { x: COL.nom,        y, ...headerStyle })
  page.drawText('Entreprise',  { x: COL.entreprise, y, ...headerStyle })
  page.drawText('Email',       { x: COL.email,      y, ...headerStyle })
  page.drawText('IP',          { x: COL.ip,         y, ...headerStyle })
  page.drawText('Signe le',    { x: COL.date,       y, ...headerStyle })
  y -= 18

  // Ligne candidat (Point 5b — Nom = link.candidat_name en priorite)
  const candNameForCert = (link.candidat_name && link.candidat_name.trim())
    || (candidat ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() : '')
    || '-'
  const candEmailForCert = link.candidat_email || candidat?.email || ''

  drawSignerRow6(page, helv, COL, y,
    'Collaborateur',
    candNameForCert,
    '-',
    candEmailForCert,
    submission.candidate_signed_ip || '-',
    submission.candidate_signed_at ? formatDateTime(new Date(submission.candidate_signed_at)) : '-',
  )
  y -= 16

  // Ligne client
  const clientNomForCert = (link.client_contact_name && link.client_contact_name.trim())
    || (link.client_name && link.client_name.trim())
    || ''

  drawSignerRow6(page, helv, COL, y,
    'Client',
    clientNomForCert,
    link.client_name || '',
    link.client_email || '',
    submission.client_signed_ip || '-',
    submission.client_signed_at ? formatDateTime(new Date(submission.client_signed_at)) : '-',
  )
  y -= 26

  // Hash SHA-256
  drawLabel(page, 'Empreinte SHA-256 du document source (avant signature electronique)', margin, y, helvBold)
  y -= 14
  page.drawText(documentSha256.slice(0, 32), { x: margin, y, size: 8.5, font: courier, color: rgb(0.20, 0.20, 0.22) })
  y -= 12
  page.drawText(documentSha256.slice(32), { x: margin, y, size: 8.5, font: courier, color: rgb(0.20, 0.20, 0.22) })
  y -= 30

  // Note : donnees ajustees par le client avant signature (si applicable)
  if (submission.metadata?.client_modified === true) {
    page.drawRectangle({
      x: margin, y: y - 26, width: W - margin * 2, height: 30,
      color: rgb(1.0, 0.97, 0.88),
      borderColor: rgb(0.92, 0.71, 0.03),
      borderWidth: 0.8,
    })
    page.drawText('Note : certaines donnees ont ete ajustees par le client avant signature.', {
      x: margin + 10, y: y - 16, size: 8.5, font: helv, color: rgb(0.57, 0.25, 0.02),
    })
    y -= 42
  }

  // Footer ZertES
  const footerY = margin
  page.drawRectangle({
    x: margin, y: footerY, width: W - margin * 2, height: 80,
    borderColor: rgb(0.85, 0.85, 0.88), borderWidth: 0.5,
    color: rgb(0.98, 0.97, 0.94),
  })
  let fy = footerY + 80 - 16
  page.drawText('Conformite legale', { x: margin + 12, y: fy, size: 9, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
  fy -= 14
  page.drawText('Signature electronique simple (SES) au sens de la SCSE / ZertES (RS 943.03)', {
    x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30),
  })
  fy -= 11
  page.drawText('et du reglement europeen eIDAS (UE 910/2014).', {
    x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30),
  })
  fy -= 14
  page.drawText(`Emis par L-AGENCE SA via TalentFlow Sign - ${new Date().getFullYear()}.`, {
    x: margin + 12, y: fy, size: 8, font: helv, color: rgb(0.50, 0.50, 0.55),
  })

  return await pdf.save()
}

// ─── Helpers dessin ────────────────────────────────────────────────────

function drawLabel(page: any, text: string, x: number, y: number, font: any) {
  page.drawText(text.toUpperCase(), { x, y, size: 9, font, color: rgb(0.42, 0.45, 0.50) })
}

function drawKv(
  page: any, key: string, value: string, x: number, y: number, fontReg: any, fontBold: any,
) {
  page.drawText(`${key} :`, { x, y, size: 9.5, font: fontBold, color: rgb(0.42, 0.45, 0.50) })
  page.drawText(truncate(value, 80), { x: x + 90, y, size: 9.5, font: fontReg, color: rgb(0.11, 0.10, 0.08) })
}

function drawSignerRow6(
  page: any, font: any,
  col: { role: number; nom: number; entreprise: number; email: number; ip: number; date: number },
  y: number,
  role: string, nom: string, entreprise: string, email: string, ip: string, date: string,
) {
  const style = { size: 8, font, color: rgb(0.20, 0.20, 0.25) }
  page.drawText(truncate(role, 14),        { x: col.role,       y, ...style })
  page.drawText(truncate(nom, 20),         { x: col.nom,        y, ...style })
  page.drawText(truncate(entreprise, 20),  { x: col.entreprise, y, ...style })
  page.drawText(truncate(email, 20),       { x: col.email,      y, ...style })
  page.drawText(truncate(ip, 16),          { x: col.ip,         y, ...style })
  page.drawText(truncate(date, 14),        { x: col.date,       y, ...style })
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '...'
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`
}
