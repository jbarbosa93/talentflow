// TalentFlow Sign — PUBLIC : contrôle Vision d'une pièce jointe candidat
// v2.9.23
//
// Après l'upload d'un fichier dans un champ `attachment`, le navigateur appelle
// cette route avec le chemin Storage. Claude Vision répond en UN appel :
//   - lisibilité du document (feedback NON-BLOQUANT au candidat)
//   - date d'expiration si présente (CI, passeport, permis…)
//
// Best-effort total : en cas d'erreur, renvoie { readable:'ok', expiryDate:null }
// → le candidat n'est jamais bloqué.

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/sign/tokens'
import { downloadSignDocument } from '@/lib/sign/storage'
import { analyzeAttachment } from '@/lib/sign/attachment-vision'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined
    const path = body.path as string | undefined
    const mimeType = (body.mimeType as string | undefined) || ''

    if (!token || !path) {
      return NextResponse.json({ ok: true, readable: 'ok', expiryDate: null })
    }

    const result = await verifyToken(token)
    if (!result.valid || !result.token) {
      return NextResponse.json({ ok: false, error: 'token invalide' }, { status: 403 })
    }
    // Sécurité : le chemin doit appartenir à l'enveloppe de ce token
    if (!path.startsWith(`uploads/${result.token.envelope_id}/`)) {
      return NextResponse.json({ ok: false, error: 'chemin non autorisé' }, { status: 403 })
    }

    const blob = await downloadSignDocument(path)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const effectiveMime = mimeType || blob.type || 'application/octet-stream'

    const analysis = await analyzeAttachment(buffer, effectiveMime)
    return NextResponse.json({ ok: true, ...analysis })
  } catch (e) {
    console.error('[sign/attachment-check] error (non-bloquant)', e)
    return NextResponse.json({ ok: true, readable: 'ok', expiryDate: null })
  }
}
