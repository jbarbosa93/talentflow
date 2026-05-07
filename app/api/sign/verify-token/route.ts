// TalentFlow Sign — PUBLIC : vérifie un token et retourne l'enveloppe + docs
// v2.2.0 — Phase 1
// Pas d'auth dashboard : auth = token uuid valide non expiré non utilisé.
// Utilise service role pour bypass RLS.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import type { SignEnvelope, SignTemplate, SignDocument, SignRecipient, SignRecipientSchema } from '@/lib/sign/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, reason: 'missing_token' }, { status: 400 })
    }

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ valid: false, reason: result.reason }, { status: 200 })
    }

    const supabase = createAdminClient()
    const { data: env } = await supabase
      .from('sign_envelopes' as any)
      .select('*')
      .eq('id', result.token.envelope_id)
      .maybeSingle()

    if (!env) {
      return NextResponse.json({ valid: false, reason: 'envelope_not_found' }, { status: 200 })
    }

    const envelope = env as unknown as SignEnvelope
    let documents: SignDocument[] = []
    let templateRecipientsSchema: SignRecipientSchema[] = []
    let wizardEnabled = false
    let wizardSteps: unknown[] = []

    // Documents : depuis le template lié, sinon liste vide (Phase 1, ad-hoc upload pas géré)
    if (envelope.template_id) {
      const { data: tpl } = await supabase
        .from('sign_templates' as any)
        .select('documents, recipients_schema, wizard_enabled, wizard_steps')
        .eq('id', envelope.template_id)
        .maybeSingle()
      const t = tpl as unknown as Pick<SignTemplate, 'documents' | 'recipients_schema'> & {
        wizard_enabled?: boolean; wizard_steps?: unknown[]
      } | null
      documents = (t?.documents || []) as SignDocument[]
      templateRecipientsSchema = (t?.recipients_schema || []) as SignRecipientSchema[]
      wizardEnabled = t?.wizard_enabled !== false  // default true
      wizardSteps = Array.isArray(t?.wizard_steps) ? t!.wizard_steps! : []
    }

    // Phase 4a-bis — Détermine recipientOrder du destinataire courant pour filtrer ses fields
    // ⚠️ Décalage 0-based vs 1-based : CreateEnvelopeModal pose `order: 0, 1, 2...`
    // alors que le parser DocuSign assigne `field.recipientOrder = 1, 2, 3...` (1-based,
    // cohérent avec recipients_schema). Pour matcher correctement les fields, on calcule
    // recipientOrder depuis la POSITION dans envelope.recipients[] (1-based), pas depuis r.order.
    const lcRecipientEmail = result.token.recipient_email.toLowerCase().trim()
    const envRecipients = (envelope.recipients || []) as SignRecipient[]
    const currentRecipientIdx = envRecipients.findIndex(r => r.email.toLowerCase().trim() === lcRecipientEmail)
    const currentRecipient = currentRecipientIdx >= 0 ? envRecipients[currentRecipientIdx] : undefined
    const currentRecipientOrder = currentRecipientIdx >= 0 ? currentRecipientIdx + 1 : 1
    const isCC = currentRecipient?.role === 'cc'

    // Récup info expéditeur (pour afficher "X vous invite à signer")
    // Priorité affichage : nom de l'ENTREPRISE > nom user > email split
    // (le candidat doit voir "L-Agence SA vous invite", pas "j.barbosa")
    let senderName: string | null = null
    let senderEmail: string | null = null
    let senderUserName: string | null = null   // nom du user (pour audit/footer)
    let companyName: string = "L-Agence SA"    // fallback hardcodé L-Agence
    if (envelope.created_by) {
      try {
        const { data: { user: senderUser } } = await supabase.auth.admin.getUserById(envelope.created_by)
        if (senderUser) {
          const meta = (senderUser.user_metadata as { full_name?: string; name?: string; entreprise?: string } | null) || null
          senderUserName = meta?.full_name || meta?.name || senderUser.email?.split('@')[0] || null
          senderEmail = senderUser.email || null
          // Si l'user a une entreprise dans son profil, on la priorise
          if (meta?.entreprise && meta.entreprise.trim()) {
            companyName = meta.entreprise.trim()
          }
          senderName = companyName
        }
      } catch { /* silencieux */ }
    }

    // Log "viewed" (best-effort)
    await logAuditEvent(envelope.id, 'viewed', {
      recipientEmail: result.token.recipient_email,
      ip: extractIp(req),
      userAgent: req.headers.get('user-agent'),
    })

    // Phase 3 — terms_accepted_at peut être présent si le destinataire a déjà accepté
    // Phase 4a — signature_data_url + signed_at peuvent être présents si signé partiellement/finalisé
    const tokenWithExtras = result.token as typeof result.token & {
      terms_accepted_at?: string | null
      signature_data_url?: string | null
      signature_method?: 'drawn' | 'typed' | 'auto' | null
      signed_at?: string | null
      field_values?: Record<string, unknown>
    }

    // v2.2.0 Phase 4a-bis-5 — Si l'enveloppe est liée à un candidat, on récupère
    // ses infos pour pré-remplir les fields auto-fill (firstname/lastname/email/...)
    // ET les autres infos utiles (téléphone, date naissance, adresse, etc.)
    let candidatInfo: {
      prenom?: string | null; nom?: string | null;
      email?: string | null; telephone?: string | null;
      date_naissance?: string | null; localisation?: string | null;
      metier_recherche?: string | null;
    } | null = null
    if (envelope.candidate_id) {
      try {
        const { data: cand } = await supabase
          .from('candidats')
          .select('prenom, nom, email, telephone, date_naissance, localisation, metier_recherche')
          .eq('id', envelope.candidate_id)
          .maybeSingle()
        if (cand) candidatInfo = cand as unknown as typeof candidatInfo
      } catch { /* silencieux */ }
    }

    // v2.2.2 — Si l'admin a override le nom de société dans context_data.companyName
    // (via AdvancedOptions à la création), on l'utilise prioritairement.
    const ctxData = (envelope as unknown as { context_data?: Record<string, unknown> | null }).context_data || null
    const ctxCompany = ctxData && typeof ctxData.companyName === 'string' && ctxData.companyName.trim()
      ? ctxData.companyName.trim()
      : null
    const effectiveCompanyName = ctxCompany || companyName

    return NextResponse.json({
      valid: true,
      envelope: {
        id: envelope.id,
        title: envelope.title,
        message: envelope.message,
        status: envelope.status,
        document_category: envelope.document_category,
        sent_at: envelope.sent_at,
        // v2.2.1 — context_data pour enrichir les wizardSections (ex: jours avec date)
        context_data: (envelope as unknown as { context_data?: Record<string, unknown> | null }).context_data || null,
      },
      sender: senderName ? { name: senderName, email: senderEmail } : null,
      // v2.2.2 — Nom de société exposé pour pré-remplir les fields type=company
      // (priorité : context_data.companyName > sender.entreprise meta > "L-Agence SA")
      companyName: effectiveCompanyName,
      candidat: candidatInfo,
      recipient: {
        name: result.token.recipient_name,
        firstName: currentRecipient?.firstName || null,
        lastName: currentRecipient?.lastName || null,
        email: result.token.recipient_email,
        expires_at: result.token.expires_at,
        order: currentRecipientOrder,
        role: currentRecipient?.role || 'signer',
        isCC,
        // v2.2.2 — Mode d'affichage préféré (défini par l'admin à l'envoi ou hérité du template)
        preferredViewMode: (currentRecipient as unknown as { preferredViewMode?: string } | null)?.preferredViewMode || 'auto',
        terms_accepted_at: tokenWithExtras.terms_accepted_at || null,
        // Phase 4a — état signature pour rehydrater au refresh
        signature_data_url: tokenWithExtras.signature_data_url || null,
        signature_method: tokenWithExtras.signature_method || null,
        signed_at: tokenWithExtras.signed_at || null,
        field_values: tokenWithExtras.field_values || {},
      },
      // v2.2.0 Phase 4a-bis — Liste tous les destinataires (pour la sidebar)
      allRecipients: envRecipients.map(r => ({
        name: r.name,
        order: r.order,
        role: r.role,
        status: r.status || 'pending',
        signed_at: r.signed_at || null,
        isCurrent: r.email.toLowerCase().trim() === lcRecipientEmail,
      })),
      documents,
      // v2.2.0 Phase 4a-bis-2 — Wizard mode
      wizard: {
        enabled: wizardEnabled,
        steps: wizardSteps,
      },
    })
  } catch (e) {
    console.error('[sign/verify-token] error', e)
    return NextResponse.json({ valid: false, reason: 'server_error' }, { status: 500 })
  }
}
