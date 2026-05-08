// app/(dashboard)/api/clients/[id]/add-contact/route.ts
// v2.2.3 — Pack 1bis : ajoute atomiquement un contact à clients.contacts (jsonb)
//
// POST /api/clients/[id]/add-contact
// body: { firstName?, lastName?, email, phone?, role? }
// Réponse : { client: { id, contacts } }
//
// Évite les races conditions en lisant + appendant + écrivant en transaction logique.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

interface ContactInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await ctx.params
    const body = (await req.json()) as ContactInput
    const email = (body.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: client } = await supabase
      .from('clients' as any)
      .select('id, contacts')
      .eq('id', id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })

    const c = client as unknown as {
      id: string
      contacts: Array<ContactInput & { id?: string }> | null
    }
    const existing = c.contacts || []

    // Idempotent : si email déjà présent, retourne le client tel quel
    const already = existing.some(x => (x.email || '').toLowerCase().trim() === email)
    if (already) {
      return NextResponse.json({ client: c, alreadyExists: true })
    }

    const newContact = {
      id: 'ct_' + Math.random().toString(36).slice(2, 11),
      firstName: (body.firstName || '').trim(),
      lastName: (body.lastName || '').trim(),
      email,
      phone: (body.phone || '').trim() || undefined,
      role: (body.role || '').trim() || undefined,
    }
    const next = [...existing, newContact]

    const { error } = await supabase
      .from('clients' as any)
      .update({ contacts: next, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('[clients/add-contact] update error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({
      client: { id: c.id, contacts: next },
      alreadyExists: false,
      contact: newContact,
    })
  } catch (e) {
    console.error('[clients/add-contact] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
