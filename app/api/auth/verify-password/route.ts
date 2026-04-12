import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/verify-password
 *
 * Vérifie les credentials email + password côté serveur SANS créer de session browser.
 * Le client admin a persistSession:false → aucun cookie auth n'est posé dans la réponse.
 *
 * Retourne { valid: true } si credentials corrects, { valid: false } sinon.
 *
 * ✅ SÉCURITÉ : Utilisé en remplacement de signInWithPassword() côté client lors du login,
 * pour éviter que le browser ait une session valide avant que l'OTP soit vérifié.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ valid: false, error: 'Paramètres manquants' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Vérifie les credentials — le client admin n'utilise pas @supabase/ssr,
    // donc aucun cookie de session n'est posé dans la réponse HTTP.
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    // Email non confirmé
    if (!data.user.email_confirmed_at) {
      return NextResponse.json({ valid: false, reason: 'email_not_confirmed' }, { status: 401 })
    }

    // Détecter si MFA TOTP est requis (session null = challenge MFA en attente)
    const needsMfa = data.session === null

    // Invalider la session créée côté serveur (best-effort, fire & forget)
    // Sans ça, une entrée existe dans auth.sessions mais ne peut pas être utilisée
    // car le browser n'a jamais reçu les tokens.
    if (data.session?.access_token) {
      supabase.auth.admin.signOut(data.session.access_token, 'global').catch(() => {})
    }

    return NextResponse.json({ valid: true, needsMfa })
  } catch {
    return NextResponse.json({ valid: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
