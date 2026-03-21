import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// POST: Ajoute la colonne import_status si absente + met tous les existants à 'a_traiter'
export async function POST() {
  const supabase = createAdminClient()

  try {
    // Ajouter la colonne si elle n'existe pas (ALTER TABLE est idempotent avec IF NOT EXISTS)
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `ALTER TABLE candidats ADD COLUMN IF NOT EXISTS import_status TEXT DEFAULT 'a_traiter'`,
    }).single()

    // Si la fonction RPC n'existe pas, on la crée d'abord
    if (alterError?.message?.includes('function') || alterError?.message?.includes('rpc')) {
      // Fallback: tester si la colonne existe en faisant une requête
      const { error: testError } = await supabase
        .from('candidats')
        .select('import_status')
        .limit(1)

      if (testError?.message?.includes('import_status')) {
        // La colonne n'existe pas — on ne peut pas l'ajouter via l'API Supabase standard
        // L'utilisateur doit l'ajouter manuellement via le SQL Editor Supabase
        return NextResponse.json({
          error: 'La colonne import_status n\'existe pas encore. Exécutez ce SQL dans Supabase SQL Editor:\n\nALTER TABLE candidats ADD COLUMN import_status TEXT DEFAULT \'a_traiter\';',
          sql: "ALTER TABLE candidats ADD COLUMN import_status TEXT DEFAULT 'a_traiter';",
        }, { status: 400 })
      }
    }

    // Mettre tous les candidats sans import_status à 'a_traiter'
    const { error: updateError, count } = await supabase
      .from('candidats')
      .update({ import_status: 'a_traiter' } as any)
      .is('import_status', null)
      .select('id', { count: 'exact', head: true })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Compter le total
    const { count: totalATraiter } = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .eq('import_status', 'a_traiter')

    return NextResponse.json({
      success: true,
      updated: count || 0,
      totalATraiter: totalATraiter || 0,
      message: `${count || 0} candidats mis à "à traiter". Total à traiter: ${totalATraiter || 0}`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET: Compter les candidats par import_status
export async function GET() {
  const supabase = createAdminClient()

  const [aTraiter, traite, archive] = await Promise.all([
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status', 'a_traiter'),
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status', 'traite'),
    supabase.from('candidats').select('*', { count: 'exact', head: true }).eq('import_status', 'archive'),
  ])

  return NextResponse.json({
    a_traiter: aTraiter.count || 0,
    traite: traite.count || 0,
    archive: archive.count || 0,
  })
}
