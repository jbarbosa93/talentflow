import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { invalidateSecteursCache } from '@/lib/secteurs-config-server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

// GET — Liste tous les secteurs d'activité (lecture libre, tout user authentifié)
export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('secteurs_activite_config' as any)
    .select('id, nom, ordre, metier_representatif, created_at, updated_at')
    .order('ordre', { ascending: true })
    .order('nom', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { secteurs: data || [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

// POST — Créer un nouveau secteur (admin uniquement)
export async function POST(request: NextRequest) {
  const adminError = await requireAdmin()
  if (adminError) return adminError

  try {
    const body = await request.json()
    const nom = (body.nom || '').toString().trim()
    const metierRepresentatif = (body.metier_representatif || '').toString().trim() || null
    const ordre = typeof body.ordre === 'number' ? body.ordre : 999

    if (!nom) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('secteurs_activite_config' as any)
      .insert({ nom, ordre, metier_representatif: metierRepresentatif } as any)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Un secteur avec ce nom existe déjà' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    invalidateSecteursCache()
    return NextResponse.json({ secteur: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
