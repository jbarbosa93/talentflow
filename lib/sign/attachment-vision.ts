// TalentFlow Sign — Analyse Vision d'une pièce jointe candidat
// v2.9.23
//
// UN seul appel Claude Vision par fichier chargé, qui répond à 2 questions :
//   1. Lisibilité du document → feedback NON-BLOQUANT au candidat
//   2. Date d'expiration si le document en a une (CI, passeport, permis…)
//
// Politique : best-effort total. Toute erreur (clé absente, réseau, parsing)
// → { readable: 'ok', expiryDate: null }. Le candidat n'est JAMAIS bloqué.

import Anthropic from '@anthropic-ai/sdk'

export interface AttachmentAnalysis {
  /** Lisibilité estimée — 'ok' par défaut (tolérant) */
  readable: 'ok' | 'poor' | 'unreadable'
  /** Date d'expiration extraite (ISO yyyy-MM-dd) ou null si absente / incertaine */
  expiryDate: string | null
}

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const PROMPT = `Tu analyses la photo ou le scan d'un document officiel chargé par un candidat (carte d'identité, passeport, permis de conduire, permis de séjour, carte AVS, attestation, diplôme, etc.).

Réponds UNIQUEMENT avec un objet JSON strict, sans aucun texte autour :
{"readable": "ok" | "poor" | "unreadable", "expiryDate": "YYYY-MM-DD" | null}

- "readable" : qualité de lecture.
  - "ok" : document lisible (textes et dates déchiffrables).
  - "poor" : difficile à lire (flou léger, sombre, reflets) mais le contenu se devine.
  - "unreadable" : vraiment inexploitable (très flou, coupé, illisible, ou ce n'est pas un document).
  Sois TOLÉRANT : ne mets "unreadable" QUE si le document est réellement inexploitable. En cas de doute, mets "poor", jamais "unreadable".
- "expiryDate" : la date d'expiration / de validité / d'échéance du document, si elle est clairement visible ET que tu es SÛR de la lire correctement. Format YYYY-MM-DD.
  Si le document n'a pas de date d'expiration, ou si tu as le moindre doute → null. Ne devine JAMAIS une date.`

export async function analyzeAttachment(
  buffer: Buffer,
  mimeType: string,
): Promise<AttachmentAnalysis> {
  const fallback: AttachmentAnalysis = { readable: 'ok', expiryDate: null }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback

  const isPdf = mimeType === 'application/pdf'
  const isImage = IMAGE_MIME.has(mimeType)
  if (!isPdf && !isImage) return fallback

  try {
    const anthropic = new Anthropic({ apiKey })
    const base64 = buffer.toString('base64')

    const docBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: base64,
          },
        }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [docBlock, { type: 'text', text: PROMPT }],
      }],
    })

    const textBlock = response.content.find(c => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return fallback

    const raw = textBlock.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    const parsed = JSON.parse(raw) as { readable?: string; expiryDate?: string | null }

    const readable: AttachmentAnalysis['readable'] =
      parsed.readable === 'unreadable' ? 'unreadable'
      : parsed.readable === 'poor' ? 'poor'
      : 'ok'

    let expiryDate: string | null = null
    if (typeof parsed.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) {
      // Garde-fou : date plausible (pas avant 2000, pas après +50 ans)
      const y = Number(parsed.expiryDate.slice(0, 4))
      if (y >= 2000 && y <= new Date().getFullYear() + 50) expiryDate = parsed.expiryDate
    }

    return { readable, expiryDate }
  } catch (e) {
    console.warn('[attachment-vision] analyse échouée (non-bloquant)', e)
    return fallback
  }
}
