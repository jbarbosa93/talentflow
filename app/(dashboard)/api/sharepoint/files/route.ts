// app/(dashboard)/api/sharepoint/files/route.ts
// Liste les fichiers CVs disponibles dans SharePoint
// GET /api/sharepoint/files?integration_id=xxx&site_id=xxx&drive_id=xxx&folder_id=xxx&recursive=true

import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/microsoft'
import {
  listerSites,
  listerDrives,
  listerFichiers,
  listerFichiersRecursif,
} from '@/lib/sharepoint'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get('integration_id')
    const siteId = searchParams.get('site_id')
    const driveId = searchParams.get('drive_id') || undefined
    const folderId = searchParams.get('folder_id') || undefined
    const recursive = searchParams.get('recursive') === 'true'
    const mode = searchParams.get('mode') || 'files' // 'sites' | 'drives' | 'files'

    if (!integrationId) {
      return NextResponse.json(
        { error: 'integration_id requis' },
        { status: 400 }
      )
    }

    const accessToken = await getValidAccessToken(integrationId)

    // Mode : lister les sites SharePoint disponibles
    if (mode === 'sites') {
      const sites = await listerSites(accessToken)
      return NextResponse.json({ sites })
    }

    if (!siteId) {
      return NextResponse.json(
        { error: 'site_id requis (ou utilisez mode=sites pour lister les sites)' },
        { status: 400 }
      )
    }

    // Mode : lister les drives d'un site
    if (mode === 'drives') {
      const drives = await listerDrives(accessToken, siteId)
      return NextResponse.json({ drives })
    }

    // Mode : lister les fichiers CVs
    let fichiers
    if (recursive) {
      fichiers = await listerFichiersRecursif(accessToken, siteId, driveId, folderId)
    } else {
      fichiers = await listerFichiers(accessToken, siteId, driveId, folderId)
    }

    return NextResponse.json({
      total: fichiers.length,
      fichiers,
    })
  } catch (error) {
    console.error('[SharePoint Files] Erreur:', error)
    const message = error instanceof Error ? error.message : 'Erreur serveur'

    if (message.includes('introuvable') || message.includes('Reconnectez')) {
      return NextResponse.json({ error: message }, { status: 401 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
