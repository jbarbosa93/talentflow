// TalentFlow Sign — Import depuis JSON DocuSign
// v2.2.0 — Phase 2
//
// Body : multipart/form-data avec un champ `file` = le JSON DocuSign.
// 1) Parse le JSON
// 2) Crée le template (INSERT vide pour récupérer l'ID)
// 3) Décode chaque PDF base64, lit ses dimensions via pdf-lib
// 4) Upload les PDFs dans Storage talentflow-sign/templates/{templateId}/
// 5) UPDATE le template avec documents[] (fields normalisés 0-1) + recipients_schema
// 6) Retourne { templateId, documentsCount, fieldsCount }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'
import {
  parseDocusignJson,
  buildSignDocuments,
} from '@/lib/sign/docusign-import'
import { buildWizardSteps } from '@/lib/sign/wizard-builder'
import { uploadSignDocument } from '@/lib/sign/storage'
import { PDFDocument } from 'pdf-lib'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    // ─── 1. Lecture du JSON ───
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'file requis' }, { status: 400 })
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'JSON > 50 MB' }, { status: 400 })
    }
    const text = await file.text()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    // ─── 2. Parse DocuSign ───
    let parsed
    try {
      parsed = parseDocusignJson(raw)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur parsing'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // ─── 3. Création template (INSERT vide pour avoir l'ID stable) ───
    const server = await createServerClient()
    const { data: { user } } = await server.auth.getUser()
    const supabase = createAdminClient()

    const { data: tpl, error: insErr } = await supabase
      .from('sign_templates' as any)
      .insert({
        name: parsed.templateName,
        description: parsed.templateDescription,
        documents: [],
        recipients_schema: parsed.recipientsSchema,
        created_by: user?.id || null,
      })
      .select('id')
      .single()

    if (insErr || !tpl) {
      console.error('[sign/import] insert template error', insErr)
      return NextResponse.json({ error: 'Erreur création template' }, { status: 500 })
    }
    const templateId = (tpl as unknown as { id: string }).id

    // ─── 4. Pour chaque doc : décode b64, lit dims pdf-lib, upload ───
    const storagePathByOrderKey = new Map<string, string>()
    const dimsByDocAndPage = new Map<string, Map<number, { width: number; height: number }>>()

    for (const doc of parsed.documents) {
      if (!doc.base64) {
        console.warn('[sign/import] document sans base64', doc.name)
        continue
      }
      // Décodage base64 → Buffer
      const buf = Buffer.from(doc.base64, 'base64')

      // Lecture dimensions via pdf-lib
      let pdfDims = new Map<number, { width: number; height: number }>()
      try {
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
        pdfDoc.getPages().forEach((p, i) => {
          const { width, height } = p.getSize()
          pdfDims.set(i + 1, { width, height })
        })
      } catch (e) {
        console.warn('[sign/import] pdf-lib read failed pour', doc.name, e)
        // Fallback : 1 page A4
        pdfDims.set(1, { width: 595, height: 842 })
      }
      dimsByDocAndPage.set(doc.docOrderKey, pdfDims)

      // Upload dans templates/{templateId}/{filename}
      try {
        const blob = new Blob([buf], { type: 'application/pdf' })
        const path = await uploadSignDocument('templates', templateId, blob, doc.name)
        storagePathByOrderKey.set(doc.docOrderKey, path)
      } catch (e) {
        console.error('[sign/import] upload failed pour', doc.name, e)
        // On rollback : delete template + return erreur
        await supabase.from('sign_templates' as any).delete().eq('id', templateId)
        const msg = e instanceof Error ? e.message : 'Erreur upload'
        return NextResponse.json({ error: `Upload PDF échoué : ${msg}` }, { status: 500 })
      }
    }

    // ─── 5. Build documents jsonb final + UPDATE ───
    const documents = buildSignDocuments(
      parsed,
      storagePathByOrderKey,
      dimsByDocAndPage,
      () => randomUUID(),
    )

    // v2.2.0 Phase 4a-bis-2 — Auto-build des étapes wizard pour le 1er signer.
    // (les wizard_steps sont génériques pour le recipient #1, qu'on suppose
    // être le candidat. Si plusieurs signers avec champs différents, l'admin
    // pourra éditer/recréer les steps via l'éditeur de template.)
    const wizardSteps = buildWizardSteps(documents, 1)

    const { error: updErr } = await supabase
      .from('sign_templates' as any)
      .update({ documents, wizard_steps: wizardSteps })
      .eq('id', templateId)

    if (updErr) {
      console.error('[sign/import] update template error', updErr)
      return NextResponse.json({ error: 'Erreur finalisation template' }, { status: 500 })
    }

    // ─── 6. Retour ───
    return NextResponse.json({
      templateId,
      documentsCount: documents.length,
      fieldsCount: parsed.fieldsCount,
      recipientsCount: parsed.recipientsSchema.length,
    })
  } catch (e) {
    console.error('[sign/import] unhandled', e)
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
