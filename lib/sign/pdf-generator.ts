// TalentFlow Sign — Génération PDF signé final (Phase 4b)
// v2.2.5
//
// Extrait de app/api/sign/finalize/route.ts pour réutilisation.
// Pipeline :
//   1. Récupère envelope + template + tous les tokens
//   2. Pour chaque doc : download PDF source → calcule SHA-256 →
//      stamp multi-pass par recipient (signature + valeurs) →
//      ajoute page certificat → upload vers signed/{envelopeId}/
//   3. UPDATE sign_envelopes.signed_pdf_paths = [{name, path, sha256}]
//   4. Retourne la liste des PDFs stampés (en mémoire) pour email
//
// Pas de dépendance circulaire avec finalize/route.ts : tout est self-contained.

import { createHash } from 'crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampPdf } from './pdf-stamp'
import { uploadSignDocument, SIGN_BUCKET } from './storage'
import type {
  SignEnvelope, SignRecipient, SignTemplate, SignDocument,
} from './types'

export interface SignedPdfPath {
  /** Nom original du document (ex: "Rapport heures.pdf") */
  name: string
  /** Path complet dans le bucket talentflow-sign (ex: "signed/{uuid}/{ts}_Rapport_heures.pdf") */
  path: string
  /** SHA-256 (hex) du PDF SOURCE pré-stamp — preuve d'intégrité ZertES */
  sha256: string
}

export interface GeneratedSignedDoc extends SignedPdfPath {
  /** Buffer base64 du PDF stampé (pour attacher en email sans re-download) */
  pdfBase64: string
}

export interface GenerateSignedPdfsArgs {
  envelope: SignEnvelope
  /** Recipients à jour (post-update finalize : statuts 'signed' propagés) */
  recipients: SignRecipient[]
  signedAt: Date
  signedIp: string | null
}

export interface GenerateSignedPdfsResult {
  /** PDFs générés avec succès (uploadés + persistés en DB) */
  docs: GeneratedSignedDoc[]
  /** Société expéditrice utilisée pour le stamping (auto-fill company) */
  senderCompanyName: string
  /** Titre/fonction utilisé pour le stamping (auto-fill title = candidat.metier_recherche) */
  candidateTitle: string
}

/**
 * Génère les PDFs signés finaux pour une enveloppe completed :
 *   stamp tous les fields (signature + valeurs + page certificat) →
 *   upload dans Storage → persiste les paths sur sign_envelopes.signed_pdf_paths.
 *
 * Best-effort : si un doc échoue, les autres continuent. Loggue les erreurs.
 * Retourne aussi les buffers base64 pour permettre à finalize d'attacher
 * directement les PDFs à l'email completed sans re-download.
 */
export async function generateAndPersistSignedPdfs(
  args: GenerateSignedPdfsArgs,
): Promise<GenerateSignedPdfsResult> {
  const { envelope, recipients, signedAt, signedIp } = args
  const supabase = createAdminClient()

  if (!envelope.template_id) {
    console.warn('[pdf-generator] envelope sans template_id, génération impossible')
    return { docs: [], senderCompanyName: '', candidateTitle: '' }
  }

  // 1. Template documents
  const { data: tpl } = await supabase
    .from('sign_templates' as any)
    .select('documents')
    .eq('id', envelope.template_id)
    .maybeSingle()
  const template = tpl as unknown as Pick<SignTemplate, 'documents'> | null
  const documents = (template?.documents || []) as SignDocument[]
  if (documents.length === 0) {
    return { docs: [], senderCompanyName: '', candidateTitle: '' }
  }

  // 2. Tokens (signatures + field_values de chaque signer)
  const { data: tokens } = await supabase
    .from('sign_tokens' as any)
    .select('id, recipient_email, recipient_name, signature_data_url, signature_method, field_values, signed_at, signed_ip')
    .eq('envelope_id', envelope.id)
  const allTokens = (tokens || []) as unknown as Array<{
    id: string
    recipient_email: string
    recipient_name: string
    signature_data_url: string | null
    signature_method: 'drawn' | 'typed' | 'auto' | null
    field_values: Record<string, unknown> | null
    signed_at: string | null
    signed_ip: string | null
  }>

  // 3. Auto-fill company + title
  let senderCompanyName = ''
  let candidateTitle = ''
  try {
    const ctx = (envelope as unknown as { context_data?: Record<string, unknown> | null }).context_data || null
    if (ctx && typeof ctx.companyName === 'string' && ctx.companyName.trim()) {
      senderCompanyName = ctx.companyName.trim()
    } else if (envelope.created_by) {
      const { data: { user: senderUser } } = await supabase.auth.admin.getUserById(envelope.created_by)
      const meta = (senderUser?.user_metadata as { entreprise?: string } | null) || null
      if (meta?.entreprise && meta.entreprise.trim()) senderCompanyName = meta.entreprise.trim()
    }
    if (!senderCompanyName) senderCompanyName = 'L-Agence SA'
  } catch { /* silencieux */ }
  if (envelope.candidate_id) {
    try {
      const { data: cand } = await supabase
        .from('candidats')
        .select('metier_recherche')
        .eq('id', envelope.candidate_id)
        .maybeSingle()
      const c = cand as unknown as { metier_recherche?: string | null } | null
      if (c?.metier_recherche) candidateTitle = c.metier_recherche
    } catch { /* silencieux */ }
  }

  // 4. Stamp + upload chaque doc
  const generatedDocs: GeneratedSignedDoc[] = []
  for (const doc of documents) {
    if (!doc.storage_path) continue
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(SIGN_BUCKET)
        .download(doc.storage_path)
      if (dlErr || !blob) {
        console.warn('[pdf-generator] download failed', doc.name, dlErr?.message)
        continue
      }
      const sourceBuf = new Uint8Array(await blob.arrayBuffer())

      // Hash SHA-256 du PDF SOURCE pré-stamp (preuve ZertES "tu as signé CE document")
      const sha256 = createHash('sha256').update(sourceBuf).digest('hex')

      // Multi-pass stamp : 1 passe par recipient avec ses fields
      let currentBuf: Uint8Array = sourceBuf
      for (let recIdx = 0; recIdx < recipients.length; recIdx++) {
        const rec = recipients[recIdx]
        const recipientOrder = recIdx + 1
        const tok = allTokens.find(t =>
          t.recipient_email.toLowerCase().trim() === rec.email.toLowerCase().trim(),
        )
        if (!tok) continue
        const recFields = (doc.fields || []).filter(f => f.recipientOrder === recipientOrder)
        if (recFields.length === 0) continue

        const nameParts = (rec.name || '').trim().split(/\s+/)
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        const today = signedAt.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

        currentBuf = await stampPdf({
          pdfBuffer: currentBuf,
          fields: recFields,
          fieldValues: tok.field_values || {},
          signatureDataUrl: tok.signature_data_url,
          autoFill: {
            firstName, lastName, fullName: rec.name, email: rec.email, today,
            companyName: senderCompanyName, title: candidateTitle,
          },
          envelopeId: envelope.id,
          recipientName: rec.name,
          recipientEmail: rec.email,
          signedAt,
          signedIp,
          // Footer 30pt uniquement au DERNIER passage (sinon empilé N fois)
          addAuditFooter: recIdx === recipients.length - 1,
        })
      }

      // 5. Page certificat (en plus du footer 30pt — coexistence demandée)
      currentBuf = await appendCertificatePage({
        pdfBuffer: currentBuf,
        envelope,
        recipients,
        tokens: allTokens,
        documentName: doc.name,
        documentSha256: sha256,
        senderCompanyName,
        signedAt,
      })

      // 6. Upload final
      const blobOut = new Blob([currentBuf as BlobPart], { type: 'application/pdf' })
      const signedPath = await uploadSignDocument('signed', envelope.id, blobOut, doc.name)
      const pdfBase64 = Buffer.from(currentBuf).toString('base64')
      generatedDocs.push({
        name: doc.name,
        path: signedPath,
        sha256,
        pdfBase64,
      })
    } catch (e) {
      console.error('[pdf-generator] stamp failed for', doc.name, e)
    }
  }

  // 7. Persiste les paths sur l'enveloppe (sans pdfBase64 → DB clean)
  if (generatedDocs.length > 0) {
    const persistable: SignedPdfPath[] = generatedDocs.map(d => ({
      name: d.name,
      path: d.path,
      sha256: d.sha256,
    }))
    const { error: upErr } = await supabase
      .from('sign_envelopes' as any)
      .update({ signed_pdf_paths: persistable })
      .eq('id', envelope.id)
    if (upErr) {
      console.error('[pdf-generator] persist signed_pdf_paths error', upErr)
    }
  }

  return {
    docs: generatedDocs,
    senderCompanyName,
    candidateTitle,
  }
}

// ─── Page certificat de signature ────────────────────────────────────────
//
// Page A4 portrait ajoutée à la fin du PDF stampé :
//   - Titre "Certificat de signature"
//   - Bandeau L-Agence (texte stylisé Georgia, jaune brand)
//   - Tableau signataires : Nom · Email · IP · Date · Méthode
//   - Hash SHA-256 du document source
//   - Mention ZertES RS 943.03

interface CertificateArgs {
  pdfBuffer: Uint8Array
  envelope: SignEnvelope
  recipients: SignRecipient[]
  tokens: Array<{
    recipient_email: string
    recipient_name: string
    signature_method: 'drawn' | 'typed' | 'auto' | null
    signed_at: string | null
    signed_ip: string | null
  }>
  documentName: string
  documentSha256: string
  senderCompanyName: string
  signedAt: Date
}

async function appendCertificatePage(args: CertificateArgs): Promise<Uint8Array> {
  const {
    pdfBuffer, envelope, recipients, tokens,
    documentName, documentSha256, senderCompanyName, signedAt,
  } = args

  const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvOblique = await pdf.embedFont(StandardFonts.HelveticaOblique)

  // A4 portrait : 595 × 842 pts
  const page = pdf.addPage([595, 842])
  const W = 595
  const margin = 40
  let y = 842 - margin

  // ─── Bandeau brand L-Agence ───
  page.drawRectangle({
    x: 0, y: y - 12, width: W, height: 6,
    color: rgb(0.918, 0.706, 0.031),  // #EAB308
  })
  y -= 32

  // Logo texte L-AGENCE (style cohérent avec email completed)
  const logoText = senderCompanyName.toUpperCase()
  const logoSize = 22
  const logoWidth = helvBold.widthOfTextAtSize(logoText, logoSize)
  page.drawText(logoText, {
    x: (W - logoWidth) / 2,
    y,
    size: logoSize,
    font: helvBold,
    color: rgb(0.11, 0.10, 0.08),  // #1C1A14
  })
  y -= 16
  const subLogo = 'TalentFlow Sign · Signature électronique'
  const subSize = 9
  const subWidth = helv.widthOfTextAtSize(subLogo, subSize)
  page.drawText(subLogo, {
    x: (W - subWidth) / 2,
    y,
    size: subSize,
    font: helv,
    color: rgb(0.42, 0.45, 0.50),
  })
  y -= 38

  // ─── Titre principal ───
  const title = 'Certificat de signature'
  const titleSize = 24
  const titleWidth = helvBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (W - titleWidth) / 2,
    y,
    size: titleSize,
    font: helvBold,
    color: rgb(0.11, 0.10, 0.08),
  })
  y -= 18
  // Sous-titre date
  const completedStr = `Document complété le ${formatDateTime(signedAt)}`
  const completedSize = 10.5
  const completedWidth = helv.widthOfTextAtSize(completedStr, completedSize)
  page.drawText(completedStr, {
    x: (W - completedWidth) / 2,
    y,
    size: completedSize,
    font: helvOblique,
    color: rgb(0.42, 0.45, 0.50),
  })
  y -= 36

  // ─── Bloc enveloppe ───
  drawSectionLabel(page, 'Enveloppe', margin, y, helvBold)
  y -= 16
  drawKeyValue(page, 'Titre', envelope.title, margin, y, helv, helvBold)
  y -= 14
  drawKeyValue(page, 'Document', documentName, margin, y, helv, helvBold)
  y -= 14
  drawKeyValue(page, 'Envelope ID', envelope.id, margin, y, helv, helvBold)
  y -= 28

  // ─── Tableau signataires ───
  drawSectionLabel(page, `Signataires (${recipients.filter(r => r.role !== 'cc').length})`, margin, y, helvBold)
  y -= 16

  // Header de tableau
  const colNom = margin
  const colEmail = margin + 130
  const colIp = margin + 280
  const colDate = margin + 360
  const colMethod = margin + 470
  page.drawRectangle({
    x: margin - 4, y: y - 4, width: W - margin * 2 + 8, height: 18,
    color: rgb(0.96, 0.94, 0.87),
  })
  page.drawText('Nom', { x: colNom, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Email', { x: colEmail, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('IP', { x: colIp, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Signé le', { x: colDate, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('Méthode', { x: colMethod, y, size: 8.5, font: helvBold, color: rgb(0.25, 0.25, 0.25) })
  y -= 18

  for (const rec of recipients) {
    const tok = tokens.find(t =>
      t.recipient_email.toLowerCase().trim() === rec.email.toLowerCase().trim(),
    )
    const isCC = rec.role === 'cc'
    const signedDate = tok?.signed_at
      ? formatDateTime(new Date(tok.signed_at))
      : (isCC ? 'Copie (pas de signature requise)' : '-')
    const method = isCC ? '-' : (tok?.signature_method || '-')
    const methodLabel = method === 'drawn' ? 'Tracée'
      : method === 'typed' ? 'Saisie'
      : method === 'auto' ? 'Auto'
      : method

    page.drawText(truncate(rec.name, 22), { x: colNom, y, size: 8.5, font: helv, color: rgb(0.11, 0.10, 0.08) })
    page.drawText(truncate(rec.email, 26), { x: colEmail, y, size: 8.5, font: helv, color: rgb(0.30, 0.30, 0.35) })
    page.drawText(tok?.signed_ip || '-', { x: colIp, y, size: 8.5, font: helv, color: rgb(0.30, 0.30, 0.35) })
    page.drawText(truncate(signedDate, 22), { x: colDate, y, size: 8.5, font: helv, color: rgb(0.30, 0.30, 0.35) })
    page.drawText(methodLabel, { x: colMethod, y, size: 8.5, font: helv, color: rgb(0.30, 0.30, 0.35) })
    y -= 14

    // Garde-fou : ne pas déborder en bas
    if (y < 220) break
  }

  y -= 18

  // ─── Hash SHA-256 ───
  drawSectionLabel(page, 'Empreinte du document source (SHA-256)', margin, y, helvBold)
  y -= 14
  // Hash : 64 chars hex → split en 2 lignes pour lisibilité
  const sha1 = documentSha256.slice(0, 32)
  const sha2 = documentSha256.slice(32)
  page.drawText(sha1, {
    x: margin, y, size: 8.5,
    font: await pdf.embedFont(StandardFonts.Courier),
    color: rgb(0.20, 0.20, 0.22),
  })
  y -= 12
  page.drawText(sha2, {
    x: margin, y, size: 8.5,
    font: await pdf.embedFont(StandardFonts.Courier),
    color: rgb(0.20, 0.20, 0.22),
  })
  y -= 18
  page.drawText(
    'Cette empreinte cryptographique identifie de manière unique le document source signé.',
    { x: margin, y, size: 8, font: helvOblique, color: rgb(0.50, 0.50, 0.55) },
  )
  y -= 32

  // ─── Footer légal ZertES ───
  // Cadre en bas de page
  const footerH = 80
  const footerY = margin
  page.drawRectangle({
    x: margin, y: footerY, width: W - margin * 2, height: footerH,
    borderColor: rgb(0.85, 0.85, 0.88),
    borderWidth: 0.5,
    color: rgb(0.98, 0.97, 0.94),
  })

  let fy = footerY + footerH - 16
  page.drawText('Conformité légale', {
    x: margin + 12, y: fy, size: 9, font: helvBold,
    color: rgb(0.11, 0.10, 0.08),
  })
  fy -= 14
  page.drawText(
    'Signature électronique simple (SES) au sens de la Loi fédérale suisse sur la signature',
    { x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30) },
  )
  fy -= 11
  page.drawText(
    'électronique (SCSE / ZertES, RS 943.03) et du règlement européen eIDAS (UE 910/2014).',
    { x: margin + 12, y: fy, size: 8.5, font: helv, color: rgb(0.25, 0.25, 0.30) },
  )
  fy -= 14
  page.drawText(
    `Émis par ${senderCompanyName} via TalentFlow Sign - ${new Date().getFullYear()}.`,
    { x: margin + 12, y: fy, size: 8, font: helvOblique, color: rgb(0.50, 0.50, 0.55) },
  )

  return await pdf.save()
}

// ─── Helpers dessin ──────────────────────────────────────────────────────

function drawSectionLabel(
  page: any, text: string, x: number, y: number, font: any,
) {
  page.drawText(text.toUpperCase(), {
    x, y, size: 9, font,
    color: rgb(0.42, 0.45, 0.50),
  })
}

function drawKeyValue(
  page: any, key: string, value: string, x: number, y: number,
  fontReg: any, fontBold: any,
) {
  page.drawText(`${key} :`, {
    x, y, size: 9.5, font: fontBold,
    color: rgb(0.42, 0.45, 0.50),
  })
  page.drawText(truncate(value, 80), {
    x: x + 75, y, size: 9.5, font: fontReg,
    color: rgb(0.11, 0.10, 0.08),
  })
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '...'
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} à ${hh}:${mi}`
}
