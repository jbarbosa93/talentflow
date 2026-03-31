// app/(dashboard)/api/notes/route.ts
// POST /api/notes — ajouter une note sur un candidat (admin client, bypasse RLS)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRouteUser } from '@/lib/logActivity'
// Note: getRouteUser lit les cookies Supabase Auth côté serveur (next/headers)

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { candidat_id, contenu, offre_id } = await request.json()
    if (!candidat_id || !contenu?.trim()) {
      return NextResponse.json({ error: 'candidat_id et contenu requis' }, { status: 400 })
    }

    // Récupère le prénom de l'utilisateur connecté via getRouteUser (déjà testé dans logActivity)
    const { user_name } = await getRouteUser()
    // Prend uniquement le premier mot (prénom) — si fallback email, prend la partie avant @
    const rawName = user_name === 'Système' ? '' : user_name
    const auteur = rawName
      ? (rawName.includes('@') ? rawName.split('@')[0] : rawName.split(' ')[0])
      : 'Recruteur'

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('notes_candidat')
      .insert({ candidat_id, contenu: contenu.trim(), offre_id: offre_id || null, auteur })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ note: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
