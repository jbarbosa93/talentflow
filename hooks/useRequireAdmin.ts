'use client'
// v2.0.3 — Guard client : redirige vers /parametres si l'user n'est pas admin.
// Critère identique à la sidebar / hub paramètres :
//   email == NEXT_PUBLIC_ADMIN_EMAIL  OU  user_metadata.role ∈ {Admin, Administrateur}
//
// SÉCURITÉ : c'est un guard CÔTÉ CLIENT (UX). La vraie protection reste dans les routes API
// (`requireAdmin()` → 403). Ce hook évite juste à un non-admin de voir un écran vide / 403.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

export function useRequireAdmin(redirectTo: string = '/parametres') {
  const router = useRouter()
  const { data: user, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const role = (user?.user_metadata as { role?: string } | null | undefined)?.role || ''
  const isAdmin = !!user && (
    (ADMIN_EMAIL && user.email === ADMIN_EMAIL)
    || role === 'Admin'
    || role === 'Administrateur'
  )

  useEffect(() => {
    if (isLoading) return
    if (user && !isAdmin) {
      router.replace(redirectTo)
    }
  }, [user, isLoading, isAdmin, redirectTo, router])

  return { isAdmin, isLoading }
}
