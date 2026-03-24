import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { statut } = await request.json()

  if (!['en_attente', 'approuve', 'refuse'].includes(statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Si approbation → envoyer l'invitation par email (création de compte)
  if (statut === 'approuve') {
    // Récupérer les infos de la demande
    const { data: demande, error: fetchErr } = await supabase
      .from('demandes_acces')
      .select('prenom, nom, entreprise, email')
      .eq('id', id)
      .single()

    if (fetchErr || !demande) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    }

    // Envoyer l'invitation Supabase → email avec lien vers /accepter-invitation
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(demande.email, {
      data: {
        prenom:     demande.prenom,
        nom:        demande.nom,
        entreprise: demande.entreprise,
        role:       'Consultant',
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/accepter-invitation`,
    })

    // Si l'utilisateur existe déjà → on ignore l'erreur d'invitation et on approuve quand même
    if (inviteErr && !inviteErr.message.toLowerCase().includes('already')) {
      return NextResponse.json({ error: `Invitation échouée : ${inviteErr.message}` }, { status: 500 })
    }
  }

  // Mettre à jour le statut dans la table
  const { error } = await supabase
    .from('demandes_acces')
    .update({ statut })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
