// TalentFlow Sign — Preview PDF stampé d'un template (v2.3.16)
//
// POST /api/sign/templates/{id}/preview
// Body : { document: SignDocument }  (le document avec ses fields locaux,
//         pour permettre preview SANS sauvegarder le template)
//
// Génère un PDF stampé avec des données de TEST :
//   - text/number : "Lorem ipsum" / "42"
//   - date : aujourd'hui
//   - checkbox : true (1 sur 2 pour visualiser les 2 états)
//   - select : 1ère option
//   - formula : auto-computed
//   - fullname / firstname / lastname / email / company / title : autoFill
//   - signature / initial : trait fictif PNG (visualisation placement)
//
// Stream le PDF en inline pour visualisation iframe dans PdfPreviewModal.
// Auth admin requise.

import { NextRequest, NextResponse } from 'next/server'
import { stampPdf } from '@/lib/sign/pdf-stamp'
import { downloadSignDocument } from '@/lib/sign/storage'
import { requireAuth } from '@/lib/auth-guard'
import type { SignField, SignDocument } from '@/lib/sign/types'

export const runtime = 'nodejs'
// v2.3.17 — 60s pour gros PDFs (le rapport_heures source = 5.7 MB)
export const maxDuration = 60

// v2.3.18 — null pour signature (pas de stamp image en preview).
// L'image PNG hardcodée v2.3.16 était invalide → pdf.embedPng bloquait
// indéfiniment (timeout 60s). Pour preview, voir le CADRE des signature
// fields (rendu via le PDF source non stampé) suffit pour l'admin qui
// vérifie le placement des fields texte/date/etc.
const TEST_SIGNATURE_DATAURL: string | null = null

interface RouteCtx {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await req.json().catch(() => ({})) as { document?: SignDocument }
    const document = body.document
    if (!document) return NextResponse.json({ error: 'body.document requis' }, { status: 400 })
    if (!document.storage_path) {
      return NextResponse.json({ error: 'document.storage_path manquant' }, { status: 400 })
    }

    // 1. Download PDF source
    const blob = await downloadSignDocument(document.storage_path)
    const sourceBuf = new Uint8Array(await blob.arrayBuffer())

    // 2. Génère valeurs de test pour CHAQUE field selon son type
    const allFields: SignField[] = document.fields || []
    const fakeValues: Record<string, unknown> = {}
    let checkboxCounter = 0
    for (const f of allFields) {
      switch (f.type) {
        case 'text':
          fakeValues[f.id] = 'Lorem ipsum'
          break
        case 'number':
          fakeValues[f.id] = '42'
          break
        case 'date':
          // Si auto-fill datesigned, stampPdf prend autoFill.today, sinon notre valeur
          fakeValues[f.id] = '2026-05-09'
          break
        case 'checkbox':
          // Alterne true/false pour visualiser les 2 états
          fakeValues[f.id] = (checkboxCounter++ % 2) === 0
          break
        case 'select': {
          const items = (f.metadata?.listItems as { value: string; text: string }[] | undefined) || []
          if (items[0]) fakeValues[f.id] = items[0].value
          break
        }
        // signature/initial : non stockés dans fakeValues, gérés via signatureDataUrl global
        // formula : auto-computed par stampPdf depuis fakeValues
        // fullname/firstname/lastname/email/company/title : auto-fillé via autoFill
        default:
          break
      }
    }

    // v2.3.17 — UN SEUL stampPdf pour TOUS les fields (perf : éviter de
    // re-load le PDF en pdf-lib à chaque iteration de recipientOrder).
    // Sur un PDF source de 5.7 MB, 2 passes faisaient timeout 504 > 30s.
    // Stamp recipient 1 (autoFill = Jean Dupont). Les fields autoFill
    // type=fullname/etc des recipients 2+ recevront aussi "Jean Dupont"
    // mais c'est acceptable pour preview (vise à voir l'alignement).
    const t0 = Date.now()
    console.log('[preview] stamping', allFields.length, 'fields on', sourceBuf.length, 'B PDF')
    const currentBuf: Uint8Array = await stampPdf({
      pdfBuffer: sourceBuf,
      fields: allFields,
      fieldValues: fakeValues,
      signatureDataUrl: TEST_SIGNATURE_DATAURL,
      autoFill: {
        firstName: 'Jean',
        lastName: 'Dupont',
        fullName: 'Jean Dupont',
        email: 'jean.dupont@example.ch',
        today: '09.05.2026',
        companyName: 'L-Agence SA',
        title: 'Collaborateur',
      },
      envelopeId: `preview-${id.slice(0, 8)}`,
      recipientName: 'Aperçu de test',
      recipientEmail: 'preview@test.ch',
      signedAt: new Date(),
      signedIp: '127.0.0.1',
      addAuditFooter: false,  // pas de footer en preview
    })
    console.log('[preview] stamp done in', Date.now() - t0, 'ms')

    // 4. Stream le PDF en inline (iframe)
    const buffer = Buffer.from(currentBuf)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="preview-template.pdf"',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (e) {
    console.error('[sign/templates/preview] error', e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur serveur',
    }, { status: 500 })
  }
}
