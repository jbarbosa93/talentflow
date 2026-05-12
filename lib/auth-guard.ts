import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Vérifie que la requête est authentifiée via Supabase Auth (cookie de session).
 * Retourne null si OK, ou une NextResponse 401 si non authentifié.
 *
 * Usage dans un route handler :
 *   const authError = await requireAuth()
 *   if (authError) return authError
 */
export async function requireAuth(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Dev : utiliser localhost:3001/admin pour poser une vraie session (voir app/admin/route.ts)
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur authentification' }, { status: 500 })
  }
}

/**
 * Vérifie l'accès aux routes /api/secretariat/*.
 * Autorisés : Secrétaire, Admin, Administrateur, OU email == ADMIN_EMAIL.
 * Retourne null si OK, 401 si non authentifié, 403 si rôle insuffisant.
 *
 * Convention alignée sur components/layout/Sidebar.tsx (isAdminUser + isSecretaire).
 */
export async function requireSecretariatAccess(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
    if (adminEmail && user.email === adminEmail) return null

    const role = (user.user_metadata as { role?: string } | null | undefined)?.role || ''
    if (role === 'Secrétaire' || role === 'Admin' || role === 'Administrateur') {
      return null
    }

    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Erreur authentification' }, { status: 500 })
  }
}
