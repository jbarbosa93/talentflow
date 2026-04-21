// GET /api/activites/counts
// v1.9.68 — Retourne les compteurs par onglet pour afficher les badges dans /activites.
// { all: N, candidats: N, imports: N, clients: N }
// Filtres search + date_from/to respectés (sinon totals trompeurs).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// Types utilisés par chaque onglet (doivent matcher TABS dans app/(dashboard)/activites/page.tsx)
const TAB_TYPES: Record<string, string[]> = {
  candidats: ['candidat_importe','candidat_modifie','candidat_valide','candidat_fusionne','cv_importe','cv_actualise','cv_doublon','metier_assigne','note_changed'],
  imports:   ['onedrive_sync','cv_importe','cv_actualise','cv_doublon','cv_erreur','candidat_importe'],
  clients:   ['client_contacte'],
}

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const url = new URL(req.url)
  const search = (url.searchParams.get('search') || '').trim()
  const dateFrom = (url.searchParams.get('date_from') || '').trim()
  const dateTo = (url.searchParams.get('date_to') || '').trim()

  // La table `activites` n'est pas dans les types auto-générés Supabase (ajoutée en migration)
  // → cast any pour bypass l'inférence stricte.
  const supabase = (await createClient()) as any

  // Helper pour construire une requête count avec filtres communs
  const applyFilters = (q: any) => {
    let qq = q
    if (dateFrom) qq = qq.gte('created_at', dateFrom)
    if (dateTo) qq = qq.lte('created_at', dateTo)
    if (search) {
      const s = `%${search}%`
      qq = qq.or(`titre.ilike.${s},description.ilike.${s},candidat_nom.ilike.${s},client_nom.ilike.${s},user_name.ilike.${s}`)
    }
    return qq
  }

  // 4 count queries en parallèle
  const [allRes, candidatsRes, importsRes, clientsRes] = await Promise.all([
    applyFilters(supabase.from('activites').select('id', { count: 'exact', head: true })),
    applyFilters(supabase.from('activites').select('id', { count: 'exact', head: true }).in('type', TAB_TYPES.candidats)),
    applyFilters(supabase.from('activites').select('id', { count: 'exact', head: true }).in('type', TAB_TYPES.imports)),
    applyFilters(supabase.from('activites').select('id', { count: 'exact', head: true }).in('type', TAB_TYPES.clients)),
  ])

  return NextResponse.json({
    all: allRes.count ?? 0,
    candidats: candidatsRes.count ?? 0,
    imports: importsRes.count ?? 0,
    clients: clientsRes.count ?? 0,
  })
}
