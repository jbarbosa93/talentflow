// TalentFlow Sign — Upload PDF (templates ou envelopes)
// v2.2.0 — Phase 1
// v2.8.0 — Support letterhead=lagence (stamp logo + footer L-Agence page 1)
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireAuth } from '@/lib/auth-guard'
import { uploadSignDocument, type SignFolder } from '@/lib/sign/storage'
import { stampLAgenceLetterhead } from '@/lib/sign/pdf-stamp'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_FOLDERS: SignFolder[] = ['templates', 'envelopes', 'signed']
const VALID_LETTERHEADS = ['lagence'] as const

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = formData.get('folder') as string | null
    const ownerId = formData.get('ownerId') as string | null
    const letterhead = formData.get('letterhead') as string | null

    if (!file) return NextResponse.json({ error: 'file requis' }, { status: 400 })
    if (!folder || !(VALID_FOLDERS as string[]).includes(folder)) {
      return NextResponse.json({ error: 'folder invalide' }, { status: 400 })
    }
    if (!ownerId) return NextResponse.json({ error: 'ownerId requis' }, { status: 400 })

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF uniquement' }, { status: 400 })
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier > 50 MB' }, { status: 400 })
    }

    // v2.8.0 — Si letterhead=lagence, on upload DEUX versions :
    //   - path_original : PDF brut sans stamp (toujours stocké, permet de
    //     retirer le stamp côté UI en swappant juste le storage_path)
    //   - path_stamped : version avec logo + footer L-Agence stampés
    // Le client utilise storage_path = stamped par défaut, et peut revenir à
    // l'original via toggle sans nouvel appel serveur.
    const storedPathOriginal = await uploadSignDocument(folder as SignFolder, ownerId, file, file.name)
    let storedPathStamped: string | null = null

    if (letterhead && (VALID_LETTERHEADS as readonly string[]).includes(letterhead)) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer())
        const logoPath = path.join(process.cwd(), 'public', 'branding', 'l-agence-logo-noir.png')
        const logoBuffer = await readFile(logoPath)
        const stamped = await stampLAgenceLetterhead(buf, new Uint8Array(logoBuffer))
        const stampedBlob = new Blob([stamped as BlobPart], { type: 'application/pdf' })
        storedPathStamped = await uploadSignDocument(folder as SignFolder, ownerId, stampedBlob, `stamped_${file.name}`)
      } catch (e) {
        console.error('[sign/upload] letterhead stamp failed (version stampée non créée)', e)
      }
    }

    return NextResponse.json({
      path: storedPathStamped || storedPathOriginal,
      path_original: storedPathOriginal,
      path_stamped: storedPathStamped,
      name: file.name,
      size: file.size,
      letterhead: storedPathStamped ? letterhead : null,
    })
  } catch (e) {
    console.error('[sign/upload] error', e)
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 })
  }
}
