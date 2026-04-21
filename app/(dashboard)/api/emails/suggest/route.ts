// GET /api/emails/suggest
// v1.9.70 — Retourne la liste complète des emails connus pour l'autocomplete
// style Outlook dans le champ "Destinataires" du mailing.
//
// Sources agrégées (dédupliquées) :
// 1. Contacts clients (clients.contacts[].email) + client.email principal si existe
// 2. Team TalentFlow (auth.users via profiles — sans mot de passe)
// 3. Destinataires récents (emails_envoyes.destinataire des 30 derniers jours)
//
// Pas de candidats (décision produit : mailing cible les clients).
// Limité à 2000 résultats max (suffisant pour le stock actuel ~3000 contacts clients).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

type Suggestion = {
  email: string
  label: string       // "Pierre Dupont — Acme SA"
  type: 'client' | 'team' | 'recent'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(_req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()
  const map = new Map<string, Suggestion>()

  const addSuggestion = (email: string | null | undefined, label: string, type: Suggestion['type']) => {
    if (!email) return
    const clean = email.trim().toLowerCase()
    if (!clean || !EMAIL_RE.test(clean)) return
    // Priorité : client > team > recent. Ne remplace pas une suggestion de priorité supérieure.
    const existing = map.get(clean)
    if (existing) {
      const order = { client: 3, team: 2, recent: 1 }
      if (order[existing.type] >= order[type]) return
    }
    map.set(clean, { email: clean, label, type })
  }

  // 1. Clients + contacts
  try {
    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('nom_entreprise, email, contacts')
      .eq('statut', 'actif')
      .limit(2000)
    for (const c of (clients ?? [])) {
      const entreprise = c.nom_entreprise || ''
      if (c.email) addSuggestion(c.email, entreprise || c.email, 'client')
      for (const ct of (c.contacts ?? [])) {
        const label = [ct?.prenom, ct?.nom].filter(Boolean).join(' ').trim()
        const full = [label, entreprise].filter(Boolean).join(' — ') || ct?.email || ''
        addSuggestion(ct?.email, full, 'client')
      }
    }
  } catch (e: any) {
    console.warn('[emails/suggest] clients error:', e?.message)
  }

  // 2. Team (auth.users)
  try {
    const { data: team } = await (supabase as any).auth.admin.listUsers({ perPage: 100 })
    for (const u of (team?.users ?? [])) {
      const meta = u.user_metadata || {}
      const prenom = meta.prenom || meta.full_name || meta.name || ''
      addSuggestion(u.email, prenom ? `${prenom} (team)` : 'Team TalentFlow', 'team')
    }
  } catch (e: any) {
    console.warn('[emails/suggest] team error:', e?.message)
  }

  // 3. Destinataires récents (30 jours) — pour les emails qui ne sont pas dans la table clients
  try {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await (supabase as any)
      .from('emails_envoyes')
      .select('destinataire, client_nom, user_name')
      .eq('canal', 'email')
      .gte('created_at', sinceIso)
      .limit(500)
    for (const r of (recent ?? [])) {
      const label = r.client_nom || 'Destinataire récent'
      addSuggestion(r.destinataire, label, 'recent')
    }
  } catch (e: any) {
    console.warn('[emails/suggest] recent error:', e?.message)
  }

  const suggestions = Array.from(map.values())
    .sort((a, b) => {
      // Ordre : client > team > recent, puis alphabétique
      const order = { client: 0, team: 1, recent: 2 }
      if (a.type !== b.type) return order[a.type] - order[b.type]
      return a.email.localeCompare(b.email)
    })
    .slice(0, 5000)

  return NextResponse.json({ suggestions, count: suggestions.length })
}
