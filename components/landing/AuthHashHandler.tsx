'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Composant invisible monté sur la landing page.
 * Détecte les hash Supabase (invitation, erreur OTP) et redirige vers /accepter-invitation.
 */
export default function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.replace('#', ''))
    const type        = params.get('type')
    const accessToken = params.get('access_token')
    const error       = params.get('error')
    const errorCode   = params.get('error_code')

    // Invitation valide → on passe le hash à /accepter-invitation pour que Supabase établisse la session
    if ((type === 'invite' || type === 'signup') && accessToken) {
      router.replace('/accepter-invitation' + window.location.hash)
      return
    }

    // Erreur (ex: otp_expired) → on redirige avec le code d'erreur
    if (error) {
      router.replace('/accepter-invitation?auth_error=' + (errorCode || error))
      return
    }
  }, [router])

  return null
}
