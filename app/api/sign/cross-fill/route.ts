// TalentFlow Sign — v2.9.12 Cross-Template Autofill
// Route publique appelée par /sign/v/[token] au chargement.
// Pour le destinataire (identifié par son sign_token), cherche dans TOUS les
// templates qu'il a déjà signés les fields ayant une `crossTemplateKey`, et
// retourne un map { crossTemplateKey: dernièreValeurSaisie } pour pré-remplir
// les champs équivalents du template courant.
//
// Sécurité : le `token` (UUID sign_token) authentifie le destinataire — on
// ne révèle JAMAIS de valeur sans token valide. Les valeurs retournées sont
// uniquement celles du même `recipient_email` que celui du token courant.
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignDocument, SignField } from '@/lib/sign/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = String(body?.token || '').trim()
    if (!token) return NextResponse.json({ error: 'token requis' }, { status: 400 })

    const supabase = createAdminClient()

    // 1. Authentifie le token courant → récupère recipient_email
    const { data: curToken } = await (supabase as any)
      .from('sign_tokens')
      .select('id, recipient_email, envelope_id')
      .eq('id', token)
      .maybeSingle()

    if (!curToken?.recipient_email) {
      return NextResponse.json({ values: {} })
    }

    const email = (curToken.recipient_email as string).toLowerCase().trim()
    if (!email) return NextResponse.json({ values: {} })

    // 2. Cherche tous les tokens signés du même destinataire (sauf le token courant)
    const { data: signedTokens } = await (supabase as any)
      .from('sign_tokens')
      .select('id, envelope_id, field_values, signed_at')
      .ilike('recipient_email', email)
      .not('signed_at', 'is', null)
      .order('signed_at', { ascending: false }) // plus récent d'abord
      .limit(50)

    const tokens = (signedTokens || []) as Array<{
      id: string
      envelope_id: string
      field_values: Record<string, unknown> | null
      signed_at: string
    }>

    if (tokens.length === 0) return NextResponse.json({ values: {} })

    // 3. Récupère les enveloppes liées → template_id
    const envelopeIds = Array.from(new Set(tokens.map(t => t.envelope_id)))
    const { data: envelopes } = await (supabase as any)
      .from('sign_envelopes')
      .select('id, template_id')
      .in('id', envelopeIds)

    const envToTpl: Record<string, string | null> = {}
    for (const e of (envelopes || []) as Array<{ id: string; template_id: string | null }>) {
      envToTpl[e.id] = e.template_id
    }

    // 4. Récupère les templates avec leurs documents → fields
    const tplIds = Array.from(new Set(Object.values(envToTpl).filter(Boolean) as string[]))
    if (tplIds.length === 0) return NextResponse.json({ values: {} })

    const { data: templates } = await (supabase as any)
      .from('sign_templates')
      .select('id, documents')
      .in('id', tplIds)

    // Map templateId → fieldId → crossTemplateKey
    const tplFieldKey: Record<string, Record<string, string>> = {}
    for (const t of (templates || []) as Array<{ id: string; documents: SignDocument[] | null }>) {
      const map: Record<string, string> = {}
      for (const doc of (t.documents || [])) {
        for (const f of (doc.fields || []) as SignField[]) {
          if (f.crossTemplateKey && f.crossTemplateKey.trim()) {
            map[f.id] = f.crossTemplateKey.trim()
          }
        }
      }
      tplFieldKey[t.id] = map
    }

    // 5. Pour chaque token signé (plus récent d'abord), récupère les valeurs
    // pour chaque crossTemplateKey rencontré. Premier match gagne (plus récent).
    const values: Record<string, string> = {}
    for (const tok of tokens) {
      const tplId = envToTpl[tok.envelope_id]
      if (!tplId) continue
      const fieldKeyMap = tplFieldKey[tplId]
      if (!fieldKeyMap) continue
      const fv = tok.field_values || {}
      for (const [fieldId, key] of Object.entries(fieldKeyMap)) {
        if (values[key] !== undefined) continue // déjà trouvé une valeur plus récente
        const v = (fv as Record<string, unknown>)[fieldId]
        if (v === undefined || v === null || v === '') continue
        values[key] = String(v)
      }
    }

    return NextResponse.json({ values })
  } catch (e) {
    console.error('[sign/cross-fill]', e)
    return NextResponse.json({ values: {} }, { status: 200 })
  }
}
