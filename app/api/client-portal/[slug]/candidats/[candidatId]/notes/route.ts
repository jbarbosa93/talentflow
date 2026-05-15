// v2.8.8 — Notes partagées candidat — endpoint PUBLIC PORTAIL CLIENT
//
// GET  : liste les notes (consultant + client) sur un candidat
// POST : crée une note en tant que client (depuis le portail)
//
// SÉCURITÉ — 3 checks obligatoires (pattern #60) :
//   1. client_portals.is_active = true + slug valide
//   2. Candidat demandé EST en mission ACTIVE chez ce client
//   3. (POST) author_name requis dans le body

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function validateAccess(slug: string, candidatId: string) {
  const admin = createAdminClient()
  const { data: portal } = await (admin as any)
    .from('client_portals')
    .select('id, client_id, is_active')
    .eq('slug', slug)
    .maybeSingle()
  if (!portal) return { error: NextResponse.json({ error: 'Portail introuvable' }, { status: 404 }) }
  if (!portal.is_active) return { error: NextResponse.json({ error: 'Lien révoqué' }, { status: 410 }) }

  const todayIso = new Date().toISOString().split('T')[0]
  const { data: missions } = await (admin as any)
    .from('missions')
    .select('id, candidat_id, date_fin')
    .eq('client_id', portal.client_id)
    .eq('candidat_id', candidatId)
  const hasActiveMission = (missions || []).some((m: any) => !m.date_fin || m.date_fin >= todayIso)
  if (!hasActiveMission) {
    return { error: NextResponse.json({ error: 'Candidat non lié à ce portail' }, { status: 403 }) }
  }

  return { admin, portal }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; candidatId: string }> }) {
  const { slug, candidatId } = await ctx.params
  const access = await validateAccess(slug, candidatId)
  if (access.error) return access.error
  const { admin } = access

  const { data, error } = await admin
    .from('candidat_notes_partagees' as any)
    .select('id, author_type, author_name, content, created_at')
    .eq('candidat_id', candidatId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ notes: data || [] })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; candidatId: string }> }) {
  const { slug, candidatId } = await ctx.params
  const access = await validateAccess(slug, candidatId)
  if (access.error) return access.error
  const { admin, portal } = access

  let body: { content?: unknown; authorName?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : ''
  if (!content) return NextResponse.json({ error: 'Note vide' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Note trop longue (max 4000 caractères)' }, { status: 413 })
  if (!authorName) return NextResponse.json({ error: 'Nom de l\'auteur requis' }, { status: 400 })
  if (authorName.length > 120) return NextResponse.json({ error: 'Nom trop long' }, { status: 413 })

  const { data, error } = await admin
    .from('candidat_notes_partagees' as any)
    .insert({
      candidat_id: candidatId,
      client_id: portal.client_id,
      author_type: 'client',
      author_user_id: null,
      author_name: authorName,
      content,
    })
    .select()
    .single()
  if (error) {
    console.error('[portal/notes] insert error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ note: data })
}
