// POST /api/push/upload-image — Upload une image pour une notification push.
// v2.10.25 — Réservé aux consultants connectés (requireAuth). Stocke dans le bucket
// PUBLIC `notification-images` (FCM doit pouvoir charger l'URL sans auth) et renvoie
// l'URL publique HTTPS à passer dans le champ `imageUrl` de /api/push/send.
//
// SÉCURITÉ AFFICHAGE : l'image est redimensionnée + compressée (sharp) pour garantir
// qu'elle s'affiche dans la notification. Android ignore silencieusement les images
// trop lourdes (>~1 Mo) → on sort un JPEG <1 Mo, max 1024px. EXIF redressé.
// Les GIF/WebP animés perdent l'animation (la notif n'anime pas de façon fiable —
// l'animation doit vivre DANS l'app).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_INPUT = 12 * 1024 * 1024  // 12 Mo en entrée (on compresse derrière)
const TARGET_MAX_BYTES = 900 * 1024 // cible de sortie : <900 Ko (sûr pour Android)

export async function POST(req: NextRequest) {
  const unauth = await requireAuth()
  if (unauth) return unauth

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Format non supporté (JPG, PNG, WebP ou GIF)' }, { status: 400 })
  }
  if (file.size > MAX_INPUT) {
    return NextResponse.json({ error: 'Image trop lourde (max 12 Mo)' }, { status: 400 })
  }

  const input = Buffer.from(await file.arrayBuffer())

  // Redimensionne (max 1024px, sans agrandir) + compresse en JPEG jusqu'à <900 Ko.
  let out: Buffer
  try {
    const base = sharp(input, { failOn: 'none' }).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' })
    out = await base.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    if (out.length > TARGET_MAX_BYTES) out = await base.jpeg({ quality: 68, mozjpeg: true }).toBuffer()
    if (out.length > TARGET_MAX_BYTES) out = await sharp(input, { failOn: 'none' }).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 62, mozjpeg: true }).toBuffer()
  } catch {
    return NextResponse.json({ error: 'Image illisible ou corrompue' }, { status: 400 })
  }

  // Nom = hash du contenu de sortie → dédup automatique (même image = même fichier).
  const hash = createHash('sha256').update(out).digest('hex').slice(0, 24)
  const path = `notif/${hash}.jpg`

  const admin = createAdminClient()
  const { error } = await (admin as any).storage
    .from('notification-images')
    .upload(path, out, { contentType: 'image/jpeg', upsert: true })
  if (error) {
    return NextResponse.json({ error: error.message || 'Échec upload' }, { status: 500 })
  }

  const { data } = (admin as any).storage.from('notification-images').getPublicUrl(path)
  return NextResponse.json({ ok: true, url: data?.publicUrl, bytes: out.length })
}
