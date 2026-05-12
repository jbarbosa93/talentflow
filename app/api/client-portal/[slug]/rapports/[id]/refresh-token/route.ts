// POST /api/client-portal/[slug]/rapports/[id]/refresh-token
// Régénère le client_token (et son TTL) d'une submission en attente de validation.
// v2.7.2
//
// Sécurité : slug imprévisible + portal actif + ownership client_id.
// Pas d'auth — le slug du portail prouve la légitimité du client.
//
// Renvoie : { client_token, expires_at }
// → Le front peut alors rediriger vers /report/client/{token}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_TOKEN_TTL_MS } from '@/lib/report/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params
    if (!slug || slug.length < 8 || !id) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Portal
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, is_active')
      .eq('slug', slug)
      .maybeSingle()
    if (!portal) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (!portal.is_active) return NextResponse.json({ error: 'Lien révoqué' }, { status: 410 })

    // 2. Submission + ownership
    const { data: subRow } = await (admin as any)
      .from('report_submissions')
      .select('id, status, report_link_client_id')
      .eq('id', id)
      .maybeSingle()
    if (!subRow) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })

    if (subRow.status !== 'candidate_signed') {
      return NextResponse.json({
        error: 'Ce rapport n\'est pas en attente de validation',
      }, { status: 409 })
    }

    if (!subRow.report_link_client_id) {
      return NextResponse.json({ error: 'Rapport non rattaché' }, { status: 403 })
    }

    const { data: rlc } = await (admin as any)
      .from('report_link_clients')
      .select('id, client_id')
      .eq('id', subRow.report_link_client_id)
      .maybeSingle()
    if (!rlc || rlc.client_id !== portal.client_id) {
      return NextResponse.json({ error: 'Rapport non autorisé' }, { status: 403 })
    }

    // 3. Régénère token + TTL 7j (mode remote)
    const newToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + CLIENT_TOKEN_TTL_MS.remote).toISOString()

    const { error: updErr } = await (admin as any)
      .from('report_submissions')
      .update({
        client_token: newToken,
        client_token_expires_at: expiresAt,
      })
      .eq('id', id)

    if (updErr) {
      return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
    }

    return NextResponse.json({ client_token: newToken, expires_at: expiresAt })
  } catch (e: any) {
    console.error('[client-portal/refresh-token] error', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
