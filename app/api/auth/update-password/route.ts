// app/api/auth/update-password/route.ts
// Met à jour le mot de passe via l'API admin (pas de notification Supabase)
// puis envoie notre propre email de confirmation via Resend
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailPasswordChangedHtml } from '@/lib/email-template'

export const runtime = 'nodejs'

const RESEND_API_KEY = process.env.RESEND_API_KEY!

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe trop court (min 8 caractères)' }, { status: 400 })
    }

    // Vérifier la session de l'utilisateur
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
    }

    // Utiliser l'API admin pour changer le mot de passe → pas de notification Supabase
    const admin = createAdminClient()
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password,
    })

    if (updateError) {
      console.error('[UpdatePassword] Admin error:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Envoyer notre email de confirmation (beau template)
    if (user.email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TalentFlow <noreply@talent-flow.ch>',
          to: [user.email],
          subject: 'Votre mot de passe a été modifié — TalentFlow',
          html: emailPasswordChangedHtml(),
        }),
      }).catch((e) => console.error('[UpdatePassword] Email error:', e.message))
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[UpdatePassword] Error:', e.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
