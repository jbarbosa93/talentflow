// GET + POST /api/admin/client-portals — Gestion des portails clients
// v2.7.0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePortalSlug } from '@/lib/compliance/slug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, slug, name, is_active, auth_required, created_at, last_accessed_at, clients!client_id(nom_entreprise)')
      .order('created_at', { ascending: false })
    if (error) throw error

    const portals = (data || []).map((p: any) => ({
      ...p,
      client_name: p.clients?.nom_entreprise || null,
      clients: undefined,
    }))
    return NextResponse.json({ portals })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const clientId = String(body.client_id || '').trim()
    let name = String(body.name || '').trim()
    if (!clientId) return NextResponse.json({ error: 'client_id requis' }, { status: 400 })

    const admin = createAdminClient()

    // Verify client + auto-name if not provided
    const { data: client } = await (admin as any)
      .from('clients')
      .select('id, nom_entreprise')
      .eq('id', clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    if (!name) name = `L-AGENCE SA — ${client.nom_entreprise}`

    const slug = await generatePortalSlug()
    const { data, error } = await (admin as any)
      .from('client_portals')
      .insert({
        client_id: clientId,
        slug,
        name: name.slice(0, 200),
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ portal: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
