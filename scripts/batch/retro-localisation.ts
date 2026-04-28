/**
 * Batch rétroactif extraction localisation — v1.9.107+
 *
 * Cible : candidats avec localisation IS NULL ou ''
 * Volume : ~66 candidats (Phase 1 diagnostic 27/04/2026)
 *
 * Pipeline :
 *  Path A (61 cas) : cv_texte_brut > 100 chars → 1 appel Haiku texte
 *  Path B  (5 cas) : PDF sans texte_brut → Haiku document (PDF base64)
 *
 * Coût estimé : < $0.05
 * Durée : ~2-3 min en séquentiel + délai 1s
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/retro-localisation.ts                 # DRY RUN, 10 premiers
 *   npx tsx scripts/batch/retro-localisation.ts --limit=66      # DRY RUN tous
 *   npx tsx scripts/batch/retro-localisation.ts --apply --limit=66  # vrai run
 *
 * Garde-fous :
 *   - JAMAIS écraser une localisation déjà renseignée
 *     (UPDATE ... WHERE localisation IS NULL OR localisation = '')
 *   - Catch erreurs individuelles (1 échec ≠ stop)
 *   - Rapport JSON sauvegardé en sortie
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ─── CLI args ─────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY
const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT = limitArg ? parseInt(limitArg, 10) : 10
const DELAY_MS = 1000

// ─── Clients ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SR) throw new Error('Supabase env manquant')
if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY manquant')

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

const MODEL = 'claude-haiku-4-5-20251001'

// ─── Prompt ───────────────────────────────────────────────────────────
const PROMPT_INSTRUCTION = `Tu reçois le texte d'un CV. Trouve la VILLE DE RÉSIDENCE du candidat (adresse principale, pas le lieu de travail).

Règles :
- Format : "Ville, Pays" si pays détectable, sinon juste "Ville"
- Code postal 4 chiffres (1000-9999) → Suisse
- Code postal 5 chiffres (01000-95999) → France
- Villes suisses connues (Monthey, Sion, Lausanne, Genève, Vevey, Martigny, Sierre, Fribourg, Neuchâtel...) → Suisse
- Villes françaises connues (Paris, Lyon, Annecy, Thonon, Évian, Marseille...) → France
- Ne PAS deviner si pas certain du pays — laisse juste la ville
- Si introuvable : null

Réponds UNIQUEMENT en JSON strict, rien d'autre :
{"localisation": "Monthey, Suisse"}
ou {"localisation": "Monthey"}
ou {"localisation": null}`

// ─── Path A : extraction depuis cv_texte_brut ─────────────────────────
async function extractFromText(cvText: string): Promise<string | null> {
  const truncated = cvText.slice(0, 4000) // assez pour trouver l'adresse
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `${PROMPT_INSTRUCTION}\n\nTexte du CV :\n<<<\n${truncated}\n>>>`,
    }],
  })
  const block = r.content[0]
  if (block.type !== 'text') return null
  return parseLocResponse(block.text)
}

// ─── Path B : extraction depuis PDF (Haiku document/Vision) ───────────
async function extractFromPdf(pdfBuffer: Buffer): Promise<string | null> {
  const base64 = pdfBuffer.toString('base64')
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        { type: 'text', text: PROMPT_INSTRUCTION },
      ],
    }],
  })
  const block = r.content[0]
  if (block.type !== 'text') return null
  return parseLocResponse(block.text)
}

function parseLocResponse(raw: string): string | null {
  // Extract JSON object from response (Claude sometimes adds preamble)
  const m = raw.match(/\{[^}]*"localisation"[^}]*\}/i)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0])
    if (obj.localisation === null || obj.localisation === undefined) return null
    if (typeof obj.localisation !== 'string') return null
    const cleaned = obj.localisation.trim()
    if (!cleaned) return null
    return cleaned
  } catch {
    return null
  }
}

// ─── DB ────────────────────────────────────────────────────────────────
type Candidate = {
  id: string
  nom: string | null
  prenom: string | null
  cv_url: string | null
  cv_nom_fichier: string | null
  cv_texte_brut: string | null
  localisation: string | null
}

async function fetchTargets(limit: number): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('candidats')
    .select('id, nom, prenom, cv_url, cv_nom_fichier, cv_texte_brut, localisation')
    .or('localisation.is.null,localisation.eq.')
    .not('cv_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Candidate[]
}

async function updateLocalisation(id: string, loc: string): Promise<{ updated: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from('candidats')
    .update({ localisation: loc })
    .eq('id', id)
    .or('localisation.is.null,localisation.eq.')
    .select('id')
  if (error) return { updated: false, reason: error.message }
  if (!data || data.length === 0) return { updated: false, reason: 'localisation déjà renseignée entre-temps' }
  return { updated: true }
}

// ─── Main loop ────────────────────────────────────────────────────────
type Outcome = {
  id: string
  nom: string
  prenom: string | null
  path: 'A' | 'B' | 'skip'
  type: string
  localisation: string | null
  status: 'OK' | 'NULL' | 'SKIP' | 'ERROR'
  error?: string
}

function nameLabel(c: Candidate) {
  return `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || c.id.slice(0, 8)
}

function fileExt(c: Candidate): string {
  const f = (c.cv_nom_fichier || c.cv_url || '').toLowerCase()
  if (f.endsWith('.pdf')) return 'pdf'
  if (f.endsWith('.docx')) return 'docx'
  if (f.endsWith('.doc')) return 'doc'
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'jpg'
  if (f.endsWith('.png')) return 'png'
  return 'unknown'
}

async function processOne(c: Candidate): Promise<Outcome> {
  const label = nameLabel(c)
  const type = fileExt(c)
  const hasText = !!c.cv_texte_brut && c.cv_texte_brut.length > 100

  try {
    let loc: string | null = null
    let pathUsed: 'A' | 'B' = 'A'

    if (hasText) {
      pathUsed = 'A'
      loc = await extractFromText(c.cv_texte_brut!)
    } else if (type === 'pdf' && c.cv_url) {
      pathUsed = 'B'
      const res = await fetch(c.cv_url)
      if (!res.ok) {
        return { id: c.id, nom: label, prenom: c.prenom, path: 'B', type, localisation: null, status: 'ERROR', error: `download ${res.status}` }
      }
      const buf = Buffer.from(await res.arrayBuffer())
      loc = await extractFromPdf(buf)
    } else {
      return { id: c.id, nom: label, prenom: c.prenom, path: 'skip', type, localisation: null, status: 'SKIP', error: `no text + non-PDF (${type})` }
    }

    if (!loc) {
      return { id: c.id, nom: label, prenom: c.prenom, path: pathUsed, type, localisation: null, status: 'NULL' }
    }

    if (DRY_RUN) {
      return { id: c.id, nom: label, prenom: c.prenom, path: pathUsed, type, localisation: loc, status: 'OK' }
    }

    const upd = await updateLocalisation(c.id, loc)
    if (!upd.updated) {
      return { id: c.id, nom: label, prenom: c.prenom, path: pathUsed, type, localisation: loc, status: 'SKIP', error: upd.reason }
    }
    return { id: c.id, nom: label, prenom: c.prenom, path: pathUsed, type, localisation: loc, status: 'OK' }
  } catch (e: any) {
    return { id: c.id, nom: label, prenom: c.prenom, path: 'A', type, localisation: null, status: 'ERROR', error: e?.message ?? String(e) }
  }
}

async function main() {
  console.log('━'.repeat(70))
  console.log(`Batch retro-localisation — ${DRY_RUN ? 'DRY RUN' : 'APPLY (vraies écritures DB)'}`)
  console.log(`Limite : ${LIMIT} candidat(s), délai ${DELAY_MS}ms entre chaque`)
  console.log('━'.repeat(70))

  const targets = await fetchTargets(LIMIT)
  console.log(`Cibles fetched : ${targets.length}\n`)

  const outcomes: Outcome[] = []
  let ok = 0, nullCount = 0, skip = 0, err = 0

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i]
    const r = await processOne(c)
    outcomes.push(r)

    const tag = r.status === 'OK' ? '[OK]   ' : r.status === 'NULL' ? '[NULL] ' : r.status === 'SKIP' ? '[SKIP] ' : '[ERR]  '
    const idx = String(i + 1).padStart(3, ' ')
    const right = r.status === 'OK' ? `→ "${r.localisation}" (path ${r.path}, ${r.type})`
                : r.status === 'NULL' ? `→ introuvable (path ${r.path}, ${r.type})`
                : r.status === 'SKIP' ? `→ ${r.error}`
                : `→ ${r.error}`
    console.log(`${idx}. ${tag} ${r.nom.padEnd(38)} ${right}`)

    if (r.status === 'OK') ok++
    else if (r.status === 'NULL') nullCount++
    else if (r.status === 'SKIP') skip++
    else err++

    if (i < targets.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  // Stats par path
  const pathA = outcomes.filter(o => o.path === 'A').length
  const pathB = outcomes.filter(o => o.path === 'B').length
  const okPathA = outcomes.filter(o => o.path === 'A' && o.status === 'OK').length
  const okPathB = outcomes.filter(o => o.path === 'B' && o.status === 'OK').length

  console.log('\n' + '━'.repeat(70))
  console.log(`Résultat ${DRY_RUN ? 'DRY RUN' : 'APPLY'} (${targets.length} candidats)`)
  console.log('━'.repeat(70))
  console.log(`OK    : ${ok}/${targets.length}`)
  console.log(`NULL  : ${nullCount} (introuvable dans le CV)`)
  console.log(`SKIP  : ${skip}`)
  console.log(`ERROR : ${err}`)
  console.log(`Path A (texte_brut) : ${okPathA}/${pathA} OK`)
  console.log(`Path B (PDF Vision) : ${okPathB}/${pathB} OK`)

  // Sauvegarder le rapport JSON
  const reportPath = path.join(process.cwd(), `retro-localisation-${DRY_RUN ? 'dryrun' : 'apply'}-${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify({
    dryRun: DRY_RUN,
    limit: LIMIT,
    fetched: targets.length,
    summary: { ok, null: nullCount, skip, error: err, pathA: { total: pathA, ok: okPathA }, pathB: { total: pathB, ok: okPathB } },
    outcomes,
    finishedAt: new Date().toISOString(),
  }, null, 2), 'utf8')
  console.log(`\nRapport JSON : ${reportPath}`)

  if (DRY_RUN) console.log('\n⚠️  DRY RUN — aucune écriture DB. Relancer avec --apply pour appliquer.')
}

main().catch(e => {
  console.error('FATAL', e)
  process.exit(1)
})
