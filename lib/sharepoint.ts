// lib/sharepoint.ts
// Wrapper SharePoint via Microsoft Graph API
// Requiert le scope Sites.Read.All + Files.Read.All dans lib/microsoft.ts

import { callGraph } from './microsoft'

export interface SharePointSite {
  id: string
  name: string
  displayName: string
  webUrl: string
  description?: string
}

export interface SharePointDriveItem {
  id: string
  name: string
  size: number
  webUrl: string
  mimeType?: string
  createdDateTime: string
  lastModifiedDateTime: string
  folder?: { childCount: number }
  file?: { mimeType: string }
  parentReference?: { driveId: string; path: string }
}

export interface SharePointDrive {
  id: string
  name: string
  driveType: string
  webUrl: string
}

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function listerSites(accessToken: string): Promise<SharePointSite[]> {
  const data = await callGraph(accessToken, '/sites?search=*&$select=id,name,displayName,webUrl,description')
  return (data?.value || []) as SharePointSite[]
}

export async function getSite(accessToken: string, siteId: string): Promise<SharePointSite> {
  return callGraph(accessToken, `/sites/${siteId}?$select=id,name,displayName,webUrl`)
}

// ─── Drives ──────────────────────────────────────────────────────────────────

export async function listerDrives(accessToken: string, siteId: string): Promise<SharePointDrive[]> {
  const data = await callGraph(accessToken, `/sites/${siteId}/drives?$select=id,name,driveType,webUrl`)
  return (data?.value || []) as SharePointDrive[]
}

// ─── Fichiers ─────────────────────────────────────────────────────────────────

const CV_EXTENSIONS = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.txt']

function isCVFile(name: string): boolean {
  const lower = name.toLowerCase()
  return CV_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export async function listerFichiers(
  accessToken: string,
  siteId: string,
  driveId?: string,
  folderId?: string,
  filtreCVsUniquement = true
): Promise<SharePointDriveItem[]> {
  let endpoint: string

  if (driveId && folderId) {
    endpoint = `/drives/${driveId}/items/${folderId}/children`
  } else if (driveId) {
    endpoint = `/drives/${driveId}/root/children`
  } else {
    endpoint = `/sites/${siteId}/drive/root/children`
  }

  endpoint += '?$select=id,name,size,webUrl,file,folder,createdDateTime,lastModifiedDateTime,parentReference&$top=200'

  const data = await callGraph(accessToken, endpoint)
  const items = (data?.value || []) as SharePointDriveItem[]

  if (filtreCVsUniquement) {
    return items.filter(item => item.file && isCVFile(item.name))
  }

  return items
}

export async function listerFichiersRecursif(
  accessToken: string,
  siteId: string,
  driveId?: string,
  folderId?: string,
  profondeurMax = 3
): Promise<SharePointDriveItem[]> {
  if (profondeurMax <= 0) return []

  const items = await listerFichiers(accessToken, siteId, driveId, folderId, false)
  const cvFiles: SharePointDriveItem[] = []

  for (const item of items) {
    if (item.file && isCVFile(item.name)) {
      cvFiles.push(item)
    } else if (item.folder && item.folder.childCount > 0) {
      const driveIdUsed = driveId || item.parentReference?.driveId
      if (driveIdUsed) {
        const sousItems = await listerFichiersRecursif(
          accessToken,
          siteId,
          driveIdUsed,
          item.id,
          profondeurMax - 1
        )
        cvFiles.push(...sousItems)
      }
    }
  }

  return cvFiles
}

// ─── Téléchargement ───────────────────────────────────────────────────────────

export async function telechargerFichier(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<Buffer> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
    }
  )

  if (!response.ok) {
    throw new Error(`Impossible de télécharger le fichier SharePoint : ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
