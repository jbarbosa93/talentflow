import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// POST: Met tous les candidats sans import_status à 'a_traiter'
export async function POST() {
  const authError = await requireAuth()
  if (authError) return authError
  const supabase = createAdminClient()

  try {
    // Mettre tous les candidats sans import_status à 'a_traiter'
    await supabase
      .from('candidats')
      .update({ import_status: 'a_traiter' } as Record<string, unknown>)
      .is('import_status' as string, null)

    // Compter le total à traiter
    const { count: totalATraiter } = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .eq('import_status' as string, 'a_traiter')

    return NextResponse.json({
      success: true,
      totalATraiter: totalATraiter || 0,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: Compter les candidats par import_status
export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  const supabase = createAdminClient()

  const [aTraiter, traite, archive] = await Promise.all([
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status' as string, 'a_traiter'),
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status' as string, 'traite'),
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status' as string, 'archive'),
  ])

  return NextResponse.json({
    a_traiter: aTraiter.count || 0,
    traite: traite.count || 0,
    archive: archive.count || 0,
  })
}
