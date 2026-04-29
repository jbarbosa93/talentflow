// app/(dashboard)/api/clients/zefix/search/route.ts
// v1.9.117 — Recherche entreprise sur Zefix REST (sans auth) + flag déjà en DB

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { searchZefix, toSearchItem, normalizeCompanyName, nameSimilarity, type ZefixSearchItem } from '@/lib/zefix'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const name = (body?.name || '').toString().trim()
    const includeInactive = body?.includeInactive !== false  // défaut true (on veut voir radiées)

    if (!name) {
      return NextResponse.json({ error: 'name requis' }, { status: 400 })
    }

    const hits = await searchZefix(name, { activeOnly: !includeInactive, maxEntries: 15 })
    if (hits.length === 0) {
      return NextResponse.json({ results: [], count: 0 })
    }

    // Pour chaque hit : flag already_in_talentflow par fuzzy match nom
    const supabase = createAdminClient() as any
    const items: ZefixSearchItem[] = hits.map(h => toSearchItem(h, name))

    // Fetch tous les clients (id + nom + uid) pour matching côté serveur
    // (1221 lignes max → < 100 KB, très rapide)
    const { data: dbClients } = await supabase
      .from('clients')
      .select('id, nom_entreprise, zefix_uid')

    if (Array.isArray(dbClients) && dbClients.length > 0) {
      for (const item of items) {
        // Match exact par UID en priorité
        const byUid = item.uid ? dbClients.find((c: any) => c.zefix_uid === item.uid) : null
        if (byUid) {
          item.alreadyInTalentflow = { id: byUid.id, nom_entreprise: byUid.nom_entreprise }
          continue
        }
        // Sinon match nom fuzzy ≥ 88
        let bestMatch: any = null
        let bestScore = 0
        for (const c of dbClients) {
          const score = nameSimilarity(item.name, c.nom_entreprise || '')
          if (score > bestScore) {
            bestScore = score
            bestMatch = c
          }
        }
        if (bestMatch && bestScore >= 88) {
          item.alreadyInTalentflow = { id: bestMatch.id, nom_entreprise: bestMatch.nom_entreprise }
        }
      }
    }

    // Tri : actifs en premier, puis par similarity desc
    items.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return b.similarity - a.similarity
    })

    return NextResponse.json({ results: items, count: items.length })
  } catch (e: any) {
    console.error('[zefix/search]', e?.message || e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
