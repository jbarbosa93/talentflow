// v2.8.8 — Notes partagées candidat — endpoint ADMIN (consultant L-Agence)
//
// GET    : liste toutes les notes (consultant + client) sur un candidat
// POST   : crée une note en tant que consultant
// DELETE : supprime une note (uniquement l'auteur ou admin)

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const err = await requireAuth()
  if (err) return err
  const { id } = await ctx.params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('candidat_notes_partagees' as any)
    .select('id, author_type, author_name, content, created_at, updated_at, author_user_id, client_id')
    .eq('candidat_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })

  // v2.9.80 — Enrichit chaque note avec le nom de l'entreprise (clients.nom) pour
  // l'affichage « Notes Clients » côté fiche candidat.
  const notes = (data || []) as any[]
  const clientIds = [...new Set(notes.map(n => n.client_id).filter(Boolean))] as string[]
  if (clientIds.length > 0) {
    const { data: clients } = await admin
      .from('clients' as any)
      .select('id, nom')
      .in('id', clientIds)
    const byId = new Map((clients || []).map((c: any) => [c.id, c.nom]))
    for (const n of notes) n.entreprise = n.client_id ? (byId.get(n.client_id) || null) : null
  } else {
    for (const n of notes) n.entreprise = null
  }
  return NextResponse.json({ notes })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const err = await requireAuth()
  if (err) return err
  const { id } = await ctx.params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: { content?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Note vide' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Note trop longue (max 4000 caractères)' }, { status: 413 })

  const meta = (user.user_metadata || {}) as { prenom?: string; nom?: string; full_name?: string }
  const authorName = (meta.full_name || `${meta.prenom || ''} ${meta.nom || ''}`.trim() || user.email || 'Consultant').trim()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('candidat_notes_partagees' as any)
    .insert({
      candidat_id: id,
      author_type: 'consultant',
      author_user_id: user.id,
      author_name: authorName,
      content,
    })
    .select()
    .single()
  if (error) {
    console.error('[notes-partagees] insert error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ note: data })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const err = await requireAuth()
  if (err) return err
  await ctx.params  // route param présent mais on identifie la note par id query

  const url = new URL(req.url)
  const noteId = url.searchParams.get('noteId')
  if (!noteId) return NextResponse.json({ error: 'noteId manquant' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  // Récup la note pour check ownership
  const { data: note } = await admin
    .from('candidat_notes_partagees' as any)
    .select('author_user_id, author_type')
    .eq('id', noteId)
    .maybeSingle()
  const n = note as unknown as { author_user_id?: string; author_type?: string } | null
  if (!n) return NextResponse.json({ error: 'Note introuvable' }, { status: 404 })

  // Auteur consultant peut delete sa propre note. Admin (email match) peut delete tout.
  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const isOwner = n.author_type === 'consultant' && n.author_user_id === user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Pas autorisé à supprimer cette note' }, { status: 403 })
  }

  const { error } = await admin
    .from('candidat_notes_partagees' as any)
    .delete()
    .eq('id', noteId)
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
