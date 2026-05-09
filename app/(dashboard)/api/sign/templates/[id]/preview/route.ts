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
export const maxDuration = 30

// PNG 200x60 transparent avec un trait simple (signature fictive de test).
// Base64 minimal — cadre visible avec une ondulation discrète au milieu.
// L'objectif : visualiser où la signature SERAIT placée, pas faire joli.
const TEST_SIGNATURE_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAAANq+kSAAAABmJLR0QA/wD/AP+gvaeTAAABG0lEQVR42u3UMQEAAAjDMCp/0DxoBzx0EBoXAACAv2cYCAAAEAOAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAIABABgAgAEAGACAAQAYAAABNeUFAR3qAyjAAAAAAElFTkSuQmCC'

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

    // 3. Stamp avec données de test pour TOUS les recipientOrder (1, 2, 3...)
    // Détermine les ordres présents
    const orders = Array.from(new Set(allFields.map(f => f.recipientOrder ?? 1))).sort()

    let currentBuf: Uint8Array = sourceBuf
    for (const order of orders) {
      const orderFields = allFields.filter(f => (f.recipientOrder ?? 1) === order)
      if (orderFields.length === 0) continue
      const recipLabel = order === 1 ? 'Candidat' : order === 2 ? 'Client' : `Signataire ${order}`
      currentBuf = await stampPdf({
        pdfBuffer: currentBuf,
        fields: orderFields,
        fieldValues: fakeValues,
        signatureDataUrl: TEST_SIGNATURE_DATAURL,
        autoFill: {
          firstName: order === 1 ? 'Jean' : 'Marie',
          lastName: order === 1 ? 'Dupont' : 'Martin',
          fullName: order === 1 ? 'Jean Dupont' : 'Marie Martin',
          email: order === 1 ? 'jean.dupont@example.ch' : 'marie.martin@client.ch',
          today: '09.05.2026',
          companyName: order === 1 ? 'L-Agence SA' : 'Construction Test SA',
          title: order === 1 ? 'Collaborateur' : 'Directeur RH',
        },
        envelopeId: `preview-${id.slice(0, 8)}`,
        recipientName: `${recipLabel} de test`,
        recipientEmail: 'preview@test.ch',
        signedAt: new Date(),
        signedIp: '127.0.0.1',
        addAuditFooter: false,  // pas de footer en preview
      })
    }

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
