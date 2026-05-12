// GET /api/document-types — Catalogue des types de documents (compliance)
// v2.5.0

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getAllDocumentTypes } from '@/lib/compliance/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const types = await getAllDocumentTypes()
    return NextResponse.json({ document_types: types })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
