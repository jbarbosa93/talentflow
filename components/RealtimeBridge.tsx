'use client'

import { useCandidatsRealtime } from '@/hooks/useCandidats'

/**
 * v1.9.94 — Composant invisible qui monte useCandidatsRealtime au layout level.
 *
 * Pourquoi : avant, useCandidatsRealtime n'était appelé que dans CandidatsList.
 * Conséquence : quand l'user était sur /integrations en train de cliquer
 * "Synchroniser tout", le canal Supabase postgres_changes UPDATE n'était écouté
 * par personne → le handler `removeFromViewedSet(payload.new.id)` n'était pas
 * appelé → le viewedSet local restait stale → en revenant sur /candidats, le
 * badge mettait 1-3s à apparaître (le temps que ensureInit refetch /api/candidats/vus).
 *
 * Désormais : monté dans DashboardShell → toujours actif sur toutes les pages
 * dashboard. Capte les UPDATE en temps réel partout dans l'app, peu importe la
 * page courante. Bonus : capte aussi les modifs faites par d'autres consultants.
 *
 * Idempotent : un seul appel global au layout, l'appel a été retiré de CandidatsList
 * pour éviter une double souscription sur le même channel 'candidats-collab'.
 */
export default function RealtimeBridge() {
  useCandidatsRealtime()
  return null
}
