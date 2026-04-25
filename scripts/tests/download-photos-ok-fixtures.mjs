#!/usr/bin/env node
// Télécharge 100 CVs PDF de candidats avec photo_url OK (témoin anti-régression).
// Cible : ~/Desktop/talentflow-test-fixtures/photos-ok/
// Usage : node --env-file=.env.local scripts/tests/download-photos-ok-fixtures.mjs

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'

const FIXTURES_DIR = path.join(os.homedir(), 'Desktop/talentflow-test-fixtures/photos-ok')
const TARGET_COUNT = 100

// IDs des 22 candidats du banc photos-fail — exclus du témoin.
const EXCLUDE_IDS = new Set([
  '9f091188-32ec-4da8-88c0-24f210bb0784','541ec11a-6f66-4fb7-b7a2-1ee55cf18509',
  '7327b716-9f4a-4a87-abe7-1cce54e525a1','bf96cd24-681f-437a-a00f-6f725b60b9dd',
  '8291202c-6ff4-44fb-9939-bbe3b3dbe7ec','c6d8dd88-8945-47fa-82e9-523bf037189e',
  '84950b1d-b5ed-4da2-aeef-452e3ab79fa7','7efe3740-a74f-4dd8-8533-c973d58c3cf9',
  '6194c3cf-6bda-49cf-b943-ce07289dc9d3','4f570b99-e583-4599-9f69-99e1b578f636',
  'aed833f0-596f-420d-b3b2-f70172885203','35bbbf53-d6ac-442a-bc55-5cd836fca1d8',
  'b1cac1b1-7283-46af-9486-75075758ebec','05fe8081-9afd-440c-9aba-c0b5c5f3d000',
  '74d1c14e-6dc5-4fe6-ba13-a4ced669137c','5c5b73c2-c812-40c3-9ca6-2b13411fc1d4',
  '0d2d8fc4-cb8a-42c3-80ce-bf1c19a61830','22a733d6-436b-4673-aee6-e5fb4ace995d',
  '938799c4-ae47-4411-a52a-f2a2af6ab004','4f7b3793-bb8e-490a-9b4c-9f263675ed62',
  'bbbdbbe3-834a-4eaa-a7c5-af45fe22380b','d9192ddf-5efb-47ae-88d0-4f918714e2f3',
])

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
function pad3(n) { return String(n).padStart(3, '0') }

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (--env-file=.env.local)')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  console.log(`📁 ${FIXTURES_DIR}`)

  // Échantillon diversifié : tous les ranks pour photo OK + PDF
  // Strategy : on fetch un peu plus que TARGET_COUNT, on filtre EXCLUDE_IDS
  const oversize = TARGET_COUNT + EXCLUDE_IDS.size + 30
  console.log(`🔎 Query Supabase : ${oversize} candidats avec photo_url + cv_url PDF...`)
  const { data, error } = await supabase
    .from('candidats')
    .select('id, prenom, nom, cv_url, cv_nom_fichier, photo_url, created_at')
    .not('photo_url', 'is', null)
    .not('cv_url', 'is', null)
    .ilike('cv_nom_fichier', '%.pdf')
    .order('created_at', { ascending: false })
    .limit(oversize)

  if (error) {
    console.error('❌ Supabase error :', error.message)
    process.exit(1)
  }

  const candidates = (data || [])
    .filter(c => !EXCLUDE_IDS.has(c.id))
    .slice(0, TARGET_COUNT)

  console.log(`📋 ${candidates.length} candidats sélectionnés (sur ${data?.length || 0} avant filter)\n`)
  if (candidates.length < TARGET_COUNT) {
    console.warn(`⚠️ Moins de ${TARGET_COUNT} candidats disponibles : ${candidates.length}`)
  }

  const manifest = []
  let ok = 0, fail = 0

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const idx = i + 1
    const fullName = `${c.prenom || ''}-${c.nom || ''}`.trim()
    const slug = slugify(fullName) || c.id.slice(0, 8)
    const filename = `${pad3(idx)}-${slug}.pdf`
    const target = path.join(FIXTURES_DIR, filename)

    if (fs.existsSync(target)) {
      const size = fs.statSync(target).size
      console.log(`  ⏭️  [${pad3(idx)}] ${filename} (${size}B — déjà présent)`)
      manifest.push({ idx, filename, size, candidat_id: c.id, name: `${c.prenom} ${c.nom}` })
      ok++
      continue
    }

    try {
      const t0 = Date.now()
      const res = await fetch(c.cv_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(target, buf)
      const dt = Date.now() - t0
      if (idx % 10 === 0 || idx === candidates.length) {
        console.log(`  ✅ [${pad3(idx)}] ${filename} (${buf.length}B, ${dt}ms)`)
      }
      manifest.push({ idx, filename, size: buf.length, candidat_id: c.id, name: `${c.prenom} ${c.nom}` })
      ok++
    } catch (e) {
      console.error(`  ❌ [${pad3(idx)}] ${filename} — ${e.message}`)
      manifest.push({ idx, filename, size: 0, candidat_id: c.id, name: `${c.prenom} ${c.nom}`, error: e.message })
      fail++
    }
  }

  const manifestPath = path.join(FIXTURES_DIR, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`\n📋 Manifest : ${manifestPath}`)
  console.log(`📊 ${ok}/${candidates.length} OK, ${fail} échecs`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('💥', e); process.exit(1) })
