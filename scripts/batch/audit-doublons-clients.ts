// scripts/batch/audit-doublons-clients.ts
// v2.1.12 — Audit des doublons clients par nom_entreprise + ville
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/audit-doublons-clients.ts
//
// LOGIQUE :
//   - Normalise nom_entreprise (lowercase, strip suffixes SA/Sàrl/AG/GmbH/Ltd, trim)
//   - Group by (clean_nom + ville_lowercase)
//   - Print les groupes >= 2 clients
//
// SORTIE : ~/Desktop/audit-doublons-clients.csv + récap console

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

interface Client {
  id: string
  nom_entreprise: string | null
  ville: string | null
  canton: string | null
  npa: string | null
  statut: string | null
  zefix_uid: string | null
  created_at: string
}

// Normalisation du nom : lowercase, strip ponctuation, strip suffixes commerciaux
function cleanCompanyName(raw: string): string {
  if (!raw) return ''
  let n = raw.toLowerCase().trim()
  // Strip ponctuation & accents
  n = n.normalize('NFD').replace(/[̀-ͯ]/g, '')
  n = n.replace(/[.,\-_/\\&'"]/g, ' ').replace(/\s+/g, ' ').trim()
  // Suffixes courants
  const suffixes = [
    ' sa', ' s a', ' s\\.a\\.',
    ' sarl', ' s a r l', ' sàrl',
    ' ag', ' a g', ' gmbh', ' g m b h',
    ' ltd', ' inc', ' llc',
    ' sas', ' eurl', ' snc', ' scop', ' scs',
  ]
  for (const sfx of suffixes) {
    const re = new RegExp(sfx + '$', 'i')
    n = n.replace(re, '').trim()
  }
  return n
}

function cleanCity(raw: string | null): string {
  if (!raw) return ''
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

async function main() {
  console.log('🔍 Audit doublons clients en cours...\n')

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, ville, canton, npa, statut, zefix_uid, created_at')
    .order('created_at', { ascending: true })
    .returns<Client[]>()

  if (error) { console.error('Erreur fetch clients:', error); process.exit(1) }
  if (!clients) { console.error('No data'); process.exit(1) }

  console.log(`📊 ${clients.length} clients fetchés\n`)

  // Group by (clean_nom + clean_ville)
  const groups = new Map<string, Client[]>()
  for (const c of clients) {
    const cleanNom = cleanCompanyName(c.nom_entreprise || '')
    const cleanV = cleanCity(c.ville)
    if (!cleanNom) continue
    const key = `${cleanNom}|${cleanV}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  // Filter : groupes >= 2
  const doublons = Array.from(groups.entries()).filter(([, list]) => list.length >= 2)
  doublons.sort((a, b) => b[1].length - a[1].length)

  console.log(`🚨 ${doublons.length} groupes de doublons potentiels (nom + ville identiques) — total ${doublons.reduce((acc, [, list]) => acc + list.length, 0)} clients concernés\n`)

  if (doublons.length === 0) {
    console.log('✅ Aucun doublon détecté !')
    return
  }

  // Console : top 30 groupes
  console.log('TOP 30 GROUPES (le plus de doublons en haut) :\n')
  console.log('─'.repeat(120))
  const topShow = doublons.slice(0, 30)
  for (const [key, list] of topShow) {
    const [cleanNom, cleanV] = key.split('|')
    console.log(`\n  📍 "${cleanNom}" @ "${cleanV || '(sans ville)'}"  →  ${list.length} clients`)
    for (const c of list) {
      const verifBadge = c.zefix_uid ? '✓Zefix' : '·     '
      console.log(`     ${verifBadge}  ${c.id}  |  "${c.nom_entreprise}"  |  ${c.npa || '____'} ${c.ville || '(sans ville)'}  |  ${c.statut}  |  ${c.created_at.slice(0, 10)}`)
    }
  }

  // CSV complet (toutes paires)
  const csvLines: string[] = []
  csvLines.push([
    'cluster_key', 'cluster_size', 'client_id', 'nom_entreprise', 'npa', 'ville', 'canton',
    'statut', 'zefix_uid', 'created_at',
  ].join(';'))
  for (const [key, list] of doublons) {
    for (const c of list) {
      csvLines.push([
        `"${key.replace(/"/g, '""')}"`,
        list.length,
        c.id,
        `"${(c.nom_entreprise || '').replace(/"/g, '""')}"`,
        c.npa || '',
        `"${(c.ville || '').replace(/"/g, '""')}"`,
        c.canton || '',
        c.statut || '',
        c.zefix_uid || '',
        c.created_at,
      ].join(';'))
    }
  }
  const csv = '﻿' + csvLines.join('\n')
  const outPath = join(homedir(), 'Desktop', 'audit-doublons-clients.csv')
  writeFileSync(outPath, csv, 'utf-8')

  console.log('\n' + '─'.repeat(120))
  console.log(`\n📁 CSV complet écrit : ${outPath}`)
  console.log(`   ${doublons.length} groupes / ${doublons.reduce((acc, [, list]) => acc + list.length, 0)} lignes\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
