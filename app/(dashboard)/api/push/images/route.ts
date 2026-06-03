// /api/push/images — Bibliothèque d'images de notification réutilisables.
// v2.10.25 — GET : liste les images déjà envoyées (bucket public notification-images).
//            DELETE ?path=notif/xxx.jpg : supprime une image de la bibliothèque.
// Réservé aux consultants connectés (requireAuth).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const admin = createAdminClient()
  const { data, error } = await (admin as any).storage
    .from('notification-images')
    .list('notif', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) return NextResponse.json({ images: [] })

  const images = (data || [])
    .filter((o: any) => o.name && !o.name.startsWith('.'))
    .map((o: any) => {
      const path = `notif/${o.name}`
      const { data: pub } = (admin as any).storage.from('notification-images').getPublicUrl(path)
      return { path, url: pub?.publicUrl, name: o.name }
    })
  return NextResponse.json({ images })
}

export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const path = new URL(req.url).searchParams.get('path') || ''
  if (!path.startsWith('notif/')) {
    return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await (admin as any).storage.from('notification-images').remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
