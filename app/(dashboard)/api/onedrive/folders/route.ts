// app/(dashboard)/api/onedrive/folders/route.ts
// Retourne les dossiers OneDrive disponibles + le dossier configuré
// POST: sauvegarde le dossier choisi dans l'intégration metadata

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/microsoft'
import { listerDossiers } from '@/lib/onedrive'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Fetch all active Microsoft integrations, then filter by metadata.purpose
    const { data: allMicrosoft } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'microsoft')
      .eq('actif', true)
    const integrationRaw = (allMicrosoft || []).find((i: any) => (i.metadata as any)?.purpose === 'onedrive')
      || (allMicrosoft || []).find((i: any) => !(i.metadata as any)?.purpose) // legacy fallback

    const integration = integrationRaw as unknown as Integration | null
    if (!integration) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(integration.id)
    const folders = await listerDossiers(accessToken)

    const meta = (integration.metadata as any) || {}

    return NextResponse.json({
      folders,
      configured_id: meta.onedrive_folder_id || null,
      configured_name: meta.onedrive_folder_name || null,
    })
  } catch (error) {
    console.error('[OneDrive Folders GET]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { folder_id, folder_name, toggle_auto_sync, integration_id } = body

    const supabase = createAdminClient()

    // Fetch all active Microsoft integrations, then filter by metadata.purpose
    const { data: allMicrosoftPost } = await supabase
      .from('integrations')
      .select('*')
      .eq('type', 'microsoft')
      .eq('actif', true)
    const integrationRawPost = (allMicrosoftPost || []).find((i: any) => (i.metadata as any)?.purpose === 'onedrive')
      || (allMicrosoftPost || []).find((i: any) => !(i.metadata as any)?.purpose) // legacy fallback

    const integration = integrationRawPost as unknown as Integration | null
    if (!integration) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const currentMeta = (integration.metadata as any) || {}

    // Toggle auto-sync
    if (toggle_auto_sync !== undefined) {
      await supabase
        .from('integrations')
        .update({
          metadata: { ...currentMeta, onedrive_auto_sync: toggle_auto_sync },
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
      return NextResponse.json({ success: true, onedrive_auto_sync: toggle_auto_sync })
    }

    // Sauvegarde le dossier choisi
    if (!folder_id || !folder_name) {
      return NextResponse.json({ error: 'folder_id et folder_name requis' }, { status: 400 })
    }

    await supabase
      .from('integrations')
      .update({
        metadata: {
          ...currentMeta,
          onedrive_folder_id: folder_id,
          onedrive_folder_name: folder_name,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    return NextResponse.json({ success: true, folder_id, folder_name })
  } catch (error) {
    console.error('[OneDrive Folders POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
