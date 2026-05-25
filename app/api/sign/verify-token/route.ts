// TalentFlow Sign — PUBLIC : vérifie un token et retourne l'enveloppe + docs
// v2.2.0 — Phase 1
// Pas d'auth dashboard : auth = token uuid valide non expiré non utilisé.
// Utilise service role pour bypass RLS.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/sign/tokens'
import { logAuditEvent, extractIp } from '@/lib/sign/audit'
import type { SignEnvelope, SignTemplate, SignDocument, SignField, SignRecipient, SignRecipientSchema } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

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
    // v2.8.0 — Avant : on forçait `idx + 1` (1-based) en pensant que les fields
    // DocuSign étaient toujours en 1-based. Bug : si les rôles du template sont
    // en 0-based (création via éditeur visuel TF Sign), les fields ont
    // recipientOrder=0 mais on cherchait recipientOrder=1 → no match → soit
    // tous fields visibles, soit aucun. Fix : on utilise le `order` réel du
    // recipient (0 ou 1+), avec fallback idx+1 si absent.
    const lcRecipientEmail = result.token.recipient_email.toLowerCase().trim()
    const envRecipients = (envelope.recipients || []) as SignRecipient[]
    const currentRecipientIdx = envRecipients.findIndex(r => r.email.toLowerCase().trim() === lcRecipientEmail)
    const currentRecipient = currentRecipientIdx >= 0 ? envRecipients[currentRecipientIdx] : undefined
    const currentRecipientOrder = typeof currentRecipient?.order === 'number'
      ? currentRecipient.order
      : (currentRecipientIdx >= 0 ? currentRecipientIdx + 1 : 1)
    const isCC = currentRecipient?.role === 'cc'

    // v2.9.52 — Diagnostic Bug 2 (signer 2x) : log la résolution recipient +
    // distribution des recipientOrder dans les fields du template. Permet de
    // voir au prochain test si un mismatch fait que le candidat « voit » des
    // champs signature du consultant (et inversement).
    try {
      const allFields = (documents || []).flatMap((d) => (d.fields || [])) as Array<{ type: string; recipientOrder?: number }>
      const distrib: Record<string, Record<string, number>> = {}
      for (const f of allFields) {
        const ord = String(f.recipientOrder ?? 'undefined')
        if (!distrib[ord]) distrib[ord] = {}
        distrib[ord][f.type] = (distrib[ord][f.type] || 0) + 1
      }
      console.log(
        `[sign/verify-token] envelope=${envelope.id} recipient=${lcRecipientEmail}`
        + ` idx=${currentRecipientIdx} order=${currentRecipientOrder} role=${currentRecipient?.role || 'unknown'}`
        + ` fields_distrib_by_order=${JSON.stringify(distrib)}`,
      )
    } catch { /* silent */ }

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

    // v2.2.3 — Pack 1 : agrège les field_values des SIGNERS PRÉCÉDENTS pour que le
    // destinataire courant voie le rapport rempli avant de signer. Critique pour
    // les workflows séquentiels (ex: le client doit valider les heures du candidat).
    let previousFieldValues: Record<string, unknown> = {}
    let previousSignerNames: Record<string, string> = {}  // fieldId → "Nom du signataire"
    try {
      const { data: priorTokens } = await supabase
        .from('sign_tokens' as any)
        .select('id, recipient_email, recipient_name, field_values, signed_at, signature_data_url')
        .eq('envelope_id', envelope.id)
        .neq('id', result.token.id)  // exclut le token courant
      const tokensList = (priorTokens || []) as unknown as Array<{
        id: string
        recipient_email: string
        recipient_name: string
        field_values: Record<string, unknown> | null
        signed_at: string | null
        signature_data_url: string | null
      }>
      for (const t of tokensList) {
        // Trouve le recipient correspondant dans envelope.recipients
        const matchingRecipient = envRecipients.find(r =>
          r.email.toLowerCase().trim() === t.recipient_email.toLowerCase().trim()
        )
        const otherOrder = matchingRecipient?.order ?? 0
        // Ne garde que les valeurs des SIGNERS antérieurs (order < currentOrder)
        // Les ordres parallèles (= current) et postérieurs (> current) sont exclus.
        if (otherOrder >= currentRecipientOrder) continue

        // Field values
        if (t.field_values) {
          for (const [fieldId, value] of Object.entries(t.field_values)) {
            if (previousFieldValues[fieldId] !== undefined) continue
            previousFieldValues[fieldId] = value
            previousSignerNames[fieldId] = t.recipient_name
          }
        }

        // v2.8.5 — Inject signature_data_url du previous signer sur ses fields
        // signature/initial pour que le destinataire courant voie la vraie
        // signature (au lieu du placeholder "✓ Signé").
        if (t.signature_data_url && t.signed_at) {
          for (const doc of (documents as SignDocument[])) {
            for (const f of (doc.fields || [])) {
              const fOrder = f.recipientOrder ?? 1
              if (fOrder !== otherOrder) continue
              if (f.type !== 'signature' && f.type !== 'initial') continue
              if (previousFieldValues[f.id] !== undefined) continue
              previousFieldValues[f.id] = t.signature_data_url
              previousSignerNames[f.id] = t.recipient_name
            }
          }
        }
      }
    } catch { /* silencieux */ }

    // v2.9.49 — Injecte les valeurs auto-fill RÉSOLUES des signataires précédents
    // dans previousFieldValues. Sans ça, les champs type=firstname/lastname/email/
    // fullname/company/title du CANDIDAT apparaissent VIDES côté consultant : ils
    // sont normalement résolus à la volée depuis le contexte du signataire courant
    // (le consultant), qui ne contient pas les infos du candidat. Le PDF final est
    // correct (le stamper a le bon contexte) mais l'écran intermédiaire ne l'était
    // pas — d'où l'asymétrie vue par João.
    if (currentRecipientOrder > 1 && candidatInfo) {
      const ci = candidatInfo as { prenom?: string | null; nom?: string | null; email?: string | null; telephone?: string | null; metier_recherche?: string | null }
      const cFirst = (ci.prenom || '').trim()
      const cLast = (ci.nom || '').trim()
      const cFull = [cFirst, cLast].filter(Boolean).join(' ')
      const cEmail = (ci.email || '').trim()
      const cPhone = (ci.telephone || '').trim()
      const cTitle = (ci.metier_recherche || '').trim()
      const resolveAutofill = (f: SignField): string | null => {
        switch (f.type) {
          case 'firstname': return cFirst || null
          case 'lastname':  return cLast || null
          case 'fullname':  return cFull || null
          case 'email':     return cEmail || null
          case 'company':   return effectiveCompanyName || null
          case 'title':     return cTitle || null
          default:
            // Champs number marqués téléphone (autoFillSource='phone' ou libellé tél.)
            if (f.type === 'number' && (f as unknown as { autoFillSource?: string }).autoFillSource === 'phone') {
              return cPhone || null
            }
            return null
        }
      }
      for (const doc of (documents as SignDocument[])) {
        for (const f of (doc.fields || [])) {
          const fOrder = f.recipientOrder ?? 1
          if (fOrder >= currentRecipientOrder) continue        // pas un signataire antérieur
          if (previousFieldValues[f.id] !== undefined) continue // déjà rempli
          const v = resolveAutofill(f)
          if (v) previousFieldValues[f.id] = v
        }
      }
    }

    // v2.7.6 — Étape "À compléter" pour le consultant (recipientOrder ≥ 2) :
    // si des champs marqués `consultantCanFill` sont vides dans les valeurs du candidat,
    // on injecte une étape dédiée en tête du wizard pour que le consultant puisse les remplir.
    let effectiveWizardSteps: WizardStep[] = wizardSteps as WizardStep[]
    if (currentRecipientOrder > 1) {
      const allFields = (documents as SignDocument[]).flatMap(d => d.fields || [])
      const fieldsToFill = allFields.filter(f =>
        f.metadata?.consultantCanFill === true &&
        (f.recipientOrder ?? 1) < currentRecipientOrder &&
        (previousFieldValues[f.id] === undefined || previousFieldValues[f.id] === null || previousFieldValues[f.id] === '')
      )
      if (fieldsToFill.length > 0) {
        const consultantFillStep: WizardStep = {
          id: `consultant-fill-${envelope.id}`,
          title: 'Informations à compléter',
          description: `${fieldsToFill.length} champ${fieldsToFill.length > 1 ? 's' : ''} laissé${fieldsToFill.length > 1 ? 's' : ''} vide par le candidat — vous pouvez les compléter.`,
          fieldIds: fieldsToFill.map(f => f.id),
          docOrder: 1,
          recipientOrder: currentRecipientOrder,
        }
        effectiveWizardSteps = [consultantFillStep, ...(wizardSteps as WizardStep[])]
      }
    }

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
      // v2.2.3 — Pack 1 : valeurs des signers précédents (read-only côté UI)
      previousFieldValues,
      previousSignerNames,
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
        steps: effectiveWizardSteps,
      },
    })
  } catch (e) {
    console.error('[sign/verify-token] error', e)
    return NextResponse.json({ valid: false, reason: 'server_error' }, { status: 500 })
  }
}
