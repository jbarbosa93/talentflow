// GET /api/admin/app-usage
// Suivi de l'usage de l'app par les candidats (comptes portail candidat).
//
// Agrège portal_accounts (account_type='candidat') :
//   - résout le nom du candidat via report_links.candidat_id → candidats
//   - marque si le compte a au moins un push_token (notifications activées)
//   - dérive un statut d'activité par compte
//
// Lecture seule. Aucune écriture. Protégé par requireAuth().

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Fenêtre d'activité « récente » : connecté dans les 7 derniers jours = actif.
const ACTIF_WINDOW_MS = 7 * 24 * 3600 * 1000

type Statut = 'jamais_active' | 'inscrit_jamais_connecte' | 'actif' | 'inactif'

type PortalAccountRow = {
  id: string
  email: string
  report_link_id: string | null
  invited_at: string | null
  password_set_at: string | null
  last_login_at: string | null
  is_revoked: boolean
}

/**
 * Calcule le statut d'activité d'un compte :
 *  - 'jamais_active'            → mot de passe jamais défini (invitation jamais finalisée)
 *  - 'inscrit_jamais_connecte' → mdp défini mais jamais connecté
 *  - 'actif'                    → dernière connexion < 7 j
 *  - 'inactif'                  → dernière connexion ≥ 7 j
 */
function computeStatut(a: PortalAccountRow, nowMs: number): Statut {
  if (!a.password_set_at) return 'jamais_active'
  if (!a.last_login_at) return 'inscrit_jamais_connecte'
  const last = new Date(a.last_login_at).getTime()
  return nowMs - last <= ACTIF_WINDOW_MS ? 'actif' : 'inactif'
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // 1) Tous les comptes portail candidat (on inclut les révoqués dans la réponse).
    const { data: accountsRaw, error: accErr } = await (admin as any)
      .from('portal_accounts')
      .select('id, email, report_link_id, invited_at, password_set_at, last_login_at, is_revoked')
      .eq('account_type', 'candidat')
      .order('last_login_at', { ascending: false, nullsFirst: false })

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })
    const accounts: PortalAccountRow[] = accountsRaw || []

    // 2) Résout les noms en 2 requêtes (1 report_links + 1 candidats), pas de N+1.
    const reportLinkIds = Array.from(
      new Set(accounts.map(a => a.report_link_id).filter((v): v is string => !!v)),
    )

    // report_link_id → candidat_id
    const linkToCandidat = new Map<string, string>()
    if (reportLinkIds.length > 0) {
      const { data: links } = await (admin as any)
        .from('report_links')
        .select('id, candidat_id')
        .in('id', reportLinkIds)
      for (const l of (links || []) as Array<{ id: string; candidat_id: string | null }>) {
        if (l.candidat_id) linkToCandidat.set(l.id, l.candidat_id)
      }
    }

    // candidat_id → { prenom, nom }
    const candidatIds = Array.from(new Set(Array.from(linkToCandidat.values())))
    const candidatNames = new Map<string, { prenom: string | null; nom: string | null }>()
    if (candidatIds.length > 0) {
      const { data: cands } = await (admin as any)
        .from('candidats')
        .select('id, prenom, nom')
        .in('id', candidatIds)
      for (const c of (cands || []) as Array<{ id: string; prenom: string | null; nom: string | null }>) {
        candidatNames.set(c.id, { prenom: c.prenom, nom: c.nom })
      }
    }

    // 3) Notifications activées : un compte ayant au moins un push_token.
    // Pour un compte candidat, push_tokens.portal_account_id = portal_accounts.id
    // (rempli à l'enregistrement du token — voir app/api/push/register/route.ts).
    const accountsWithToken = new Set<string>()
    {
      const accountIds = accounts.map(a => a.id)
      if (accountIds.length > 0) {
        const { data: tokens } = await (admin as any)
          .from('push_tokens')
          .select('portal_account_id')
          .in('portal_account_id', accountIds)
          .not('portal_account_id', 'is', null)
        for (const t of (tokens || []) as Array<{ portal_account_id: string | null }>) {
          if (t.portal_account_id) accountsWithToken.add(t.portal_account_id)
        }
      }
    }

    // 4) Construit la liste enrichie + les KPIs.
    const nowMs = Date.now()
    const candidats = accounts.map(a => {
      const candidatId = a.report_link_id ? linkToCandidat.get(a.report_link_id) : undefined
      const info = candidatId ? candidatNames.get(candidatId) : undefined
      const nomComplet = info
        ? [info.prenom, info.nom].filter(Boolean).join(' ').trim()
        : ''
      const statut = computeStatut(a, nowMs)
      return {
        id: a.id,
        // Fallback sur l'email si le candidat n'est pas résoluble (lien sans candidat).
        nom: nomComplet || a.email,
        email: a.email,
        statut,
        last_login_at: a.last_login_at,
        invited_at: a.invited_at,
        is_revoked: a.is_revoked,
        notifs: accountsWithToken.has(a.id),
      }
    })

    const kpis = {
      total: candidats.length,
      // Compte créé = mot de passe défini (invitation finalisée).
      compte_cree: candidats.filter(c => c.statut !== 'jamais_active').length,
      // Déjà connecté = au moins une connexion enregistrée.
      deja_connecte: candidats.filter(c => c.last_login_at != null).length,
      actifs_7j: candidats.filter(c => c.statut === 'actif').length,
      jamais_active: candidats.filter(c => c.statut === 'jamais_active').length,
      notifs_actives: candidats.filter(c => c.notifs).length,
    }

    return NextResponse.json({ kpis, candidats })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
