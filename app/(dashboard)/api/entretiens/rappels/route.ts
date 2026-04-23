import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'

// GET /api/entretiens/rappels
// Retourne les rappels actifs (rappel_date <= aujourd'hui, rappel_vu = false)
export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  const supabase = createAdminClient()
  const { user_id } = await getRouteUser()
  const today = new Date().toISOString().split('T')[0]
  const startOfToday = `${today}T00:00:00.000Z`

  // v1.9.84 — Daily reminder : exclure les rappels "fermés" aujourd'hui (last_dismissed_at >= startOfToday).
  // Le rappel revient automatiquement demain. `rappel_vu = true` reste un dismiss définitif (déjà existant).
  const { data, error } = await (supabase as any)
    .from('entretiens')
    .select('id, titre, candidat_id, candidat_nom_manuel, entreprise_nom, poste, date_heure, rappel_date, last_dismissed_at, candidats(nom, prenom)')
    .eq('user_id', user_id)
    .not('rappel_date', 'is', null)
    .eq('rappel_vu', false)
    .lte('rappel_date', today)
    .or(`last_dismissed_at.is.null,last_dismissed_at.lt.${startOfToday}`)
    .order('rappel_date', { ascending: true })

  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ rappels: data || [] })
}

// PATCH /api/entretiens/rappels
// body: { id|ids, action?: 'done' | 'dismiss' }
//   action 'done'    (défaut, rétrocompat) → rappel_vu = true (terminé définitivement)
//   action 'dismiss' (v1.9.84)             → last_dismissed_at = now() (caché jusqu'à demain, daily reminder)
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const supabase = createAdminClient()
    const { user_id } = await getRouteUser()

    const ids: string[] = body.ids || (body.id ? [body.id] : [])
    if (!ids.length) return NextResponse.json({ error: 'id(s) requis' }, { status: 400 })

    const action = body.action === 'dismiss' ? 'dismiss' : 'done'
    const update = action === 'dismiss'
      ? { last_dismissed_at: new Date().toISOString() }
      : { rappel_vu: true, updated_at: new Date().toISOString() }

    const { error } = await (supabase as any)
      .from('entretiens')
      .update(update)
      .in('id', ids)
      .eq('user_id', user_id)

    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
}
