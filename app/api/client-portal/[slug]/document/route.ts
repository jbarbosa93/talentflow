// /api/client-portal/[slug]/document?candidat_id=…&doc_id=…&side=recto|verso
// Route PUBLIQUE (sans auth) pour servir un fichier de document compliance
// dans le contexte du portail client.
// Sécurité :
//   - Vérifie portail.is_active
//   - Vérifie que le candidat a une mission active chez le client du portail
//   - Vérifie que le document appartient bien à ce candidat
// v2.7.1

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadComplianceFile } from '@/lib/compliance/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_SIDES = new Set(['recto', 'verso'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (!slug || slug.length < 8) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    }

    const candidatId = req.nextUrl.searchParams.get('candidat_id') || ''
    const docId = req.nextUrl.searchParams.get('doc_id') || ''
    const side = req.nextUrl.searchParams.get('side') || 'recto'
    if (!candidatId || !docId) {
      return NextResponse.json({ error: 'candidat_id et doc_id requis' }, { status: 400 })
    }
    if (!ALLOWED_SIDES.has(side)) {
      return NextResponse.json({ error: 'side invalide' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Portal actif + client_id
    const { data: portal } = await (admin as any)
      .from('client_portals')
      .select('id, client_id, is_active')
      .eq('slug', slug)
      .maybeSingle()
    if (!portal) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    if (!portal.is_active) return NextResponse.json({ error: 'Lien révoqué' }, { status: 410 })

    // 2. Vérifie que le candidat est en mission active chez ce client
    const todayIso = new Date().toISOString().slice(0, 10)
    const { data: missions } = await (admin as any)
      .from('missions')
      .select('id, candidat_id, date_fin, statut')
      .eq('client_id', portal.client_id)
      .eq('candidat_id', candidatId)
      .eq('statut', 'en_cours')
    const hasActiveMission = (missions || []).some((m: any) => !m.date_fin || m.date_fin >= todayIso)
    if (!hasActiveMission) {
      return NextResponse.json({ error: 'Candidat non autorisé' }, { status: 403 })
    }

    // 3. Vérifie ownership doc + récupère le path
    const { data: doc } = await (admin as any)
      .from('candidat_documents')
      .select('id, candidat_id, file_recto_path, file_verso_path')
      .eq('id', docId)
      .eq('candidat_id', candidatId)
      .maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const path = side === 'recto' ? doc.file_recto_path : doc.file_verso_path
    if (!path) return NextResponse.json({ error: 'Fichier absent' }, { status: 404 })

    // 4. Stream
    const blob = await downloadComplianceFile(path)
    const arrayBuffer = await blob.arrayBuffer()
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const mime = ext === 'pdf' ? 'application/pdf'
               : ext === 'png' ? 'image/png'
               : ext === 'webp' ? 'image/webp'
               : 'image/jpeg'

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
