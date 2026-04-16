// POST /api/offres/sync — Sync offres externes via Apify (jobs.ch, jobup.ch, Indeed CH)
// Multi-queries métier — upsert par url_source (dédup automatique)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const maxDuration = 300
export const preferredRegion = 'dub1'

// ─── Queries métier par secteur ─────────────────────────────────────────────

// Suisse romande = VS, VD, GE, FR, NE, JU + parties FR de BE
const REGION = 'Suisse romande'

const QUERIES_BATIMENT = [
  `maçon ${REGION}`,
  `électricien bâtiment ${REGION}`,
  `plombier chauffagiste ${REGION}`,
  `charpentier ${REGION}`,
  `soudeur ${REGION}`,
  `peintre bâtiment ${REGION}`,
  `carreleur ${REGION}`,
  `menuisier ${REGION}`,
  `plâtrier ${REGION}`,
  `serrurier métallier ${REGION}`,
  `grutier ${REGION}`,
  `conducteur engins chantier ${REGION}`,
  `manœuvre aide-chantier ${REGION}`,
  `désamianteur ${REGION}`,
  `monteur ${REGION}`,
  `technicien bâtiment ${REGION}`,
  `construction génie civil ${REGION}`,
]

const QUERIES_INDUSTRIE = [
  `opérateur production ${REGION}`,
  `logisticien ${REGION}`,
  `chauffeur poids lourd ${REGION}`,
  `magasinier ${REGION}`,
]

const QUERIES_TERTIAIRE = [
  `employé commerce ${REGION}`,
  `administratif ${REGION}`,
  `chef de projet ${REGION}`,
]

const QUERIES_SPECIALISE = [
  `médical soignant ${REGION}`,
  `architecte ${REGION}`,
  `ingénieur ${REGION}`,
]

const ALL_QUERIES = [
  ...QUERIES_BATIMENT,
  ...QUERIES_INDUSTRIE,
  ...QUERIES_TERTIAIRE,
  ...QUERIES_SPECIALISE,
]

// ─── Détection agence de placement ──────────────────────────────────────────

const AGENCY_KEYWORDS = [
  // International
  'interim', 'intérim', 'temporaire', 'placement', 'staffing',
  'recruiting', 'recrutement', 'randstad', 'adecco', 'manpower',
  'kelly', 'hays', 'michael page', 'page personnel', 'robert half',
  'synergie', 'gi group', 'grafton', 'hudson', 'antal',
  'agence', 'agency', 'personal', 'zeitarbeit',
  // Suisses
  'interiman', 'dpsa', 'kelly services', 'jobeo', 'aquilance',
  'l-agence', 'l\'agence', 'lagence',
  'tempco', 'temporairement', 'cdsgroup', 'cds group',
  'actua', 'flexs', 'personal sigma', 'brook street',
  'acces personnel', 'accès personnel', 'sigma valais', 'pemsa',
  'proman', 'careerplus', 'career plus', 'technic emplois',
  'swisselect', 'albedis', 'domino swiss', 'domino hr',
  'crit xpert', 'groupe crit', 'alpia', 'jörg lienert', 'jorg lienert',
  'phida', 'emco partenaires',
  'ok job', 'okjob', 'safeguard', 'valjob', 'val job', 'agap2', 'agap 2',
]

function isAgency(company: string): boolean {
  const lower = (company || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return AGENCY_KEYWORDS.some(kw => {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return lower.includes(kwNorm)
  })
}

// ─── Canton suisse depuis lieu / code postal ────────────────────────────────

const CANTON_MAP: Record<string, string> = {
  'zürich': 'ZH', 'zurich': 'ZH', 'winterthur': 'ZH',
  'bern': 'BE', 'berne': 'BE', 'biel': 'BE', 'bienne': 'BE', 'thun': 'BE', 'tavannes': 'BE',
  'luzern': 'LU', 'lucerne': 'LU',
  'uri': 'UR', 'altdorf': 'UR',
  'schwyz': 'SZ',
  'obwalden': 'OW', 'sarnen': 'OW',
  'nidwalden': 'NW', 'stans': 'NW',
  'glarus': 'GL', 'glaris': 'GL',
  'zug': 'ZG', 'zoug': 'ZG',
  'fribourg': 'FR', 'freiburg': 'FR',
  'solothurn': 'SO', 'soleure': 'SO',
  'basel': 'BS', 'bâle': 'BS',
  'schaffhausen': 'SH', 'schaffhouse': 'SH',
  'appenzell': 'AR',
  'st. gallen': 'SG', 'saint-gall': 'SG', 'st gallen': 'SG',
  'graubünden': 'GR', 'grisons': 'GR', 'chur': 'GR', 'coire': 'GR', 'davos': 'GR',
  'aarau': 'AG', 'aargau': 'AG', 'argovie': 'AG',
  'thurgau': 'TG', 'thurgovie': 'TG', 'frauenfeld': 'TG',
  'ticino': 'TI', 'tessin': 'TI', 'lugano': 'TI', 'bellinzona': 'TI', 'locarno': 'TI',
  'vaud': 'VD', 'lausanne': 'VD', 'nyon': 'VD', 'morges': 'VD', 'yverdon': 'VD', 'montreux': 'VD', 'vevey': 'VD', 'renens': 'VD',
  'valais': 'VS', 'wallis': 'VS', 'sion': 'VS', 'sierre': 'VS', 'martigny': 'VS', 'monthey': 'VS', 'visp': 'VS', 'brig': 'VS', 'zermatt': 'VS',
  'neuchâtel': 'NE', 'neuchatel': 'NE', 'neuenburg': 'NE', 'la chaux-de-fonds': 'NE',
  'genève': 'GE', 'geneve': 'GE', 'geneva': 'GE', 'genf': 'GE',
  'jura': 'JU', 'delémont': 'JU', 'delemont': 'JU',
}

function detectCanton(lieu: string): string | null {
  if (!lieu) return null
  const lower = lieu.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [city, canton] of Object.entries(CANTON_MAP)) {
    const cityNorm = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(cityNorm)) return canton
  }
  return null
}

// ─── Types normalisés ───────────────────────────────────────────────────────

interface OffreNormalisee {
  titre: string
  entreprise: string | null
  lieu: string | null
  canton: string | null
  type_contrat: string | null
  taux_occupation: string | null
  description: string | null
  competences: string[]
  salaire: string | null
  url_source: string
  source: string
  date_publication: string | null
  est_agence: boolean
}

// ─── Normalisation jobs.ch / jobup.ch ───────────────────────────────────────

function normalizeJobsCh(item: any, source: 'jobs.ch' | 'jobup.ch'): OffreNormalisee | null {
  const url = item.url || item.portalUrl
  if (!url || !item.title) return null

  const lieu = [item.place, item.zipcode].filter(Boolean).join(' ')
  const grades = item.employmentGrades
  const taux = grades?.length === 2 ? `${grades[0]}-${grades[1]}%` : null
  const types = item.employmentTypes || []

  return {
    titre: item.title,
    entreprise: item.company || null,
    lieu: lieu || null,
    canton: detectCanton(lieu) || detectCanton(item.place || ''),
    type_contrat: types[0] || null,
    taux_occupation: taux,
    description: (item.description || '').slice(0, 5000) || null,
    competences: (item.skills || []).map((s: any) => typeof s === 'string' ? s : s?.label || '').filter(Boolean),
    salaire: null,
    url_source: url,
    source,
    date_publication: item.publicationDate ? item.publicationDate.split('T')[0] : null,
    est_agence: isAgency(item.company || ''),
  }
}

// ─── Normalisation Indeed ───────────────────────────────────────────────────

function normalizeIndeed(item: any): OffreNormalisee | null {
  const url = item.url
  if (!url || !item.title) return null

  const loc = item.location || {}
  const lieu = [loc.city, loc.postalCode].filter(Boolean).join(' ')
  const employer = item.employer || {}

  const sal = item.baseSalary || {}
  const salaire = sal.min && sal.max
    ? `${sal.min}-${sal.max} ${sal.currencyCode || 'CHF'}/${sal.unitOfWork || 'an'}`
    : sal.min ? `dès ${sal.min} ${sal.currencyCode || 'CHF'}` : null

  const attrs = item.attributes || {}
  const tauxAttr = Object.values(attrs).find((v: any) => typeof v === 'string' && v.includes('%'))
  const taux = typeof tauxAttr === 'string' ? tauxAttr.replace(/^Pensum:\s*/i, '') : null

  const competences = Object.values(attrs)
    .filter((v: any) => typeof v === 'string' && !v.includes('%') && !v.includes('Fähigkeitszeugnis') && !v.includes('Berufsmaturität'))
    .map(v => v as string)

  return {
    titre: item.title,
    entreprise: employer.name || null,
    lieu: lieu || null,
    canton: detectCanton(lieu) || (loc.admin1Code ? detectCantonFromAdmin1(loc.admin1Code) : null),
    type_contrat: null,
    taux_occupation: taux,
    description: (item.description?.text || '').slice(0, 5000) || null,
    competences,
    salaire,
    url_source: url,
    source: 'indeed.ch',
    date_publication: item.datePublished ? item.datePublished.split('T')[0] : null,
    est_agence: isAgency(employer.name || ''),
  }
}

function detectCantonFromAdmin1(code: string): string | null {
  const map: Record<string, string> = {
    AG: 'AG', AI: 'AI', AR: 'AR', BE: 'BE', BL: 'BL', BS: 'BS',
    FR: 'FR', GE: 'GE', GL: 'GL', GR: 'GR', JU: 'JU', LU: 'LU',
    NE: 'NE', NW: 'NW', OW: 'OW', SG: 'SG', SH: 'SH', SO: 'SO',
    SZ: 'SZ', TG: 'TG', TI: 'TI', UR: 'UR', VD: 'VD', VS: 'VS',
    ZG: 'ZG', ZH: 'ZH',
  }
  return map[code] || null
}

// ─── Appel Apify Actor ──────────────────────────────────────────────────────

async function callApifyActor(actorId: string, input: Record<string, any>): Promise<any[]> {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) throw new Error('APIFY_API_KEY manquant')

  const actorSlug = actorId.replace('/', '~')
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${actorSlug}/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  )
  if (!runRes.ok) {
    const err = await runRes.text()
    throw new Error(`Apify run ${actorId} failed: ${runRes.status} ${err}`)
  }
  const run = await runRes.json()
  const runId = run.data?.id
  if (!runId) throw new Error(`Apify run ${actorId}: pas de runId`)

  // Polling (max 3 min)
  const deadline = Date.now() + 180_000
  let status = run.data?.status
  while (status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000))
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`)
    const statusData = await statusRes.json()
    status = statusData.data?.status
  }

  if (status !== 'SUCCEEDED') {
    console.warn(`[Apify] ${actorId} terminé avec status: ${status}`)
    return []
  }

  const datasetId = run.data?.defaultDatasetId
  if (!datasetId) return []

  const dataRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=200`
  )
  if (!dataRes.ok) return []
  return await dataRes.json()
}

// ─── Scrape une source avec une query ───────────────────────────────────────

type SourceType = 'jobs.ch' | 'jobup.ch' | 'indeed.ch'

function buildActorInput(source: SourceType, query: string): { actorId: string; input: Record<string, any>; normalize: (item: any) => OffreNormalisee | null } {
  switch (source) {
    case 'jobs.ch':
      return {
        actorId: 'blackfalcondata/jobs-ch-scraper',
        input: { query, country: 'CH', maxResults: 30, includeDetails: true, compact: false },
        normalize: (item) => normalizeJobsCh(item, 'jobs.ch'),
      }
    case 'jobup.ch':
      return {
        actorId: 'blackfalcondata/jobup-ch-scraper',
        input: { query, country: 'CH', maxResults: 30, includeDetails: true, compact: false },
        normalize: (item) => normalizeJobsCh(item, 'jobup.ch'),
      }
    case 'indeed.ch':
      return {
        actorId: 'valig/indeed-jobs-scraper',
        input: { country: 'ch', title: query, limit: 30, datePosted: '14' },
        normalize: normalizeIndeed,
      }
  }
}

// ─── Upsert batch dans Supabase ─────────────────────────────────────────────

async function upsertOffres(supabase: any, offres: OffreNormalisee[]): Promise<{ inserted: number; errors: number }> {
  let inserted = 0, errors = 0
  for (let i = 0; i < offres.length; i += 20) {
    const batch = offres.slice(i, i + 20)
    const { data, error } = await (supabase as any)
      .from('offres_externes')
      .upsert(
        batch.map((o) => ({
          titre: o.titre,
          entreprise: o.entreprise,
          lieu: o.lieu,
          canton: o.canton,
          type_contrat: o.type_contrat,
          taux_occupation: o.taux_occupation,
          description: o.description,
          competences: o.competences,
          salaire: o.salaire,
          url_source: o.url_source,
          source: o.source,
          date_publication: o.date_publication,
          est_agence: o.est_agence,
          actif: true,
          statut: 'a_traiter',
        })),
        { onConflict: 'url_source', ignoreDuplicates: false }
      )
      .select('id')

    if (error) {
      console.error(`[OffresSync] Upsert error:`, error.message)
      errors += batch.length
    } else {
      inserted += data?.length || 0
    }
  }
  return { inserted, errors }
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const authError = await requireAuth()
    if (authError) return authError
  }

  try {
    const body = await request.json().catch(() => ({}))
    const supabase = createAdminClient()

    // Mode single query (appel manuel) ou multi-queries (cron)
    const customQueries: string[] | undefined = body.queries
    const singleQuery: string | undefined = body.query
    const queries = customQueries || (singleQuery ? [singleQuery] : ALL_QUERIES)

    // Quelles sources utiliser (par défaut toutes)
    const sourcesToUse: SourceType[] = body.sources || ['jobs.ch', 'jobup.ch', 'indeed.ch']

    console.log(`[OffresSync] Démarrage — ${queries.length} queries × ${sourcesToUse.length} sources`)

    const summary: { source: string; query: string; fetched: number; inserted: number; errors: number }[] = []

    // Exécuter par groupes de 3 en parallèle (limiter les Apify actors simultanés)
    const PARALLEL = 3
    const tasks: { source: SourceType; query: string }[] = []
    for (const query of queries) {
      for (const source of sourcesToUse) {
        tasks.push({ source, query })
      }
    }

    for (let i = 0; i < tasks.length; i += PARALLEL) {
      const batch = tasks.slice(i, i + PARALLEL)
      const results = await Promise.allSettled(
        batch.map(async ({ source, query }) => {
          const { actorId, input, normalize } = buildActorInput(source, query)
          console.log(`[OffresSync] ${source} — "${query}"`)
          try {
            const items = await callApifyActor(actorId, input)
            const offres = items
              .map((item: any) => normalize(item))
              .filter((o: OffreNormalisee | null): o is OffreNormalisee => o !== null && !!o.url_source)

            const { inserted, errors } = await upsertOffres(supabase, offres)
            return { source, query, fetched: items.length, inserted, errors }
          } catch (err: any) {
            console.error(`[OffresSync] Erreur ${source} "${query}":`, err.message)
            return { source, query, fetched: 0, inserted: 0, errors: 1 }
          }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') summary.push(r.value)
      }
    }

    // Totaux
    const totalFetched = summary.reduce((s, r) => s + r.fetched, 0)
    const totalInserted = summary.reduce((s, r) => s + r.inserted, 0)
    const totalErrors = summary.reduce((s, r) => s + r.errors, 0)

    // Résumé par source
    const bySource: Record<string, { fetched: number; inserted: number; errors: number }> = {}
    for (const r of summary) {
      if (!bySource[r.source]) bySource[r.source] = { fetched: 0, inserted: 0, errors: 0 }
      bySource[r.source].fetched += r.fetched
      bySource[r.source].inserted += r.inserted
      bySource[r.source].errors += r.errors
    }

    // Log activité
    try {
      await (supabase as any).from('activites').insert({
        type: 'offres_sync',
        description: `Sync offres : ${totalInserted} nouvelles (${totalFetched} récupérées, ${queries.length} queries, ${sourcesToUse.length} sources)`,
        metadata: { bySource, queries: queries.length, totalFetched, totalInserted, totalErrors },
      })
    } catch { /* non bloquant */ }

    console.log(`[OffresSync] Terminé — ${totalInserted} insérées, ${totalFetched} récupérées, ${totalErrors} erreurs`)
    return NextResponse.json({
      success: true,
      totalFetched,
      totalInserted,
      totalErrors,
      queriesCount: queries.length,
      bySource,
    })
  } catch (err: any) {
    console.error('[OffresSync] Erreur globale:', err)
    return NextResponse.json({ error: err.message || 'Erreur sync' }, { status: 500 })
  }
}
