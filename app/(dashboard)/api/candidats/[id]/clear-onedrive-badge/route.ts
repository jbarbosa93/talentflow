// NEW3 — efface le badge coloré OneDrive (nouveau/reactive/mis_a_jour) à l'ouverture fiche.
// Appelé depuis /candidats/[id]/page.tsx dans le useEffect d'entrée.
// Le badge est per-candidat (pas per-user) : une fois qu'un consultant ouvre,
// les autres ne voient plus le badge coloré non plus (cohérent avec "changement vu").

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id requis' }, { status: 400 })

  try {
    const admin = createAdminClient()
    await (admin as any)
      .from('candidats')
      .update({ onedrive_change_type: null, onedrive_change_at: null })
      .eq('id', id)
      .not('onedrive_change_type', 'is', null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[clear-onedrive-badge]', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
