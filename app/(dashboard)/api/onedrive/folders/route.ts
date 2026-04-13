// app/(dashboard)/api/onedrive/folders/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import { getValidAccessToken } from '@/lib/microsoft'
import { listerDossiers } from '@/lib/onedrive'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'

async function findOneDriveIntegration() {
  const supabase = createAdminClient()
  // Nouveau type d'abord, puis fallback
  let { data } = await supabase.from('integrations').select('*').eq('type', 'microsoft_onedrive').eq('actif', true).maybeSingle()
  if (!data) {
    const { data: legacy } = await supabase.from('integrations').select('*').eq('type', 'microsoft').eq('actif', true).maybeSingle()
    data = legacy
  }
  return data as unknown as Integration | null
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const integration = await findOneDriveIntegration()
    if (!integration) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const accessToken = await getValidAccessToken(integration.id)
    const folders = await listerDossiers(accessToken)
    const meta = (integration.metadata as any) || {}

    return NextResponse.json({
      folders,
      configured_id: meta.sharepoint_folder_id || null,
      configured_name: meta.sharepoint_folder_name || null,
    })
  } catch (error) {
    console.error('[OneDrive Folders GET]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const { folder_id, folder_name, toggle_auto_sync } = body
    const supabase = createAdminClient()

    const integration = await findOneDriveIntegration()
    if (!integration) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

    const currentMeta = (integration.metadata as any) || {}

    // Toggle auto-sync
    if (toggle_auto_sync !== undefined) {
      await supabase.from('integrations').update({
        metadata: { ...currentMeta, onedrive_auto_sync: toggle_auto_sync },
        updated_at: new Date().toISOString(),
      }).eq('id', integration.id)
      return NextResponse.json({ success: true, onedrive_auto_sync: toggle_auto_sync })
    }

    // Sauvegarde le dossier choisi
    if (!folder_id || !folder_name) {
      return NextResponse.json({ error: 'folder_id et folder_name requis' }, { status: 400 })
    }

    await supabase.from('integrations').update({
      metadata: { ...currentMeta, onedrive_folder_id: folder_id, onedrive_folder_name: folder_name },
      updated_at: new Date().toISOString(),
    }).eq('id', integration.id)

    return NextResponse.json({ success: true, folder_name })
  } catch (error) {
    console.error('[OneDrive Folders POST]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
