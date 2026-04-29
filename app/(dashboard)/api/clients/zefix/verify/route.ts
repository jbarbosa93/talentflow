// app/(dashboard)/api/clients/zefix/verify/route.ts
// v1.9.117 — Vérifie un client sur Zefix et persiste zefix_uid/zefix_status/zefix_verified_at

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { searchZefix, nameSimilarity, interpretStatus, type ZefixHit } from '@/lib/zefix'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'

export const runtime = 'nodejs'
export const maxDuration = 30

interface VerifyResult {
  found: boolean
  bestMatch: {
    name: string
    uid: string                  // CHE-XXX.XXX.XXX
    legalSeat: string
    status: string
    statusLabel: string
    isActive: boolean
    isDissolved: boolean
    isLiquidating: boolean
    cantonalExcerptUrl: string
    similarity: number
  } | null
  candidates?: Array<{ name: string; uid: string; legalSeat: string; status: string; similarity: number }>
  saved: boolean
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const clientId = (body?.clientId || '').toString().trim()
    const overrideName = (body?.name || '').toString().trim()
    const forceUid = (body?.uid || '').toString().trim()  // CHE-XXX.XXX.XXX si user choisit explicitement

    if (!clientId) {
      return NextResponse.json({ error: 'clientId requis' }, { status: 400 })
    }

    const supabase = createAdminClient() as any
    const { data: client, error: fetchErr } = await supabase
      .from('clients')
      .select('id, nom_entreprise, ville, canton')
      .eq('id', clientId)
      .single()

    if (fetchErr || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const queryName = overrideName || client.nom_entreprise
    if (!queryName) {
      return NextResponse.json({ error: 'Nom entreprise vide' }, { status: 400 })
    }

    const hits = await searchZefix(queryName, { activeOnly: false, maxEntries: 10 })

    // Si user a forcé un UID, on prend ce hit-là
    let chosen: ZefixHit | null = null
    if (forceUid) {
      const normalizedUid = forceUid.replace(/\s|-|\./g, '').toUpperCase()
      chosen = hits.find(h => h.uid === normalizedUid) || null
    }

    // Sinon best fuzzy match
    if (!chosen && hits.length > 0) {
      let bestScore = 0
      let bestHit: ZefixHit | null = null
      for (const h of hits) {
        const score = nameSimilarity(queryName, h.name)
        // Bonus si la ville Zefix correspond à la ville DB du client
        const villeBonus = client.ville && h.legalSeat
          && h.legalSeat.toLowerCase().includes((client.ville as string).toLowerCase())
          ? 5 : 0
        const adjusted = score + villeBonus
        if (adjusted > bestScore) {
          bestScore = adjusted
          bestHit = h
        }
      }
      // Seuil 75 pour être considéré comme match auto
      if (bestHit && bestScore >= 75) {
        chosen = bestHit
      }
    }

    const result: VerifyResult = {
      found: !!chosen,
      bestMatch: null,
      candidates: hits.slice(0, 5).map(h => ({
        name: h.name,
        uid: h.uidFormatted,
        legalSeat: h.legalSeat,
        status: h.status,
        similarity: nameSimilarity(queryName, h.name),
      })),
      saved: false,
    }

    if (chosen) {
      const sem = interpretStatus(chosen.status)
      result.bestMatch = {
        name: chosen.name,
        uid: chosen.uidFormatted,
        legalSeat: chosen.legalSeat,
        status: chosen.status,
        statusLabel: sem.label,
        isActive: sem.isActive,
        isDissolved: sem.isDissolved,
        isLiquidating: sem.isLiquidating,
        cantonalExcerptUrl: chosen.cantonalExcerptWeb || '',
        similarity: nameSimilarity(queryName, chosen.name),
      }

      // UPDATE DB : seulement les champs Zefix, jamais le statut client
      const { error: updErr } = await supabase
        .from('clients')
        .update({
          zefix_uid: chosen.uidFormatted,
          zefix_status: chosen.status,
          zefix_name: chosen.name,
          zefix_verified_at: new Date().toISOString(),
        })
        .eq('id', clientId)

      if (!updErr) {
        result.saved = true
        try {
          const routeUser = await getRouteUser()
          await logActivityServer({
            ...routeUser,
            type: 'client_modifie',
            titre: `Client ${client.nom_entreprise} — Zefix vérifié`,
            description: `${chosen.name} (${chosen.uidFormatted}) — ${sem.label}`,
            client_id: clientId,
            client_nom: client.nom_entreprise,
            metadata: { zefix_uid: chosen.uidFormatted, zefix_status: chosen.status },
          })
        } catch { /* non bloquant */ }
      }
    } else {
      // Pas de match : on persiste juste verified_at pour ne pas re-vérifier sans cesse
      await supabase
        .from('clients')
        .update({ zefix_verified_at: new Date().toISOString() })
        .eq('id', clientId)
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[zefix/verify]', e?.message || e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
