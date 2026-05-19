// TalentFlow Sign — Envoi d'une enveloppe (tokens + email Resend + audit)
// v2.2.0 — Phase 3 (envoi email Resend)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'
import { generateTokensForEnvelope } from '@/lib/sign/tokens'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import { dispatchInvite } from '@/lib/sign/sequential'
import type { SignEnvelope, SignRecipient } from '@/lib/sign/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await ctx.params
  const supabase = createAdminClient()

  // Récup enveloppe
  const { data: envelope, error: getErr } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (getErr) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  if (!envelope) return NextResponse.json({ error: 'Enveloppe introuvable' }, { status: 404 })

  const env = envelope as unknown as SignEnvelope
  if (env.status !== 'draft') {
    return NextResponse.json({ error: `Statut ${env.status} : envoi déjà effectué` }, { status: 400 })
  }
  if (!Array.isArray(env.recipients) || env.recipients.length === 0) {
    return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 })
  }

  // v2.2.5 Phase 4d — Validation : si canal whatsapp/both, tous les recipients
  // (signers + cc) doivent avoir un phone E.164 valide.
  const channel = env.delivery_channel || 'email'
  if (channel === 'whatsapp' || channel === 'both') {
    const missing = (env.recipients as SignRecipient[])
      .filter(r => !r.phone || !/^\+\d{10,15}$/.test(r.phone))
      .map(r => r.name || r.email)
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Numéro WhatsApp manquant ou invalide pour : ${missing.join(', ')}`,
      }, { status: 400 })
    }
  }

  // Récup info expéditeur (utilisateur authentifié).
  // ⚠️ senderName = nom de l'ENTREPRISE (L-Agence SA), pas le nom du user.
  // Le candidat doit voir "L-Agence SA vous invite", pas "j.barbosa vous invite".
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  const meta = (user?.user_metadata as { full_name?: string; name?: string; entreprise?: string } | null) || null
  const senderName = (meta?.entreprise && meta.entreprise.trim()) || 'L-Agence SA'
  const senderEmail = user?.email || undefined

  // Compte de docs (info pour l'email)
  let documentsCount = 1
  if (env.template_id) {
    try {
      const { data: tpl } = await supabase
        .from('sign_templates' as any)
        .select('documents')
        .eq('id', env.template_id)
        .maybeSingle()
      const t = tpl as unknown as { documents?: unknown[] } | null
      documentsCount = Array.isArray(t?.documents) ? t!.documents!.length : 1
    } catch { /* silencieux */ }
  }

  const ttlDays = (env as unknown as { expires_in_days?: number | null }).expires_in_days || undefined

  // v2.8.5 / v2.8.6 — AUTO-SIGN du créateur si preset_signature enregistrée.
  // Si le user qui envoie est lui-même destinataire (cas classique : consultant
  // qui s'envoie un contrat candidat→consultant) ET qu'il a une signature
  // pré-enregistrée dans /parametres/profil → on appose sa signature
  // automatiquement et on skip son étape. Le candidat reçoit l'email direct.
  //
  // v2.8.6 — Signature lue depuis table user_preset_signatures (avant : dans
  // user_metadata du cookie JWT → cookie 70KB → 494 Vercel).
  let presetSig: string | null = null
  if (user?.id) {
    const { data: sigRow } = await supabase
      .from('user_preset_signatures' as any)
      .select('data_url')
      .eq('user_id', user.id)
      .maybeSingle()
    const sigData = sigRow as unknown as { data_url?: string } | null
    presetSig = sigData?.data_url || null
  }
  let autoSignedCreator = false
  if (presetSig && user?.email) {
    const userEmailLc = user.email.toLowerCase().trim()
    // v2.9.15 — Ne JAMAIS auto-signer le slot "Candidat" :
    // (1) Exclusion par roleName : si recipient.roleName contient "candidat" → skip.
    // (2) Exclusion par order : on ne signe que les destinataires en aval du 1er
    //     signataire (le 1er = candidat dans la convention TalentFlow).
    // → Garantit que le candidat doit toujours remplir + signer manuellement,
    //   même si le créateur a mis son propre email dans le slot candidat (cas test).
    const signers = (env.recipients as SignRecipient[]).filter(r => r.role !== 'cc')
    const minOrder = signers.length > 0 ? Math.min(...signers.map(r => r.order ?? 0)) : 0
    const isCandidatRole = (r: SignRecipient) => {
      const rn = (r as { roleName?: string }).roleName || ''
      return /candidat/i.test(rn)
    }
    const creatorRecipient = (env.recipients as SignRecipient[])
      .find(r =>
        r.email.toLowerCase().trim() === userEmailLc &&
        r.role !== 'cc' &&
        r.status !== 'signed' &&
        !isCandidatRole(r) &&                     // exclu si roleName contient "Candidat"
        (r.order ?? 0) > minOrder,                // exclu si 1er signataire
      )
    if (creatorRecipient) {
      const nowIso = new Date().toISOString()
      // 1. Génère un token pour le créateur (single)
      const [creatorToken] = await generateTokensForEnvelope(id, [creatorRecipient], ttlDays)
      if (creatorToken) {
        // 2. Marque le token comme signé directement avec la preset signature
        await supabase
          .from('sign_tokens' as any)
          .update({
            signature_data_url: presetSig,
            signature_method: 'drawn',
            signed_at: nowIso,
            signed_ip: extractIp(req),
            used_at: nowIso,
          })
          .eq('token', creatorToken.token)
        // 3. Marque le recipient comme signé dans l'enveloppe
        const updatedRecipients = (env.recipients as SignRecipient[]).map(r => {
          if (r.email.toLowerCase().trim() !== userEmailLc) return r
          return { ...r, status: 'signed' as const, signed_at: nowIso }
        })
        await supabase
          .from('sign_envelopes' as any)
          .update({ recipients: updatedRecipients })
          .eq('id', id)
        // Met à jour env.recipients en local pour la suite de la route
        env.recipients = updatedRecipients
        autoSignedCreator = true
        // 4. Audit log
        await logAuditEvent(id, 'signed', {
          recipientEmail: creatorRecipient.email,
          ip: extractIp(req),
          metadata: {
            signed_via: 'preset_signature',
            auto_signed_at_envelope_send: true,
            role: 'Signataire',
          },
        })
      }
    }
  }

  // v2.2.1 — Workflow séquentiel + PARALLÈLE :
  // Plusieurs destinataires peuvent partager le MÊME `order` → ils reçoivent
  // leur lien EN MÊME TEMPS (étape parallèle). Le passage à l'étape suivante
  // (order > courant) se fait quand TOUS les signers de l'order courant ont
  // signé (cf. /api/sign/finalize).
  //
  // À l'envoi initial : on envoie à TOUS les signers ayant order = min(orders)
  // CC : pas de token initial, ils reçoivent juste la copie complète à la fin.
  // v2.8.5 — On exclut les signers déjà signés (cas preset_signature) du calcul.
  const allRecipients = env.recipients as SignRecipient[]
  const allSigners = allRecipients.filter(r => r.role !== 'cc')
  const pendingSigners = allSigners.filter(r => r.status !== 'signed')
  const minOrder = pendingSigners.length > 0
    ? Math.min(...pendingSigners.map(r => r.order ?? 0))
    : 0
  const recipientsToSendNow: SignRecipient[] = pendingSigners.filter(r => (r.order ?? 0) === minOrder)
  const tokens = await generateTokensForEnvelope(id, recipientsToSendNow, ttlDays || undefined)

  // Envoi par dispatchInvite (gère email + whatsapp selon channel)
  const recipientByEmail = new Map<string, SignRecipient>()
  ;(env.recipients as SignRecipient[]).forEach(r => {
    recipientByEmail.set(r.email.toLowerCase().trim(), r)
  })

  // v2.9.15 — Calcule si le candidat (1er signataire) a déjà signé (cas typique :
  // créateur s'est auto-signé en tant que candidat, ou la chaîne est : candidat
  // → consultant et candidat a signé). Si oui ET le destinataire courant est
  // après lui, on envoie un email contextuel "X a signé, vérifie et confirme".
  const candidateSigner = (env.recipients as SignRecipient[]).find(r => {
    if (r.role === 'cc') return false
    const rn = (r as { roleName?: string }).roleName || ''
    return /candidat/i.test(rn) && r.status === 'signed'
  })
  const candidateOrder = candidateSigner?.order ?? -1
  const candidateDisplayName = candidateSigner
    ? ((candidateSigner as { firstName?: string; name?: string }).firstName
        || (candidateSigner.name || '').split(/\s+/)[0]
        || candidateSigner.name)
    : null

  const dispatchResults = await Promise.all(tokens.map(async t => {
    const r = recipientByEmail.get(t.recipient_email.toLowerCase().trim())
    if (!r) return { email: t.recipient_email, ok: false, error: 'recipient introuvable' }

    // v2.9.15 — Wording contextuel si destinataire en aval d'un candidat signé
    const isReview = candidateSigner
      && (r.order ?? 0) > candidateOrder
      && r.role !== 'cc'
      && r.email.toLowerCase().trim() !== candidateSigner.email.toLowerCase().trim()

    const dispatch = await dispatchInvite({
      envelope: env,
      recipient: r,
      token: t,
      sender: { name: senderName, email: senderEmail },
      documentsCount,
      reviewAfterCandidate: isReview && candidateDisplayName
        ? { candidateName: candidateDisplayName }
        : undefined,
    })

    // Audit log par destinataire
    await logAuditEvent(id, 'sent', {
      recipientEmail: t.recipient_email,
      ip: extractIp(req),
      metadata: {
        channel,
        email: dispatch.email,
        whatsapp: dispatch.whatsapp,
        role: r.role === 'cc' ? 'Copie' : 'Signataire',
      },
    })

    // OK si au moins un canal a réussi (cas 'both' tolère 1/2)
    const ok = (dispatch.email?.ok ?? false) || (dispatch.whatsapp?.ok ?? false)
    const error = !ok
      ? (dispatch.email?.error || dispatch.whatsapp?.error || 'Aucun canal n’a abouti')
      : undefined
    return { email: t.recipient_email, ok, error }
  }))

  const sentOk = dispatchResults.filter(r => r.ok).length
  const sentErr = dispatchResults.filter(r => !r.ok)

  // Bascule status + sent_at (même si certains emails ont échoué, l'enveloppe est partie)
  const { error: updErr } = await supabase
    .from('sign_envelopes' as any)
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)

  if (updErr) {
    console.error('[sign/send] update status error', updErr)
    return NextResponse.json({ error: 'Erreur mise à jour statut' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    tokens: tokens.length,
    sentOk,
    sentErrors: sentErr,
    // v2.8.5 — Indique si le créateur a été auto-signé via preset signature.
    // Utile pour le front qui peut afficher un toast spécifique.
    autoSignedCreator,
  })
}
