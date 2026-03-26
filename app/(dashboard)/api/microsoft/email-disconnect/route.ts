// DELETE /api/microsoft/email-disconnect
// Déconnecte le compte Outlook personnel de l'utilisateur connecté

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = createAdminClient()
    await admin
      .from('integrations')
      .update({ actif: false, updated_at: new Date().toISOString() })
      .eq('type', 'microsoft_email' as any)
      .filter('metadata->>user_id', 'eq', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
