// Cron hebdomadaire (dimanche 03h UTC) — garde-fou SHA256 du stock candidats
//
// Vérifie : COUNT(candidats) WHERE cv_url IS NOT NULL AND cv_sha256 IS NULL
// Si > 0 → backfill batch 100 candidats (download cv_url, calcule SHA256+size, update DB)
//
// En régime stationnaire après v1.9.43 + backfill initial, ce cron ne devrait
// jamais trouver d'orphelins. S'il en trouve, c'est qu'un nouveau code a oublié
// d'écrire hash/size lors d'un INSERT/UPDATE → alerte dans logs Vercel.
//
// Limite 100 par exécution pour éviter les timeouts. Si plus, ils seront traités
// au cron suivant (dimanche d'après).
//
// v1.9.43

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_LIMIT = 100
const PARALLEL = 5
const FETCH_TIMEOUT_MS = 20_000

async function downloadAndHash(url: string): Promise<{ hash: string; size: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      hash: createHash('sha256').update(buf).digest('hex'),
      size: buf.length,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: Request) {
  // Auth Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const tStart = Date.now()

  // 1. Compter total orphelins (sans hash)
  const { count: totalOrphans, error: countErr } = await (supabase as any)
    .from('candidats')
    .select('id', { count: 'exact', head: true })
    .is('cv_sha256', null)
    .not('cv_url', 'is', null)

  if (countErr) {
    console.error('[Cron sha256-integrity] Count error:', countErr.message)
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }

  if (!totalOrphans || totalOrphans === 0) {
    return NextResponse.json({ ok: true, total_orphans: 0, message: 'Aucun orphelin — intégrité OK' })
  }

  // 2. Charger batch limité
  const { data: orphans, error: fetchErr } = await (supabase as any)
    .from('candidats')
    .select('id, cv_url, nom, prenom')
    .is('cv_sha256', null)
    .not('cv_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(BATCH_LIMIT)

  if (fetchErr) {
    console.error('[Cron sha256-integrity] Fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  // 3. Backfill par chunks parallèles
  let backfilled = 0, errors = 0, skipped = 0

  for (let i = 0; i < (orphans || []).length; i += PARALLEL) {
    const chunk = (orphans || []).slice(i, i + PARALLEL)
    await Promise.all(chunk.map(async (c: any) => {
      try {
        const { hash, size } = await downloadAndHash(c.cv_url)
        const { error: updErr } = await (supabase as any)
          .from('candidats')
          .update({ cv_sha256: hash, cv_size_bytes: size })
          .eq('id', c.id)
        if (updErr) errors++
        else backfilled++
      } catch (e) {
        skipped++
        console.warn(`[Cron sha256-integrity] skip ${c.id} (${c.prenom} ${c.nom}):`, e instanceof Error ? e.message : String(e))
      }
    }))
  }

  const elapsedMs = Date.now() - tStart
  const result = {
    ok: true,
    total_orphans: totalOrphans,
    backfilled,
    errors,
    skipped,
    remaining: totalOrphans - backfilled,
    elapsed_ms: elapsedMs,
  }

  // Log d'alerte si beaucoup d'orphelins (suggère un bug en amont qui n'écrit pas hash/size)
  if (totalOrphans > BATCH_LIMIT) {
    console.warn(`[Cron sha256-integrity] ⚠️ ${totalOrphans} orphelins détectés — vérifier que tous les chemins INSERT/UPDATE écrivent cv_sha256+cv_size_bytes`)
  }

  console.log('[Cron sha256-integrity]', JSON.stringify(result))
  return NextResponse.json(result)
}
