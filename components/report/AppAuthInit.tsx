'use client'

// v2.13.6 — Active l'auth par token (Authorization: Bearer) dans l'app native iOS.
// Le patch de fetch est installé DÈS le chargement du module client (avant les
// effets des pages), pour que la 1re requête authentifiée porte déjà le token.
// Hors app (navigateurs), installAppFetchAuth() est un no-op → web inchangé.

import { useEffect } from 'react'
import { installAppFetchAuth } from '@/lib/report/app-auth'

// Module-level : s'exécute à l'évaluation du bundle client, avant les useEffect des pages.
installAppFetchAuth()

export default function AppAuthInit() {
  useEffect(() => { installAppFetchAuth() }, []) // filet (idempotent)
  return null
}
