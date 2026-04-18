// app/(dashboard)/api/cv/parse/confirm-match/route.ts
// v1.9.21 — Finalise un import après que l'utilisateur a choisi dans la modale
// de confirmation affichée par `/api/cv/parse` (réponse `confirmation_required`).
//
// POST body :
//   {
//     storage_path: string,           // chemin Storage retourné par cv/parse
//     action: 'update' | 'create',    // choix utilisateur
//     candidat_id?: string,            // requis si action === 'update'
//     file_name: string,
//     file_date?: string,              // ISO du lastModified
//     categorie?: string,
//     offre_id?: string,
//     mode?: 'reanalyse'               // optionnel (update)
//   }
//
// Comportement : proxy thin vers `/api/cv/parse` avec :
//   - action='update'  → update_id + skip_confirmation:true + mode (par défaut : merge)
//   - action='create'  → force_insert:true + skip_confirmation:true
//
// Le cache `lib/analyse-cache.ts` évite la re-analyse Claude si l'utilisateur
// confirme en moins de 5 min (cas standard). Au-delà : re-analyse transparente.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    const {
      storage_path,
      action,
      candidat_id,
      file_name,
      file_date,
      categorie,
      offre_id,
      mode,
    } = body || {}

    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requis' }, { status: 400 })
    }
    if (action !== 'update' && action !== 'create') {
      return NextResponse.json({ error: 'action doit être "update" ou "create"' }, { status: 400 })
    }
    if (action === 'update' && !candidat_id) {
      return NextResponse.json({ error: 'candidat_id requis pour action=update' }, { status: 400 })
    }

    // Construction du body pour le proxy vers /api/cv/parse
    const forwardBody: Record<string, any> = {
      storage_path,
      statut: 'nouveau',
      skip_confirmation: true,
      file_date: file_date || null,
    }
    if (file_name) forwardBody.file_name = file_name
    if (categorie) forwardBody.categorie = categorie
    if (offre_id) forwardBody.offre_id = offre_id

    if (action === 'update') {
      forwardBody.update_id = candidat_id
      if (mode === 'reanalyse') forwardBody.mode = 'reanalyse'
    } else {
      forwardBody.force_insert = true
    }

    // Proxy interne : relaye cookies d'auth pour requireAuth() dans cv/parse
    const origin = new URL(request.url).origin
    const cookieHeader = request.headers.get('cookie') || ''
    const res = await fetch(`${origin}/api/cv/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify(forwardBody),
    })

    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('[confirm-match] Exception:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
