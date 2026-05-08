// TalentFlow Rapports — Génération du PDF final stampé (Phase 5)
// v2.2.6
//
// Pattern aligné sur lib/sign/pdf-generator.ts :
//   1. Download PDF source du template depuis Storage
//   2. Hash SHA-256 du PDF source (preuve ZertES)
//   3. Multi-pass stampPdf : 1 pass avec les fields candidat (recipientOrder=1)
//      puis 1 pass avec les fields client (recipientOrder=2)
//   4. Page certificat (signataires + IP + hash)
//   5. Upload signed/{linkId}/{submissionId}/...
//   6. UPDATE report_submissions.signed_pdf_paths

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampPdf } from '@/lib/sign/pdf-stamp'
import { uploadSignDocument, SIGN_BUCKET } from '@/lib/sign/storage'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { SignDocument, SignTemplate } from '@/lib/sign/types'
import type { ReportLink, ReportSubmission } from './types'
import { getWeekDates } from './week-helpers'

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
 * Génère le PDF final stampé pour une submission completed.
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
  const fullNameCandidate = candidat
    ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim()
    : ''
  const candFirstName = candidat?.prenom || (fullNameCandidate.split(/\s+/)[0] || '')
  const candLastName = candidat?.nom || fullNameCandidate.split(/\s+/).slice(1).join(' ') || ''
  const candEmail = candidat?.email || ''

  const clientFullName = link.client_name || ''
  const clientParts = clientFullName.trim().split(/\s+/)
  const clientFirstName = clientParts[0] || ''
  const clientLastName = clientParts.slice(1).join(' ') || ''

  // Date du jour de finalisation (utilisée comme date de signature)
  const finalizedAt = submission.client_signed_at
    ? new Date(submission.client_signed_at)
    : new Date()
  const todayStr = finalizedAt.toLocaleDateString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

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

      let currentBuf: Uint8Array = sourceBuf

      // ─── Pass 1 : fields recipientOrder=1 (Candidat) ───
      const candFields = (doc.fields || []).filter(f => (f.recipientOrder ?? 1) === 1)
      if (candFields.length > 0) {
        currentBuf = await stampPdf({
          pdfBuffer: currentBuf,
          fields: candFields,
          fieldValues: submission.field_values || {},
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
          addAuditFooter: false,  // footer ajouté en pass 2 (final)
        })
        console.log('[report/pdf-generator] Pass 1 (cand) done:', currentBuf.length + 'B')
      }

      // ─── Pass 2 : fields recipientOrder=2 (Client) + footer audit ───
      const clientFields = (doc.fields || []).filter(f => (f.recipientOrder ?? 1) === 2)
      currentBuf = await stampPdf({
        pdfBuffer: currentBuf,
        fields: clientFields,
        fieldValues: submission.field_values || {},
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
        addAuditFooter: true,
      })
      console.log('[report/pdf-generator] Pass 2 (client) done:', currentBuf.length + 'B')

      // 3. Page certificat
      currentBuf = await appendCertificatePage({
        pdfBuffer: currentBuf,
        link,
        submission,
        candidat,
        documentName: doc.name,
        documentSha256: sha256,
      })
      console.log('[report/pdf-generator] Certificate done:', currentBuf.length + 'B')

      // 4. Upload
      const blobOut = new Blob([currentBuf as BlobPart], { type: 'application/pdf' })
      const safeName = buildSignedFilename(link, submission, doc.name)
      const path = await uploadSignDocument(
        'signed',
        // ownerId = "reports/{linkId}/{submissionId}" pour clarté du chemin Storage
        `reports/${link.id}/${submission.id}`,
        blobOut,
        safeName,
      )
      const pdfBase64 = Buffer.from(currentBuf).toString('base64')
      generated.push({ name: safeName, path, sha256, pdfBase64 })
      console.log('[report/pdf-generator] Upload done, path:', path)
    } catch (e) {
      console.error(
        '[report/pdf-generator] stamp FAILED',
        doc.name,
        e instanceof Error ? { message: e.message, stack: e.stack?.split('\n').slice(0, 5).join(' | ') } : String(e),
      )
    }
  }

  // 5. Persist signed_pdf_paths
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

/**
 * Construit un nom de fichier lisible :
 *   "Rapport S18 — Pedro Ferreira — 04 au 11 mai 2026.pdf"
 */
function buildSignedFilename(
  link: ReportLink,
  submission: ReportSubmission,
  fallbackName: string,
): string {
  try {
    const week = getWeekDates(submission.week_start)
    const slug = (link.title || fallbackName).replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 40)
    return `Rapport S${week.weekNumber} - ${slug} - ${submission.week_start}_${submission.week_end}.pdf`
  } catch {
    return fallbackName.endsWith('.pdf') ? fallbackName : `${fallbackName}.pdf`
  }
}

// ─── Page certificat ───────────────────────────────────────────────────

interface CertArgs {
  pdfBuffer: Uint8Array
  link: ReportLink
  submission: ReportSubmission
  candidat?: { prenom?: string | null; nom?: string | null; email?: string | null } | null
  documentName: string
  documentSha256: string
}

async function appendCertificatePage(args: CertArgs): Promise<Uint8Array> {
  const { pdfBuffer, link, submission, candidat, documentName, documentSha256 } = args
  const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const courier = await pdf.embedFont(StandardFonts.Courier)

  // A4 portrait
  const page = pdf.addPage([595, 842])
  const W = 595
  const margin = 40
  let y = 842 - margin

  // Bandeau jaune brand
  page.drawRectangle({
    x: 0, y: y - 12, width: W, height: 6,
    color: rgb(0.918, 0.706, 0.031),
  })
  y -= 32

  // Logo L-AGENCE
  const logoText = 'L-AGENCE'
  const logoSize = 22
  page.drawText(logoText, {
    x: (W - helvBold.widthOfTextAtSize(logoText, logoSize)) / 2,
    y, size: logoSize, font: helvBold, color: rgb(0.11, 0.10, 0.08),
  })
  y -= 16
  const sub = 'TalentFlow Sign · Certificat de rapport hebdomadaire'
  page.drawText(sub, {
    x: (W - helv.widthOfTextAtSize(sub, 9)) / 2,
    y, size: 9, font: helv, color: rgb(0.42, 0.45, 0.50),
  })
  y -= 36

  // Titre principal
  const title = 'Certificat de signature'
  page.drawText(title, {
    x: (W - helvBold.widthOfTextAtSize(title, 24)) / 2,
    y, size: 24, font: helvBold, color: rgb(0.11, 0.10, 0.08),
  })
  y -= 30

  // Bloc lien
  drawLabel(page, 'Rapport', margin, y, helvBold)
  y -= 14
  drawKv(page, 'Titre', link.title, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Document', documentName, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Semaine', `${submission.week_start} → ${submission.week_end}`, margin, y, helv, helvBold); y -= 14
  drawKv(page, 'Lien permanent', link.slug, margin, y, helv, helvBold); y -= 26

  // Tableau signataires (2 lignes : candidat + client)
  drawLabel(page, 'Signataires', margin, y, helvBold)
  y -= 14
  page.drawRectangle({
    x: margin - 4, y: y - 4, width: W - margin * 2 + 8, height: 18,
    color: rgb(0.96, 0.94, 0.87),
  })
  page.drawText('Rôle', { x: margin, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Nom', { x: margin + 90, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Email', { x: margin + 240, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('IP', { x: margin + 380, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Signé le', { x: margin + 460, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  y -= 18

  const candName = candidat
    ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() || (candidat.email || '')
    : ''
  const candEmail = candidat?.email || ''
  drawSignerRow(
    page, helv, margin, y,
    'Collaborateur', candName, candEmail,
    submission.candidate_signed_ip || '—',
    submission.candidate_signed_at ? formatDateTime(new Date(submission.candidate_signed_at)) : '—',
  )
  y -= 14
  drawSignerRow(
    page, helv, margin, y,
    'Client', link.client_name || '', link.client_email || '',
    submission.client_signed_ip || '—',
    submission.client_signed_at ? formatDateTime(new Date(submission.client_signed_at)) : '—',
  )
  y -= 26

  // Hash SHA-256
  drawLabel(page, 'Empreinte SHA-256 du document source', margin, y, helvBold)
  y -= 14
  page.drawText(documentSha256.slice(0, 32), { x: margin, y, size: 8.5, font: courier, color: rgb(0.20, 0.20, 0.22) })
  y -= 12
  page.drawText(documentSha256.slice(32), { x: margin, y, size: 8.5, font: courier, color: rgb(0.20, 0.20, 0.22) })
  y -= 30

  // Footer ZertES
  const footerY = margin
  page.drawRectangle({
    x: margin, y: footerY, width: W - margin * 2, height: 80,
    borderColor: rgb(0.85, 0.85, 0.88), borderWidth: 0.5,
    color: rgb(0.98, 0.97, 0.94),
  })
  let fy = footerY + 80 - 16
  page.drawText('Conformité légale', { x: margin + 12, y: fy, size: 9, font: helvBold, color: rgb(0.11, 0.10, 0.08) })
  fy -= 14
  page.drawText('Signature électronique simple (SES) au sens de la SCSE / ZertES (RS 943.03)', {
    x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30),
  })
  fy -= 11
  page.drawText('et du règlement européen eIDAS (UE 910/2014).', {
    x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30),
  })
  fy -= 14
  page.drawText(`Émis par L-Agence SA via TalentFlow Sign — ${new Date().getFullYear()}.`, {
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

function drawSignerRow(
  page: any, font: any, x: number, y: number,
  role: string, name: string, email: string, ip: string, date: string,
) {
  page.drawText(role, { x, y, size: 8.5, font, color: rgb(0.11, 0.10, 0.08) })
  page.drawText(truncate(name, 22), { x: x + 90, y, size: 8.5, font, color: rgb(0.30, 0.30, 0.35) })
  page.drawText(truncate(email, 24), { x: x + 240, y, size: 8.5, font, color: rgb(0.30, 0.30, 0.35) })
  page.drawText(ip, { x: x + 380, y, size: 8.5, font, color: rgb(0.30, 0.30, 0.35) })
  page.drawText(truncate(date, 18), { x: x + 460, y, size: 8.5, font, color: rgb(0.30, 0.30, 0.35) })
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`
}
