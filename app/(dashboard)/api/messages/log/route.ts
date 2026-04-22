// POST /api/messages/log — v1.9.66
// Log d'un envoi iMessage / WhatsApp / SMS avant l'ouverture de l'app native.
// Fire-and-forget côté client : on logge "tentative envoyée à X via Y à Z h"
// sans pouvoir confirmer que le user a cliqué "Envoyer" dans l'app native.
//
// Body : {
//   candidat_ids: string[],          // 1 à N candidats concernés
//   destinataires: string[],         // téls ou emails (1 par ligne du coté UI)
//   canal: 'imessage' | 'whatsapp' | 'sms',
//   corps: string,
//   campagne_id?: string,            // si l'UI veut grouper plusieurs envois
// }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

const VALID_CANAUX = new Set(['imessage', 'whatsapp', 'sms'])

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  let body: any = null
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const canal = String(body?.canal || '').trim()
  if (!VALID_CANAUX.has(canal)) {
    return NextResponse.json({ error: `canal doit être imessage/whatsapp/sms` }, { status: 400 })
  }

  const candidatIds: string[] = Array.isArray(body?.candidat_ids)
    ? body.candidat_ids.filter((x: any) => typeof x === 'string' && x.length > 0)
    : []
  const destinataires: string[] = Array.isArray(body?.destinataires)
    ? body.destinataires.filter((x: any) => typeof x === 'string' && x.length > 0)
    : []
  const corps = typeof body?.corps === 'string' ? body.corps : ''

  if (destinataires.length === 0) {
    return NextResponse.json({ error: 'Au moins 1 destinataire requis' }, { status: 400 })
  }

  const campagneId: string = (typeof body?.campagne_id === 'string' && body.campagne_id.trim())
    ? body.campagne_id.trim()
    : ((globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  const userId = user?.id
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // v1.9.68 — nom expéditeur pour affichage historique global team
  const meta = (user?.user_metadata || {}) as Record<string, any>
  const userName: string = (
    meta.prenom ||
    meta.full_name ||
    meta.name ||
    (user?.email ? String(user.email).split('@')[0] : '') ||
    'Inconnu'
  )

  // Résolution client_nom via lookup candidats si 1 seul candidat (best-effort)
  let clientNom: string | null = null
  if (candidatIds.length === 1) {
    try {
      const { data } = await supabase
        .from('candidats')
        .select('prenom, nom')
        .eq('id', candidatIds[0])
        .maybeSingle()
      if (data) clientNom = `${(data as any).prenom ?? ''} ${(data as any).nom ?? ''}`.trim() || null
    } catch { /* ignore */ }
  }

  // 1 row par destinataire (cohérent avec le pattern email).
  // v1.9.81 : emails_envoyes.sujet est NOT NULL — on met un libellé par canal (évite l'INSERT silencieux cassé).
  const sujetByCanal: Record<string, string> = {
    imessage: 'iMessage',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
  }
  const rows = destinataires.map(dest => ({
    candidat_id: candidatIds[0] ?? null,
    candidat_ids: candidatIds.length > 0 ? candidatIds : null,
    integration_id: null,
    sujet: sujetByCanal[canal] || canal,
    corps: corps || '',
    destinataire: dest,
    statut: 'tentative' as const, // canal natif : on ne peut pas confirmer l'envoi réel
    user_id: userId,
    user_name: userName,
    campagne_id: campagneId,
    client_id: null,
    client_nom: clientNom,
    cv_personnalise: false,
    cv_urls_utilises: null,
    canal,
  }))

  // Service role car les colonnes sont gérées server-side + RLS INSERT policy
  // user_id=auth.uid() déjà en place, mais on passe service role pour homogénéité
  // avec le DELETE endpoint (patch v1.9.65).
  const admin = createAdminClient()
  const { error } = await admin.from('emails_envoyes').insert(rows as any)
  if (error) {
    console.error('[messages/log] insert error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logged: rows.length, campagne_id: campagneId })
}
