// app/(dashboard)/api/missions/sync-quadrigis/route.ts
// POST — reçoit une mission depuis Cowork (lecture Quadrigis)
// Compare avec missions existantes, insère dans missions_pending (validation manuelle)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function normalizeStatut(s: string | null | undefined): string {
  if (!s) return 'en_cours'
  const l = s.toLowerCase()
  if (l.includes('annul') || l.includes('sans emploi') || l.includes('chom') || l.includes('chôm')) return 'annulee'
  if (l.includes('termin') || l.includes('clôtur') || l.includes('clotur')) return 'terminee'
  return 'en_cours'
}

function numDiff(a: any, b: any): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return false
  if (a === null || a === undefined || b === null || b === undefined) return true
  return Math.abs(Number(a) - Number(b)) > 0.001
}

function strDiff(a: any, b: any): boolean {
  const sa = (a === null || a === undefined) ? null : String(a)
  const sb = (b === null || b === undefined) ? null : String(b)
  return sa !== sb
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const {
      numero_quadrigis,
      candidat_nom,
      client_nom,
      metier,
      date_debut,
      date_fin,
      coefficient,
      marge_brute,
      statut,
    } = body

    // ── Validation ────────────────────────────────────────────────────────────
    if (!numero_quadrigis || typeof numero_quadrigis !== 'string') {
      return NextResponse.json({ error: 'numero_quadrigis requis (string)' }, { status: 400 })
    }
    if (!date_debut) {
      return NextResponse.json({ error: 'date_debut requis (YYYY-MM-DD)' }, { status: 400 })
    }
    if (marge_brute === undefined || marge_brute === null) {
      return NextResponse.json({ error: 'marge_brute requis (number)' }, { status: 400 })
    }

    const statutNorm = normalizeStatut(statut)

    // ── 1. Chercher mission existante ─────────────────────────────────────────
    const { data: existing, error: lookupErr } = await (supabase as any)
      .from('missions')
      .select('id, date_debut, date_fin, coefficient, marge_brute, statut')
      .eq('numero_quadrigis', numero_quadrigis)
      .maybeSingle()

    if (lookupErr) throw lookupErr

    let pendingInserted = 0
    let ignored = 0

    if (existing) {
      // ── 2. Comparer les champs — construire objet changes ─────────────────
      const changes: Record<string, { avant: any; apres: any }> = {}

      if (strDiff(existing.date_debut, date_debut)) {
        changes.date_debut = { avant: existing.date_debut, apres: date_debut }
      }
      if (strDiff(existing.date_fin, date_fin ?? null)) {
        changes.date_fin = { avant: existing.date_fin, apres: date_fin ?? null }
      }
      if (numDiff(existing.coefficient, coefficient)) {
        changes.coefficient = { avant: Number(existing.coefficient), apres: Number(coefficient ?? 1) }
      }
      if (numDiff(existing.marge_brute, marge_brute)) {
        changes.marge_brute = { avant: Number(existing.marge_brute), apres: Number(marge_brute) }
      }
      if (strDiff(existing.statut, statutNorm)) {
        changes.statut = { avant: existing.statut, apres: statutNorm }
      }

      if (Object.keys(changes).length === 0) {
        // Aucune différence → ignorer silencieusement
        ignored++
      } else {
        const { error: insertErr } = await (supabase as any)
          .from('missions_pending')
          .insert({
            numero_quadrigis,
            type: 'update',
            candidat_nom: candidat_nom || null,
            client_nom: client_nom || null,
            metier: metier || null,
            date_debut,
            date_fin: date_fin || null,
            coefficient: Number(coefficient ?? 1),
            marge_brute: Number(marge_brute),
            statut: statutNorm,
            mission_id: existing.id,
            changes,
          })
        if (insertErr) throw insertErr
        pendingInserted++
      }
    } else {
      // ── 3. Mission inconnue → INSERT dans missions_pending (type='create') ─
      const { error: insertErr } = await (supabase as any)
        .from('missions_pending')
        .insert({
          numero_quadrigis,
          type: 'create',
          candidat_nom: candidat_nom || null,
          client_nom: client_nom || null,
          metier: metier || null,
          date_debut,
          date_fin: date_fin || null,
          coefficient: Number(coefficient ?? 1),
          marge_brute: Number(marge_brute),
          statut: statutNorm,
        })
      if (insertErr) throw insertErr
      pendingInserted++
    }

    return NextResponse.json({ pending: pendingInserted, ignored })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
