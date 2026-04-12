// app/(dashboard)/api/missions/pending/[id]/confirm/route.ts
// POST — confirme une proposition : INSERT ou UPDATE dans missions, DELETE dans missions_pending

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminClient()
    const { id } = await params

    // Récupérer la proposition
    const { data: pending, error: fetchErr } = await (supabase as any)
      .from('missions_pending')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !pending) {
      return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 })
    }

    let missionId: string

    if (pending.type === 'create') {
      // ── Tenter matching candidat par prénom+nom (2 essais d'ordre) ────────
      let candidat_id: string | null = null
      let client_id: string | null = null

      if (pending.candidat_nom) {
        const parts = (pending.candidat_nom as string).trim().split(/\s+/)
        if (parts.length >= 2) {
          const p0 = parts[0]
          const p1 = parts.slice(1).join(' ')

          const { data: c1 } = await (supabase as any)
            .from('candidats').select('id')
            .ilike('prenom', `${p0}%`).ilike('nom', `${p1}%`).limit(1)
          if (c1?.length) {
            candidat_id = c1[0].id
          } else {
            const { data: c2 } = await (supabase as any)
              .from('candidats').select('id')
              .ilike('prenom', `${p1}%`).ilike('nom', `${p0}%`).limit(1)
            if (c2?.length) candidat_id = c2[0].id
          }
        }
      }

      // Matching client par nom_entreprise
      if (pending.client_nom) {
        const { data: cl } = await (supabase as any)
          .from('clients').select('id')
          .ilike('nom_entreprise', `%${(pending.client_nom as string).trim()}%`).limit(1)
        if (cl?.length) client_id = cl[0].id
      }

      const { data: created, error: insertErr } = await (supabase as any)
        .from('missions')
        .insert({
          numero_quadrigis: pending.numero_quadrigis,
          candidat_id,
          candidat_nom: pending.candidat_nom,
          client_id,
          client_nom: pending.client_nom,
          metier: pending.metier,
          date_debut: pending.date_debut,
          date_fin: pending.date_fin,
          marge_brute: pending.marge_brute,
          coefficient: pending.coefficient ?? 1,
          statut: pending.statut || 'en_cours',
          absences: [],
        })
        .select('id')
        .single()

      if (insertErr) throw insertErr
      missionId = created.id

    } else {
      // ── type === 'update' — appliquer les changes ─────────────────────────
      if (!pending.mission_id) {
        return NextResponse.json({ error: 'mission_id manquant sur la proposition update' }, { status: 400 })
      }

      const changes: Record<string, { avant: any; apres: any }> = pending.changes || {}
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }

      for (const field of ['date_debut', 'date_fin', 'coefficient', 'marge_brute', 'statut']) {
        if (changes[field] !== undefined) {
          updatePayload[field] = changes[field].apres
        }
      }

      const { error: updateErr } = await (supabase as any)
        .from('missions')
        .update(updatePayload)
        .eq('id', pending.mission_id)

      if (updateErr) throw updateErr
      missionId = pending.mission_id
    }

    // Supprimer la proposition (pas d'historique pour les confirmées)
    await (supabase as any).from('missions_pending').delete().eq('id', id)

    return NextResponse.json({ ok: true, mission_id: missionId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
