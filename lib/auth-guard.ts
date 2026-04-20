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
