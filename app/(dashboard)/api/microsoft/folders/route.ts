// app/(dashboard)/api/microsoft/folders/route.ts
// Retourne la liste des dossiers Outlook pour la configuration du dossier à surveiller

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import type { Integration } from '@/types/database'

export const runtime = 'nodejs'

// Helper: find integration by purpose with backward compat
async function findIntegration(supabase: any, purpose?: string | null) {
  const { data: allMicrosoft } = await supabase
    .from('integrations')
    .select('*')
    .eq('type', 'microsoft')
    .eq('actif', true)

  const targetPurpose = purpose || 'outlook'
  const found = (allMicrosoft || []).find((i: any) => (i.metadata as any)?.purpose === targetPurpose)
    || (allMicrosoft || []).find((i: any) => !(i.metadata as any)?.purpose) // legacy fallback

  return found as unknown as Integration | null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const purpose = searchParams.get('purpose') // 'outlook' or 'onedrive'

    const integration = await findIntegration(supabase, purpose)
    if (!integration) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Récupère les dossiers de premier niveau
    const foldersData = await callGraph(
      accessToken,
      '/me/mailFolders?$select=id,displayName,totalItemCount,unreadItemCount&$top=50'
    )

    const topFolders: any[] = foldersData?.value || []

    // Cherche aussi les sous-dossiers de la Boîte de réception
    let subFolders: any[] = []
    const inbox = topFolders.find((f: any) =>
      f.displayName?.toLowerCase() === 'boîte de réception' ||
      f.displayName?.toLowerCase() === 'inbox'
    )
    if (inbox) {
      try {
        const subData = await callGraph(
          accessToken,
          `/me/mailFolders/${inbox.id}/childFolders?$select=id,displayName,totalItemCount,unreadItemCount&$top=50`
        )
        subFolders = (subData?.value || []).map((f: any) => ({ ...f, _parent: inbox.displayName }))
      } catch { /* ignore */ }
    }

    const allFolders = [
      ...topFolders.map((f: any) => ({ ...f, _parent: null })),
      ...subFolders,
    ].filter((f: any) => f.displayName)

    return NextResponse.json({
      folders: allFolders,
      configured: (integration.metadata as any)?.email_folder_name || 'CV à traiter',
      configured_id: (integration.metadata as any)?.email_folder_id || null,
    })
  } catch (error) {
    console.error('[MS Folders]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// Met à jour le dossier surveillé
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { folder_id, folder_name, purpose } = body
    if (!folder_id || !folder_name) {
      return NextResponse.json({ error: 'folder_id et folder_name requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const integration = await findIntegration(supabase, purpose)
    if (!integration) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const currentMeta = (integration.metadata as any) || {}
    await supabase
      .from('integrations')
      .update({
        metadata: {
          ...currentMeta,
          email_folder_id: folder_id,
          email_folder_name: folder_name,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    return NextResponse.json({ success: true, folder_name, folder_id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
