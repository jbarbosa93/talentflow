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
import fs from 'fs'
import path from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampPdf, stampTalentflowEnvelopeId } from './pdf-stamp'
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
  /**
   * v2.9.50 — Vrai si le doc contient au moins un champ signature/initial.
   * Permet au mail récap créateur de ne joindre QUE les vrais documents
   * signés et d'exclure les documents purement informatifs (rapport
   * d'heures, fiche salaires, calendrier…) qui restent malgré tout sur
   * la page enveloppe pour téléchargement.
   */
  hasSignature: boolean
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
  /** Titre/fonction utilisé pour le stamping (auto-fill title = candidat.pipeline_metier) */
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
  let candidateTelephone = ''
  if (envelope.candidate_id) {
    try {
      const { data: cand } = await supabase
        .from('candidats')
        .select('pipeline_metier, telephone')
        .eq('id', envelope.candidate_id)
        .maybeSingle()
      const c = cand as unknown as { pipeline_metier?: string | null; telephone?: string | null } | null
      if (c?.pipeline_metier) candidateTitle = c.pipeline_metier
      if (c?.telephone) candidateTelephone = c.telephone
    } catch { /* silencieux */ }
  }

  // v2.9.50 — Logs de diagnostic pour identifier les mismatchs recipientOrder
  // (cause #1 de signatures non stampées en prod).
  console.log(
    `[pdf-generator] envelope=${envelope.id} docs=${documents.length}`
    + ` recipients=${JSON.stringify(recipients.map(r => ({ email: r.email, order: r.order, role: r.role })))}`,
  )

  // v2.9.55 — Pattern #71 : mapping envelope.recipient.order → template.recipientOrder
  // par INDEX des orders distincts. Le Nème destinataire (trié par order) ↔ le Nème
  // order distinct du template. Cohérent avec verify-token, SignWizard, send/route.
  //
  // Bug observé : envelope.recipients en 0-based (order 0, 1) mais template
  // 1-based (recipientOrder 1, 2). Sans mapping, le filter `f.recipientOrder
  // === rec.order` ratait tous les fields → PDF final VIDE.
  const tplOrdersSet = new Set<number>()
  for (const d of documents) {
    for (const f of (d.fields || [])) {
      if (typeof f.recipientOrder === 'number') tplOrdersSet.add(f.recipientOrder)
    }
  }
  const tplOrdersSorted = Array.from(tplOrdersSet).sort((a, b) => a - b)
  const sortedRecipientOrders = Array.from(new Set(
    recipients.filter(r => r.role !== 'cc').map(r => typeof r.order === 'number' ? r.order : 0),
  )).sort((a, b) => a - b)
  const envOrderToTplOrder = new Map<number, number>()
  for (let i = 0; i < sortedRecipientOrders.length; i++) {
    const envOrd = sortedRecipientOrders[i]
    const tplOrd = tplOrdersSorted[i] ?? envOrd
    envOrderToTplOrder.set(envOrd, tplOrd)
  }
  console.log(
    `[pdf-generator] pattern #71 mapping envOrders=${JSON.stringify(sortedRecipientOrders)}`
    + ` → tplOrders=${JSON.stringify(tplOrdersSorted)}`
    + ` map=${JSON.stringify(Array.from(envOrderToTplOrder.entries()))}`,
  )

  // 4. Stamp + upload chaque doc
  // v2.9.49 — On collecte au passage les documents qui contiennent au moins une
  // signature (signature/initial) → ils alimenteront LE certificat global (1 seul
  // pour toute l'enveloppe). Les documents purement informatifs (rapport d'heures,
  // calendrier) sans champ signature sont exclus du certificat.
  const signedDocsForCert: Array<{ name: string; sha256: string }> = []
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

      // v2.7.6 — Couvre le header "Docusign Envelope ID: ..." des PDFs importés DocuSign
      // et stamp notre Envelope ID. Appliqué AVANT les passes de signature pour que le
      // PDF final ne contienne plus de référence DocuSign.
      let currentBuf: Uint8Array = await stampTalentflowEnvelopeId(sourceBuf, envelope.id)
      // v2.9.24 — Ordre minimum des destinataires : sert de fallback pour les
      // champs SANS recipientOrder explicite. Avant : fallback figé à `1` →
      // si le 1er destinataire est en 0-based (order:0), ses champs sans
      // recipientOrder n'étaient JAMAIS stampés (1 !== 0).
      const recipientOrders = recipients.map((r, i) =>
        (typeof r.order === 'number' ? r.order : (i + 1)))
      const minRecipientOrder = recipientOrders.length > 0 ? Math.min(...recipientOrders) : 1
      // v2.9.50 — Diagnostic : distribution des recipientOrder dans les fields
      // du doc (avant filter par destinataire). Permet d'identifier en un
      // coup d'œil un mismatch entre fields du template et destinataires.
      const fieldOrderDistribution: Record<string, number> = {}
      for (const f of (doc.fields || [])) {
        const key = String(f.recipientOrder ?? 'undefined')
        fieldOrderDistribution[key] = (fieldOrderDistribution[key] || 0) + 1
      }
      const sigFieldCount = (doc.fields || []).filter(f => f.type === 'signature' || f.type === 'initial').length
      console.log(
        `[pdf-generator] doc="${doc.name}" fields=${(doc.fields || []).length}`
        + ` signatures=${sigFieldCount} order_distribution=${JSON.stringify(fieldOrderDistribution)}`
        + ` minRecipientOrder=${minRecipientOrder}`,
      )

      for (let recIdx = 0; recIdx < recipients.length; recIdx++) {
        const rec = recipients[recIdx]
        const envOrder = typeof rec.order === 'number' ? rec.order : (recIdx + 1)
        // v2.9.55 — Pattern #71 : on cherche les fields par leur recipientOrder
        // template, pas par l'envOrder brut. Mapping envOrder → tplOrder déjà
        // calculé plus haut. Fallback : envOrder (cas template sans recipientOrder).
        const recipientOrder = envOrderToTplOrder.get(envOrder) ?? envOrder
        const tok = allTokens.find(t =>
          t.recipient_email.toLowerCase().trim() === rec.email.toLowerCase().trim(),
        )
        if (!tok) {
          console.warn(`[pdf-generator] doc="${doc.name}" recipient=${rec.email} envOrder=${envOrder} → tplOrder=${recipientOrder} — TOKEN MANQUANT, skip stamp`)
          continue
        }
        // v2.9.24 — Fallback = ordre minimum (les champs sans recipientOrder
        // appartiennent au 1er destinataire, qu'il soit 0-based ou 1-based).
        // v2.9.55 — minRecipientOrder désormais aligné sur tpl (= tplOrdersSorted[0]).
        const tplMinOrder = tplOrdersSorted[0] ?? minRecipientOrder
        const recFields = (doc.fields || []).filter(f =>
          (f.recipientOrder ?? tplMinOrder) === recipientOrder)
        const recSigCount = recFields.filter(f => f.type === 'signature' || f.type === 'initial').length
        console.log(
          `[pdf-generator] doc="${doc.name}" recipient=${rec.email} envOrder=${envOrder} → tplOrder=${recipientOrder}`
          + ` matched_fields=${recFields.length} signatures=${recSigCount}`
          + ` has_signature_data=${!!tok.signature_data_url}`
          + ` field_values_count=${Object.keys(tok.field_values || {}).length}`,
        )
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
            telephone: candidateTelephone,
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

      // v2.8.5 — Le certificat est désormais un PDF SÉPARÉ.
      // v2.9.49 — UN SEUL certificat GLOBAL pour TOUTE l'enveloppe est généré
      // après cette boucle (plus 1 cert par doc). On retient juste les docs qui
      // ont au moins une signature/initial — les autres (rapport d'heures,
      // calendrier informatif…) ne figurent pas au certificat.

      // 5. Upload du CONTRAT signé (sans page certificat)
      const blobOut = new Blob([currentBuf as BlobPart], { type: 'application/pdf' })
      const signedPath = await uploadSignDocument('signed', envelope.id, blobOut, doc.name)
      const pdfBase64 = Buffer.from(currentBuf).toString('base64')

      // 6. Si le doc contient au moins une signature/initial → entrée au certificat global
      //    + flag hasSignature pour filtrer les PJ du mail récap créateur.
      const docHasSignature = (doc.fields || []).some(f => f.type === 'signature' || f.type === 'initial')

      generatedDocs.push({
        name: doc.name,
        path: signedPath,
        sha256,
        pdfBase64,
        hasSignature: docHasSignature,
      })

      if (docHasSignature) {
        signedDocsForCert.push({ name: doc.name, sha256 })
      } else {
        console.log(`[pdf-generator] doc="${doc.name}" exclu du certificat (0 champ signature/initial)`)
      }
    } catch (e) {
      console.error('[pdf-generator] stamp failed for', doc.name, e)
    }
  }

  // v2.9.49 — 6bis. UN seul certificat global pour l'enveloppe, listant tous les
  // documents signés (zéro si aucune signature dans l'enveloppe).
  console.log(
    `[pdf-generator] cert décision : ${signedDocsForCert.length} doc(s) avec signature`
    + ` — ${signedDocsForCert.length > 0 ? 'génération du cert global' : 'PAS de cert (aucune signature détectée)'}`,
  )
  if (signedDocsForCert.length > 0) {
    let certBuf: Uint8Array | null = null
    // v2.9.60 — Essai 1 : version riche (avec logo PNG L-Agence).
    try {
      certBuf = await generateCertificatePdf({
        envelope,
        recipients,
        tokens: allTokens,
        signedDocuments: signedDocsForCert,
        senderCompanyName,
        signedAt,
      })
    } catch (certErr) {
      const errMsg = certErr instanceof Error ? certErr.message : String(certErr)
      const errStack = certErr instanceof Error ? certErr.stack : ''
      console.error(`[pdf-generator] cert FAILED (v1 avec logo) : ${errMsg}`, errStack)
      // v2.9.60 — Essai 2 : fallback minimal SANS logo PNG (cause #1 probable
      // côté serverless : fs.readFileSync du logo plante). Si même ce fallback
      // plante, on a vraiment un bug pdf-lib.
      try {
        certBuf = await generateCertificatePdf({
          envelope,
          recipients,
          tokens: allTokens,
          signedDocuments: signedDocsForCert,
          senderCompanyName,
          signedAt,
          skipLogo: true,
        })
        console.warn('[pdf-generator] cert généré via fallback (sans logo)')
      } catch (fallbackErr) {
        const errMsg2 = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        console.error(`[pdf-generator] cert FAILED même en fallback : ${errMsg2}`)
      }
    }
    if (certBuf) {
      try {
        const certName = 'Certificat de signature.pdf'
        const certBlob = new Blob([certBuf as BlobPart], { type: 'application/pdf' })
        const certPath = await uploadSignDocument('signed', envelope.id, certBlob, certName)
        const certBase64 = Buffer.from(certBuf).toString('base64')
        generatedDocs.push({
          name: certName,
          path: certPath,
          sha256: signedDocsForCert[0].sha256,
          pdfBase64: certBase64,
          // Le cert lui-même n'est pas un « document signé » au sens juridique
          // (c'est la preuve de signature) → exclu des PJ filtrées du créateur.
          hasSignature: false,
        })
        console.log(`[pdf-generator] cert OK path=${certPath} size=${certBuf.byteLength}B`)
      } catch (uploadErr) {
        console.error('[pdf-generator] cert upload FAILED', uploadErr)
      }
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
  // v2.9.49 — UN certificat liste TOUS les documents signés de l'enveloppe
  // (avec leur empreinte SHA-256), plus un cert par doc.
  signedDocuments: Array<{ name: string; sha256: string }>
  senderCompanyName: string
  signedAt: Date
  // v2.9.60 — Skip l'embedPng du logo (fallback si fs.readFileSync plante côté serverless)
  skipLogo?: boolean
}

/**
 * v2.8.5 — Génère un PDF certificat STANDALONE (1 seule page A4 portrait).
 *
 * Crée un PDF vide via PDFDocument.create(), puis réutilise
 * appendCertificatePage qui ajoute une page sur le PDF existant.
 * Résultat : PDF avec 1 page (= la page certificat).
 *
 * Permet de séparer le certificat du contrat signé pour distribution
 * indépendante (créateur reçoit cert, autres reçoivent uniquement contrat).
 */
export async function generateCertificatePdf(
  args: Omit<CertificateArgs, 'pdfBuffer'>,
): Promise<Uint8Array> {
  const blankPdf = await PDFDocument.create()
  const blankBuf = await blankPdf.save()
  const result = await appendCertificatePage({ ...args, pdfBuffer: blankBuf })
  // v2.8.5 — PDFDocument.create() + save crée une page blanche implicite côté
  // viewers (Aperçu macOS, etc.). On retire toutes les pages sauf la dernière
  // (= la vraie page certificat ajoutée par appendCertificatePage).
  const finalPdf = await PDFDocument.load(result, { ignoreEncryption: true })
  const pageCount = finalPdf.getPageCount()
  if (pageCount > 1) {
    for (let i = pageCount - 2; i >= 0; i--) {
      finalPdf.removePage(i)
    }
  }
  return new Uint8Array(await finalPdf.save())
}

async function appendCertificatePage(args: CertificateArgs): Promise<Uint8Array> {
  const {
    pdfBuffer, envelope, recipients, tokens,
    signedDocuments, senderCompanyName, signedAt,
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
  y -= 24

  // v2.6.3 — Vrai logo L-Agence officiel (PNG transparent texte noir).
  // Fallback texte si le fichier est absent (lecture FS).
  // v2.9.60 — skipLogo=true (fallback) → skip direct, fallback texte.
  let logoEmbedded = false
  if (!args.skipLogo) try {
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
    // Fallback texte si le PNG est absent (build sans public/ ou bug FS)
  }
  if (!logoEmbedded) {
    const logoText = safePdfText(senderCompanyName).toUpperCase()
    const logoSize = 22
    const logoWidth = helvBold.widthOfTextAtSize(logoText, logoSize)
    page.drawText(logoText, {
      x: (W - logoWidth) / 2,
      y: y - logoSize,
      size: logoSize,
      font: helvBold,
      color: rgb(0.11, 0.10, 0.08),
    })
    y -= logoSize + 6
  }
  const subLogo = 'TalentFlow Sign · Signature électronique'
  const subSize = 9
  const subWidth = helv.widthOfTextAtSize(subLogo, subSize)
  page.drawText(subLogo, {
    x: (W - subWidth) / 2,
    y: y - subSize,
    size: subSize,
    font: helv,
    color: rgb(0.42, 0.45, 0.50),
  })
  y -= 32

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
  // v2.9.49 — Liste compacte des documents signés (au lieu d'un seul nom).
  drawKeyValue(
    page,
    `Documents (${signedDocuments.length})`,
    signedDocuments.map(d => d.name.replace(/\.pdf$/i, '')).join(' · '),
    margin, y, helv, helvBold,
  )
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

  // ─── Empreintes SHA-256 par document ───
  // v2.9.49 — Une ligne par document signé (nom + hash tronqué).
  drawSectionLabel(page, `Empreintes SHA-256 des documents (${signedDocuments.length})`, margin, y, helvBold)
  y -= 14
  const courier = await pdf.embedFont(StandardFonts.Courier)
  for (const d of signedDocuments) {
    if (y < 250) break  // garde-fou : ne pas déborder sur le footer
    const cleanName = d.name.replace(/\.pdf$/i, '')
    page.drawText(truncate(cleanName, 60), {
      x: margin, y, size: 8.5, font: helvBold, color: rgb(0.11, 0.10, 0.08),
    })
    y -= 10
    page.drawText(d.sha256, {
      x: margin, y, size: 7.5, font: courier, color: rgb(0.30, 0.30, 0.35),
    })
    y -= 14
  }
  y -= 4
  page.drawText(
    'Ces empreintes cryptographiques identifient de manière unique chaque document signé.',
    { x: margin, y, size: 8, font: helvOblique, color: rgb(0.50, 0.50, 0.55) },
  )
  y -= 24

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
    safePdfText(`Émis par ${senderCompanyName} via TalentFlow Sign - ${new Date().getFullYear()}.`),
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

/**
 * v2.9.61 — Normalise une chaîne pour qu'elle soit encodable par pdf-lib
 * StandardFonts (WinAnsi/Helvetica). Sans ce fix, un nom de doc en UTF-8
 * NFD (« Sécurité » = e + U+0301 décomposé) plante l'encodage WinAnsi
 * qui ne supporte que les caractères précomposés.
 *
 * Étapes :
 *  1. NFC : recompose les caractères combinants (é, à, ç, etc.)
 *  2. Strip des caractères restants non-WinAnsi (emojis, U+2019 guillemet
 *     typographique smart quote, etc.) → remplacés par leur équivalent ASCII
 *     basique ou un point d'interrogation.
 */
function safePdfText(s: string): string {
  if (!s) return ''
  return s
    .normalize('NFC')
    // Smart quotes / dashes courants en typographie française moderne
    .replace(/[‘’‚‛]/g, "'")  // ' ' ‚ ‛ → '
    .replace(/[“”„‟]/g, '"')  // " " „ ‟ → "
    .replace(/[–—]/g, '-')              // – — → -
    .replace(/…/g, '...')                    // … → ...
    .replace(/ /g, ' ')                      // espace insécable → espace
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  // v2.9.61 — Normalise AVANT troncature pour éviter WinAnsi cannot encode
  const safe = safePdfText(s)
  if (safe.length <= n) return safe
  return safe.slice(0, n - 1) + '...'
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} à ${hh}:${mi}`
}
