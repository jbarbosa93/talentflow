#!/usr/bin/env node
// scripts/backfill-cv-sha256.mjs
//
// Calcule cv_sha256 + cv_size_bytes pour tous les candidats existants
// avec cv_url non-null et cv_sha256 null.
//
// One-shot après déploiement v1.9.43. Une fois exécuté, le stock historique
// (6053 fiches pré-v1.9.42) sera complètement backfillé → toute re-import
// d'un même CV sera correctement classé "reactivated" (pas "updated").
//
// Usage : node --env-file=.env.local scripts/backfill-cv-sha256.mjs
// Durée estimée : ~10 min pour 6000 candidats

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis')
  console.error('   Lance avec : node --env-file=.env.local scripts/backfill-cv-sha256.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

const BATCH_SIZE = 100
const PARALLEL = 8
const TIMEOUT_MS = 30_000

async function downloadAndHash(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const hash = createHash('sha256').update(buf).digest('hex')
    return { hash, size: buf.length }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  console.log('🚀 Backfill cv_sha256 + cv_size_bytes')
  console.log(`   Project: ${SUPABASE_URL}`)
  console.log(`   Batch: ${BATCH_SIZE}, Parallel: ${PARALLEL}\n`)

  // Compter total
  const { count: totalOrphans, error: countErr } = await supabase
    .from('candidats')
    .select('id', { count: 'exact', head: true })
    .is('cv_sha256', null)
    .not('cv_url', 'is', null)

  if (countErr) {
    console.error('❌ Count failed:', countErr.message)
    process.exit(1)
  }

  console.log(`📊 ${totalOrphans} candidats à backfiller\n`)
  if (totalOrphans === 0) {
    console.log('✅ Rien à faire')
    return
  }

  let processed = 0, errors = 0, skipped = 0
  const tStart = Date.now()

  while (true) {
    const { data: candidats, error } = await supabase
      .from('candidats')
      .select('id, cv_url, nom, prenom')
      .is('cv_sha256', null)
      .not('cv_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(BATCH_SIZE)

    if (error) {
      console.error('❌ Fetch batch:', error.message)
      break
    }
    if (!candidats || candidats.length === 0) break

    // Process en parallèle par chunks
    for (let i = 0; i < candidats.length; i += PARALLEL) {
      const chunk = candidats.slice(i, i + PARALLEL)
      await Promise.all(chunk.map(async (c) => {
        try {
          const { hash, size } = await downloadAndHash(c.cv_url)
          const { error: updErr } = await supabase
            .from('candidats')
            .update({ cv_sha256: hash, cv_size_bytes: size })
            .eq('id', c.id)
          if (updErr) {
            console.error(`❌ ${c.prenom} ${c.nom} (${c.id}): UPDATE ${updErr.message}`)
            errors++
          } else {
            processed++
          }
        } catch (e) {
          console.warn(`⚠️  ${c.prenom} ${c.nom} (${c.id}): ${e.message}`)
          skipped++
        }
      }))
    }

    const elapsed = ((Date.now() - tStart) / 1000).toFixed(0)
    const rate = (processed / (Date.now() - tStart) * 1000).toFixed(1)
    const remaining = totalOrphans - processed - errors - skipped
    const eta = remaining > 0 ? `${(remaining / rate).toFixed(0)}s` : 'done'
    console.log(`   ${processed}/${totalOrphans} OK · ${errors} err · ${skipped} skipped · ${rate}/s · ETA ${eta}`)
  }

  console.log(`\n✅ Terminé en ${((Date.now() - tStart) / 1000).toFixed(0)}s`)
  console.log(`   Processed: ${processed}`)
  console.log(`   Errors: ${errors}`)
  console.log(`   Skipped (download fail): ${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
