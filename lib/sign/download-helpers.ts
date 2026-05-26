// TalentFlow Sign — Helpers download PDFs signés (Phase 4b)
// v2.2.5
//
// Mutualisé par /api/sign/download/[envelopeId] (auth) et
// /api/sign/download/public/[token] (lien public signataire).

import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { downloadSignDocument } from './storage'

export interface SignedPath {
  name: string
  path: string
  sha256: string
}

/**
 * Télécharge les PDFs depuis Storage et renvoie :
 *   - 1 fichier  → le PDF inline en attachment
 *   - N fichiers → un ZIP des PDFs (filename = baseFilename + .zip)
 */
export async function streamSignedPaths(
  paths: SignedPath[],
  baseFilename: string,
  options: { disposition?: 'attachment' | 'inline' } = {},
): Promise<NextResponse> {
  const safeBase = baseFilename
    .replace(/[^\p{L}\p{N}\-_. ]/gu, '_')
    .slice(0, 80) || 'document-signe'
  // v2.9.70 — Mode preview (?preview=1) : disposition=inline pour rendre dans iframe
  const disp = options.disposition === 'inline' ? 'inline' : 'attachment'

  // Single doc : renvoyer le PDF directement (UX plus simple qu'un ZIP à 1 fichier)
  if (paths.length === 1) {
    const p = paths[0]
    const blob = await downloadSignDocument(p.path)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const filename = ensurePdfExt(p.name || `${safeBase}.pdf`)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disp}; filename="${asciiSafe(filename)}"; filename*=UTF-8''${encodeRFC5987(filename)}`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-cache, no-store',
      },
    })
  }

  // Multi : ZIP
  const zip = new JSZip()
  const blobs = await Promise.all(paths.map(p => downloadSignDocument(p.path)))
  for (let i = 0; i < paths.length; i++) {
    const filename = ensurePdfExt(dedupeName(zip, paths[i].name || `document-${i + 1}.pdf`))
    zip.file(filename, await blobs[i].arrayBuffer())
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const zipName = `${safeBase}.zip`
  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiSafe(zipName)}"; filename*=UTF-8''${encodeRFC5987(zipName)}`,
      'Content-Length': String(zipBuffer.length),
      'Cache-Control': 'private, no-cache, no-store',
    },
  })
}

function ensurePdfExt(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`
}

function dedupeName(zip: JSZip, name: string): string {
  if (!zip.files[name]) return name
  const m = name.match(/^(.+?)(\.[^.]+)?$/)
  const base = m?.[1] || name
  const ext = m?.[2] || ''
  let i = 2
  while (zip.files[`${base} (${i})${ext}`]) i++
  return `${base} (${i})${ext}`
}

/** Fallback ASCII pour Content-Disposition filename (browsers anciens). */
function asciiSafe(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
}

/** RFC 5987 — encodage UTF-8 pour filename* (chars accentués). */
function encodeRFC5987(s: string): string {
  return encodeURIComponent(s)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A')
}
