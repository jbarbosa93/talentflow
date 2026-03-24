import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET - Liste tous les utilisateurs
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data: { users }, error } = await supabase.auth.admin.listUsers()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(users.map(u => ({
      id: u.id,
      email: u.email,
      prenom: u.user_metadata?.prenom || '',
      nom: u.user_metadata?.nom || '',
      entreprise: u.user_metadata?.entreprise || '',
      role: u.user_metadata?.role || 'Consultant',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
    })))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST - Inviter un nouvel utilisateur
export async function POST(request: NextRequest) {
  try {
    const { email, prenom, nom, role = 'Consultant', entreprise = '' } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { prenom, nom, role, entreprise },
      redirectTo: `https://www.talent-flow.ch/api/auth/callback?next=/accepter-invitation`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, user: data.user })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH - Modifier le rôle d'un utilisateur
export async function PATCH(request: NextRequest) {
  try {
    const { userId, role } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    if (!['Admin', 'Secrétaire', 'Consultant'].includes(role))
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: { user: existing }, error: fetchErr } = await supabase.auth.admin.getUserById(userId)
    if (fetchErr || !existing) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...existing.user_metadata, role },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE - Supprimer un utilisateur
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
