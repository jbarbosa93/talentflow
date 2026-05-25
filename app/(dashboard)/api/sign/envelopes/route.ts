// TalentFlow Sign — Routes enveloppes (liste + création)
// v2.2.0 — Phase 1
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'
import { logAuditEvent } from '@/lib/sign/audit'
import { normalizePhoneE164 } from '@/lib/sign/phone-format'
import type { SignCategory, SignDeliveryChannel, SignRecipient, SignStatus } from '@/lib/sign/types'

const VALID_CHANNELS: SignDeliveryChannel[] = ['email', 'whatsapp', 'both']

const VALID_STATUS: SignStatus[] = ['draft', 'sent', 'in_progress', 'completed', 'expired', 'declined', 'cancelled']
const VALID_CATEGORY: SignCategory[] = ['mappe', 'contrat', 'autres']

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const candidateId = searchParams.get('candidate_id')
  const search = searchParams.get('search')
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  const supabase = createAdminClient()
  let q = supabase
    .from('sign_envelopes' as any)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status && (VALID_STATUS as string[]).includes(status)) q = q.eq('status', status)
  if (category && (VALID_CATEGORY as string[]).includes(category)) q = q.eq('document_category', category)
  if (candidateId) q = q.eq('candidate_id', candidateId)
  if (search) q = q.ilike('title', `%${search}%`)

  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) {
    console.error('[sign/envelopes] GET error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ envelopes: data || [], count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await req.json()
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title requis' }, { status: 400 })
    }
    // v2.9.49 — Default = 'mappe' (Général) au lieu de 'autres' (catégorie retirée de l'UI).
    const category: SignCategory = (VALID_CATEGORY as string[]).includes(body.document_category)
      ? body.document_category
      : 'mappe'

    const recipients: SignRecipient[] = Array.isArray(body.recipients) ? body.recipients : []
    // Validation minimale destinataires
    for (const r of recipients) {
      if (!r.email || !r.name) {
        return NextResponse.json({ error: 'Chaque destinataire doit avoir name + email' }, { status: 400 })
      }
    }

    // v2.2.5 Phase 4d — delivery_channel + validation phones si non-email
    const deliveryChannel: SignDeliveryChannel = (VALID_CHANNELS as string[]).includes(body.delivery_channel)
      ? body.delivery_channel
      : 'email'

    // Normalise les phones (E.164) — mais reste tolérant à la création :
    // la validation stricte est dans /api/sign/envelopes/[id]/send (au moment d'envoyer).
    // Cela permet de sauvegarder un brouillon sans phones et de les ajouter plus tard.
    const normalizedRecipients = recipients.map((r, idx) => {
      const rawPhone = (r as { phone?: string }).phone
      const phone = rawPhone ? normalizePhoneE164(rawPhone) : null
      // v2.9.16 — preferredViewMode (wizard/document/auto) doit être saved sur
      // le recipient sinon le candidat tombe toujours en mode 'auto' au signing
      // → fallback document sur desktop, et même sur mobile si filter wizard fail.
      const rawPref = (r as { preferredViewMode?: string }).preferredViewMode
      const preferredViewMode: 'wizard' | 'document' | 'auto' | undefined =
        rawPref === 'wizard' || rawPref === 'document' ? rawPref :
        rawPref === 'auto' ? 'auto' : undefined
      return {
        name: r.name.trim(),
        firstName: typeof r.firstName === 'string' ? r.firstName.trim() : undefined,
        lastName: typeof r.lastName === 'string' ? r.lastName.trim() : undefined,
        email: r.email.toLowerCase().trim(),
        phone,
        role: r.role || 'signer',
        roleName: typeof r.roleName === 'string' ? r.roleName.trim() : undefined,
        order: r.order ?? idx,
        status: 'pending' as const,
        signed_at: null,
        preferredViewMode,
      }
    })

    const server = await createServerClient()
    const { data: { user } } = await server.auth.getUser()

    // v2.2.1 — Options avancées
    const expiresInDays = Number.isFinite(body.expires_in_days) && body.expires_in_days > 0
      ? Math.min(365, Math.floor(body.expires_in_days))
      : null
    const reminderFreq = Number.isFinite(body.reminder_frequency_days) && body.reminder_frequency_days > 0
      ? Math.min(30, Math.floor(body.reminder_frequency_days))
      : null
    const expiryWarning = Number.isFinite(body.expiry_warning_days) && body.expiry_warning_days > 0
      ? Math.min(30, Math.floor(body.expiry_warning_days))
      : null

    const supabase = createAdminClient()
    const insertPayload: Record<string, unknown> = {
      title: body.title.trim(),
      template_id: body.template_id || null,
      candidate_id: body.candidate_id || null,
      status: 'draft',
      document_category: category,
      recipients: normalizedRecipients,
      message: body.message?.trim() || null,
      created_by: user?.id || null,
      delivery_channel: deliveryChannel,
      expires_in_days: expiresInDays,
      reminder_frequency_days: reminderFreq,
      expiry_warning_days: expiryWarning,
      // v2.2.1 — context_data (jsonb) pour week_start_date / autres contextes futurs
      context_data: body.context_data && typeof body.context_data === 'object'
        ? body.context_data
        : null,
    }
    // v2.8.0 — Si template_id présent ET documents override fournis (cas template
    // "contrat" : le PDF du jour remplace celui du template), on clone le
    // template parent dans un template ad-hoc avec les nouveaux docs + on hérite
    // recipients_schema + wizard_steps + wizard_enabled. Pas de colonne
    // `documents` sur sign_envelopes → on passe par un template ad-hoc.
    if (body.template_id && Array.isArray(body.documents) && body.documents.length > 0) {
      const { data: parentTpl } = await supabase
        .from('sign_templates' as any)
        .select('*')
        .eq('id', body.template_id)
        .single()
      const parent = parentTpl as unknown as {
        name?: string
        recipients_schema?: Array<{ role?: string; order?: number; roleName?: string }>
        wizard_enabled?: boolean
        wizard_steps?: unknown
        template_category?: string | null
      } | null

      // v2.8.0 — Construire le recipients_schema du template ad-hoc à partir
      // des destinataires fournis (qui ont les vrais roleName "Candidat",
      // "Consultant") au lieu de cloner le schema générique du parent.
      // Fallback : si recipients vide, on prend celui du parent.
      const parentSchema = parent?.recipients_schema || []
      let adHocSchema: Array<{ role: string; order: number; roleName: string }>
      if (normalizedRecipients.length > 0) {
        adHocSchema = normalizedRecipients.map((r, idx) => {
          const order = r.order ?? idx
          const parentItem = parentSchema.find(p => p.order === order)
          return {
            role: r.role || parentItem?.role || 'signer',
            order,
            roleName: r.roleName || parentItem?.roleName || `Rôle ${order + 1}`,
          }
        })
      } else {
        adHocSchema = (parentSchema as Array<{ role?: string; order?: number; roleName?: string }>)
          .map((p, idx) => ({
            role: p.role || 'signer',
            order: p.order ?? idx,
            roleName: p.roleName || `Rôle ${(p.order ?? idx) + 1}`,
          }))
      }

      const { data: tplAdHoc } = await supabase
        .from('sign_templates' as any)
        .insert({
          name: `[Envoi] ${body.title.trim()}`,
          description: `Override du template ${parent?.name || body.template_id}`,
          documents: body.documents,
          recipients_schema: adHocSchema,
          wizard_enabled: parent?.wizard_enabled ?? false,
          wizard_steps: parent?.wizard_steps ?? null,
          template_category: parent?.template_category ?? null,
          created_by: user?.id || null,
          // v2.8.0 — Marque ce template comme ad-hoc → masqué des listes UI
          parent_template_id: body.template_id,
        })
        .select('id')
        .single()
      const tplId = (tplAdHoc as unknown as { id?: string } | null)?.id
      if (tplId) insertPayload.template_id = tplId
    } else if (!body.template_id && Array.isArray(body.documents) && body.documents.length > 0) {
      // Si pas de template ET docs uploadés direct dans l'enveloppe → on les stocke
      // dans un template ad-hoc (réutilise le mécanisme template_id pour servir les PDFs)
      const { data: tplAdHoc } = await supabase
        .from('sign_templates' as any)
        .insert({
          name: `[Ad-hoc] ${body.title.trim()}`,
          description: 'Template auto-créé pour cette enveloppe',
          documents: body.documents,
          recipients_schema: [{ role: 'signer', order: 0 }],
          created_by: user?.id || null,
          wizard_enabled: false,
        })
        .select('id')
        .single()
      const tplId = (tplAdHoc as unknown as { id?: string } | null)?.id
      if (tplId) insertPayload.template_id = tplId
    }

    const { data, error } = await supabase
      .from('sign_envelopes' as any)
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error('[sign/envelopes] POST error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const created = data as unknown as { id: string }
    await logAuditEvent(created.id, 'created', { metadata: { user_id: user?.id || null } })

    return NextResponse.json({ envelope: data })
  } catch (e) {
    console.error('[sign/envelopes] POST exception', e)
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}
