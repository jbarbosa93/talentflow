// lib/onedrive.ts
// Helper OneDrive personal drive via /me/drive — ne nécessite que Files.Read (pas admin consent)

import { callGraph } from './microsoft'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OneDriveFolder {
  id: string
  name: string
  path: string
}

export interface OneDriveFichierCV {
  id: string
  name: string
  size: number
  lastModifiedDateTime: string
  driveId: string
}

// ─── Extensions CV autorisées ───────────────────────────────────────────────

const CV_EXTENSIONS = ['pdf', 'docx', 'doc']

function isCVFile(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop()
  return CV_EXTENSIONS.includes(ext || '')
}

// ─── Fonctions ──────────────────────────────────────────────────────────────

/**
 * Liste les dossiers OneDrive personnels (racine + sous-dossiers jusqu'à profondeur 2)
 */
export async function listerDossiers(
  accessToken: string,
  folderId?: string
): Promise<OneDriveFolder[]> {
  const folders: OneDriveFolder[] = []

  // Récupère les dossiers de premier niveau
  let rootItems: any[] = []
  try {
    const endpoint = folderId
      ? `/me/drive/items/${folderId}/children?$select=id,name,folder,parentReference&$top=100`
      : `/me/drive/root/children?$select=id,name,folder,parentReference&$top=100`

    const data = await callGraph(accessToken, endpoint)
    rootItems = (data?.value || []).filter((item: any) => item.folder)
  } catch (err) {
    console.error('[OneDrive] Erreur listage dossiers racine:', err)
    return []
  }

  for (const item of rootItems) {
    const folder: OneDriveFolder = {
      id: item.id,
      name: item.name,
      path: item.name,
    }
    folders.push(folder)

    // Sous-dossiers (profondeur 2)
    try {
      const subData = await callGraph(
        accessToken,
        `/me/drive/items/${item.id}/children?$select=id,name,folder,parentReference&$top=100`
      )
      const subFolders = (subData?.value || []).filter((sub: any) => sub.folder)
      for (const sub of subFolders) {
        folders.push({
          id: sub.id,
          name: sub.name,
          path: `${item.name} › ${sub.name}`,
        })
        // Sous-sous-dossiers (profondeur 3)
        try {
          const sub2Data = await callGraph(
            accessToken,
            `/me/drive/items/${sub.id}/children?$select=id,name,folder,parentReference&$top=100`
          )
          const sub2Folders = (sub2Data?.value || []).filter((s: any) => s.folder)
          for (const s of sub2Folders) {
            folders.push({
              id: s.id,
              name: s.name,
              path: `${item.name} › ${sub.name} › ${s.name}`,
            })
          }
        } catch { /* profondeur 3 inaccessible */ }
      }
    } catch {
      // Sous-dossiers inaccessibles — on continue
    }
  }

  // Drives SharePoint partagés (même logique profondeur 3)
  try {
    const sharedDrives = await callGraph(accessToken, `/me/drives?$select=id,name,driveType&$top=50`)
    for (const drive of (sharedDrives?.value || []).filter((d: any) => d.driveType === 'business' || d.driveType === 'documentLibrary')) {
      try {
        const driveRoot = await callGraph(accessToken, `/drives/${drive.id}/root/children?$select=id,name,folder,parentReference&$top=100`)
        const driveFolders = (driveRoot?.value || []).filter((item: any) => item.folder)
        for (const item of driveFolders) {
          folders.push({ id: item.id, name: item.name, path: `${drive.name} › ${item.name}` })
          try {
            const subData = await callGraph(accessToken, `/drives/${drive.id}/items/${item.id}/children?$select=id,name,folder,parentReference&$top=100`)
            for (const sub of (subData?.value || []).filter((s: any) => s.folder)) {
              folders.push({ id: sub.id, name: sub.name, path: `${drive.name} › ${item.name} › ${sub.name}` })
            }
          } catch { /* sous-dossiers SharePoint inaccessibles */ }
        }
      } catch { /* drive inaccessible */ }
    }
  } catch { /* pas de drives partagés */ }

  return folders
}

/**
 * Liste les fichiers CV (pdf/docx/doc) dans un dossier OneDrive
 */
export async function listerFichiersCVs(
  accessToken: string,
  folderId: string
): Promise<OneDriveFichierCV[]> {
  const data = await callGraph(
    accessToken,
    `/me/drive/items/${folderId}/children?$select=id,name,size,file,folder,lastModifiedDateTime,parentReference&$top=200`
  )

  const items: any[] = data?.value || []

  return items
    .filter((item: any) => !item.folder && item.file && isCVFile(item.name || ''))
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      size: item.size || 0,
      lastModifiedDateTime: item.lastModifiedDateTime,
      driveId: item.parentReference?.driveId || '',
    }))
}

/**
 * Télécharge un fichier OneDrive et retourne un Buffer
 * Utilise fetch direct avec Authorization header (redirect: follow)
 */
export async function telechargerFichier(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<Buffer> {
  // L'endpoint /content retourne un redirect 302 vers l'URL de téléchargement réelle
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Téléchargement OneDrive ${response.status}: ${text}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
