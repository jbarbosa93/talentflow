// TalentFlow Sign — Régénérer le certificat de signature d'une envelope existante
// v2.9.60
//
// Utilisé quand le cert n'a pas été généré lors de la finalisation (erreur
// silencieuse pdf-lib). Recalcule le certificat à partir des tokens existants
// et upload + update signed_pdf_paths.
//
// POST /api/sign/envelopes/[id]/regenerate-cert
//
// Sécurité : requireAuth() + l'envelope doit être en status='completed'.
// Pas de changement de signature (juste génération du PDF cert).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { generateCertificatePdf } from '@/lib/sign/pdf-generator'
import { uploadSignDocument } from '@/lib/sign/storage'
import type { SignEnvelope, SignRecipient, SignDocument, SignField } from '@/lib/sign/types'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

interface SignedPdfPath {
  name: string
  path: string
  sha256: string
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  // 1. Récup envelope
  const { data: envRow, error: envErr } = await (supabase as any)
    .from('sign_envelopes')
    .select('id, title, status, template_id, recipients, signed_pdf_paths, completed_at, created_by, context_data, candidate_id')
    .eq('id', id)
    .maybeSingle()
  if (envErr || !envRow) {
    return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })
  }
  const envelope = envRow as unknown as SignEnvelope & {
    signed_pdf_paths: SignedPdfPath[] | null
    completed_at: string | null
  }
  if (envelope.status !== 'completed') {
    return NextResponse.json({ error: 'Envelope non finalisée' }, { status: 400 })
  }
  if (!envelope.template_id) {
    return NextResponse.json({ error: 'Envelope sans template' }, { status: 400 })
  }

  // 2. Si cert déjà présent → on ne refait pas
  const existingPaths = (envelope.signed_pdf_paths || []) as SignedPdfPath[]
  const hasCert = existingPaths.some(p => p.name.startsWith('Certificat de signature'))
  if (hasCert) {
    return NextResponse.json({ ok: true, alreadyExists: true })
  }

  // 3. Template (pour lister les docs avec signature)
  const { data: tpl } = await (supabase as any)
    .from('sign_templates')
    .select('documents')
    .eq('id', envelope.template_id)
    .maybeSingle()
  const tplDocs = ((tpl as { documents?: SignDocument[] } | null)?.documents || []) as SignDocument[]

  // 4. Tokens (pour signataires + signed_at + IP + méthode)
  const { data: tokRows } = await (supabase as any)
    .from('sign_tokens')
    .select('recipient_email, recipient_name, signature_method, signed_at, signed_ip')
    .eq('envelope_id', id)
  const tokens = (tokRows || []) as Array<{
    recipient_email: string
    recipient_name: string
    signature_method: 'drawn' | 'typed' | 'auto' | null
    signed_at: string | null
    signed_ip: string | null
  }>

  // 5. signedDocuments : un doc pour chaque doc du template qui a un champ
  //    signature/initial + qu'on retrouve dans signed_pdf_paths (= a été stampé).
  const signedDocsForCert: Array<{ name: string; sha256: string }> = []
  for (const d of tplDocs) {
    const hasSignature = (d.fields || []).some((f: SignField) =>
      f.type === 'signature' || f.type === 'initial',
    )
    if (!hasSignature) continue
    // Cherche le SHA-256 dans signed_pdf_paths
    const stamped = existingPaths.find(p => p.name === d.name)
    if (!stamped) continue
    signedDocsForCert.push({ name: d.name, sha256: stamped.sha256 })
  }
  if (signedDocsForCert.length === 0) {
    return NextResponse.json({ error: 'Aucun document signé trouvé pour le certificat' }, { status: 400 })
  }

  // 6. SenderCompanyName (depuis user_metadata)
  let senderCompanyName = 'L-Agence SA'
  if (envelope.created_by) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(envelope.created_by)
      const meta = (user?.user_metadata as { entreprise?: string } | null) || null
      if (meta?.entreprise && meta.entreprise.trim()) senderCompanyName = meta.entreprise.trim()
    } catch { /* silent */ }
  }

  // 7. Génère le cert (essai 1 avec logo, essai 2 sans logo en fallback)
  const signedAt = envelope.completed_at ? new Date(envelope.completed_at) : new Date()
  const recipients = (envelope.recipients || []) as SignRecipient[]
  let certBuf: Uint8Array | null = null
  let usedFallback = false
  try {
    certBuf = await generateCertificatePdf({
      envelope: envelope as SignEnvelope,
      recipients,
      tokens,
      signedDocuments: signedDocsForCert,
      senderCompanyName,
      signedAt,
    })
  } catch (e1) {
    const msg1 = e1 instanceof Error ? e1.message : String(e1)
    console.error('[regenerate-cert] essai 1 (avec logo) échoué', msg1)
    try {
      certBuf = await generateCertificatePdf({
        envelope: envelope as SignEnvelope,
        recipients,
        tokens,
        signedDocuments: signedDocsForCert,
        senderCompanyName,
        signedAt,
        skipLogo: true,
      })
      usedFallback = true
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2)
      console.error('[regenerate-cert] essai 2 (sans logo) échoué', msg2)
      return NextResponse.json({ error: `Génération cert échouée : ${msg2}` }, { status: 500 })
    }
  }

  if (!certBuf) {
    return NextResponse.json({ error: 'Génération cert vide' }, { status: 500 })
  }

  // 8. Upload + update signed_pdf_paths
  try {
    const certName = 'Certificat de signature.pdf'
    const certBlob = new Blob([certBuf as BlobPart], { type: 'application/pdf' })
    const certPath = await uploadSignDocument('signed', envelope.id, certBlob, certName)
    const certSha = createHash('sha256').update(certBuf).digest('hex')
    const newPaths: SignedPdfPath[] = [
      ...existingPaths,
      { name: certName, path: certPath, sha256: certSha },
    ]
    const { error: upErr } = await (supabase as any)
      .from('sign_envelopes')
      .update({ signed_pdf_paths: newPaths })
      .eq('id', envelope.id)
    if (upErr) {
      return NextResponse.json({ error: `Update DB échouée : ${upErr.message}` }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      certPath,
      certSize: certBuf.byteLength,
      usedFallback,
      docsInCert: signedDocsForCert.length,
    })
  } catch (uploadErr) {
    const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
    return NextResponse.json({ error: `Upload échoué : ${msg}` }, { status: 500 })
  }
}
