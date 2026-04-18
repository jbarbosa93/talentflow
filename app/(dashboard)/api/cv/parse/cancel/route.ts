// app/(dashboard)/api/cv/parse/cancel/route.ts
// v1.9.21 — Appelé quand l'utilisateur clique "Voir la fiche existante" dans la modale
// de confirmation (ou annule la file d'import). Nettoie le Storage orphelin + invalide
// le cache d'analyse.
//
// POST body : { storage_path: string }
//
// Side effects :
//   - Supprime l'objet du bucket Storage `cvs` (fichier uploadé par le client avant /api/cv/parse)
//   - Invalide l'entrée cache `lib/analyse-cache.ts`
//
// Non bloquant : si le fichier n'existe plus ou l'invalidation fail, on répond OK quand même.
// La finalité est cosmétique (garbage collection), pas un verrou métier.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateCachedAnalyse } from '@/lib/analyse-cache'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    const storagePath: string | undefined = body?.storage_path
    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ error: 'storage_path requis' }, { status: 400 })
    }

    // Invalide le cache (no-op si déjà expiré)
    invalidateCachedAnalyse(storagePath)

    // Supprime l'objet Storage — silencieux si absent
    try {
      const admin = createAdminClient()
      await admin.storage.from('cvs').remove([storagePath])
    } catch (storageErr) {
      console.warn('[cv/parse/cancel] Storage remove skipped:', (storageErr as Error).message)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[cv/parse/cancel] Exception:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
