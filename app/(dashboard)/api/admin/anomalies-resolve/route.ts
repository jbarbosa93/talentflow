// app/(dashboard)/api/admin/anomalies-resolve/route.ts
// v1.9.18 : marquer une anomalie comme faux_positif / corrige (ou annuler).
// Collaboratif : tous les consultants authentifiés (requireAuth seul, pas admin-only).
//
// POST   body { candidat_id, anomaly_type, resolution: 'faux_positif'|'corrige', note? }
// DELETE body { candidat_id, anomaly_type } → annule la résolution
// GET    ?history=1 → 50 derniers { candidat_id, nom, prenom, anomaly_type, resolution, resolved_by_email, resolved_at, note }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

const VALID_TYPES = ['texte_mismatch', 'onedrive_mismatch', 'cv_orphan'] as const
const VALID_RESOLUTIONS = ['faux_positif', 'corrige'] as const

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await req.json()
    const { candidat_id, anomaly_type, resolution, note } = body || {}

    if (!candidat_id || !VALID_TYPES.includes(anomaly_type) || !VALID_RESOLUTIONS.includes(resolution)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = createAdminClient()

    // Récupérer cv_url actuel pour le figer dans la résolution
    const { data: cand } = await (admin as any)
      .from('candidats')
      .select('cv_url')
      .eq('id', candidat_id)
      .maybeSingle()

    const { error } = await (admin as any)
      .from('anomalies_resolved')
      .upsert({
        candidat_id,
        anomaly_type,
        resolution,
        resolved_by: user.id,
        resolved_by_email: user.email || null,
        resolved_at: new Date().toISOString(),
        resolved_cv_url: cand?.cv_url || null,
        note: note || null,
      }, { onConflict: 'candidat_id,anomaly_type' })

    if (error) {
      console.error('[anomalies-resolve] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[anomalies-resolve] POST exception:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await req.json()
    const { candidat_id, anomaly_type } = body || {}
    if (!candidat_id || !VALID_TYPES.includes(anomaly_type)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('anomalies_resolved')
      .delete()
      .eq('candidat_id', candidat_id)
      .eq('anomaly_type', anomaly_type)

    if (error) {
      console.error('[anomalies-resolve] delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as any)
      .from('anomalies_resolved')
      .select('candidat_id, anomaly_type, resolution, resolved_by_email, resolved_at, note, candidats!inner(nom, prenom)')
      .order('resolved_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[anomalies-resolve] history error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const history = (data || []).map((r: any) => ({
      candidat_id: r.candidat_id,
      anomaly_type: r.anomaly_type,
      resolution: r.resolution,
      resolved_by_email: r.resolved_by_email,
      resolved_at: r.resolved_at,
      note: r.note,
      nom: r.candidats?.nom || '',
      prenom: r.candidats?.prenom || '',
    }))

    return NextResponse.json({ history })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
