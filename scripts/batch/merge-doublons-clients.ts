// scripts/batch/merge-doublons-clients.ts
// v2.1.13 — Fusion des clients en doublon (groupés par nom_entreprise + ville normalisés)
//
// USAGE :
//   DRY-RUN (par défaut) :
//     npx tsx --env-file=.env.local scripts/batch/merge-doublons-clients.ts
//
//   APPLY (irréversible) :
//     npx tsx --env-file=.env.local scripts/batch/merge-doublons-clients.ts --apply
//
// LOGIQUE :
//   1. Group by (clean_nom + ville_lower) comme l'audit
//   2. Pour chaque groupe : choisir WINNER (zefix_uid > contacts > ancienneté)
//   3. Migrer FK : emails_envoyes.client_id, entretiens.entreprise_id, missions.client_id
//   4. Merger contacts JSONB (dédup par email lowercase)
//   5. Compléter winner avec champs manquants (zefix_uid, telephone, site_web, etc.)
//   6. DELETE les losers (les FK sont SET NULL si la migration FK a raté, donc safe)
//
// SORTIE : ~/Desktop/merge-doublons-clients-rapport.csv (avant + après)

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const APPLY = process.argv.includes('--apply')

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
  adresse: string | null
  telephone: string | null
  site_web: string | null
  notes: string | null
  secteur: string | null
  secteurs_activite: string[] | null
  contacts: any[] | null
  statut: string | null
  zefix_uid: string | null
  zefix_status: string | null
  zefix_name: string | null
  zefix_verified_at: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
}

const CLIENT_COLUMNS = `
  id, nom_entreprise, ville, canton, npa, adresse, telephone, site_web, notes,
  secteur, secteurs_activite, contacts, statut,
  zefix_uid, zefix_status, zefix_name, zefix_verified_at,
  latitude, longitude, created_at
`

// Normalisation (identique au script audit)
function cleanCompanyName(raw: string): string {
  if (!raw) return ''
  let n = raw.toLowerCase().trim()
  n = n.normalize('NFD').replace(/[̀-ͯ]/g, '')
  n = n.replace(/[.,\-_/\\&'"]/g, ' ').replace(/\s+/g, ' ').trim()
  const suffixes = [' sa', ' s a', ' sarl', ' s a r l', ' sàrl', ' ag', ' a g', ' gmbh', ' g m b h', ' ltd', ' inc', ' llc', ' sas', ' eurl', ' snc', ' scop', ' scs']
  for (const sfx of suffixes) {
    n = n.replace(new RegExp(sfx + '$', 'i'), '').trim()
  }
  return n
}

function cleanCity(raw: string | null): string {
  if (!raw) return ''
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Choix du winner : zefix > contacts > ancienneté
function pickWinner(group: Client[]): { winner: Client; losers: Client[] } {
  const sorted = [...group].sort((a, b) => {
    // 1. Avec zefix_uid > sans
    const aZ = !!a.zefix_uid
    const bZ = !!b.zefix_uid
    if (aZ !== bZ) return aZ ? -1 : 1
    // 2. Plus de contacts > moins
    const aC = (a.contacts?.length ?? 0)
    const bC = (b.contacts?.length ?? 0)
    if (aC !== bC) return bC - aC
    // 3. Plus ancien > récent (created_at ASC)
    return a.created_at.localeCompare(b.created_at)
  })
  return { winner: sorted[0], losers: sorted.slice(1) }
}

// Merge contacts : dédup par email lowercase (sinon par nom complet)
function mergeContacts(winnerContacts: any[] | null, loserContacts: any[] | null): any[] {
  const all = [...(winnerContacts || []), ...(loserContacts || [])]
  const seen = new Set<string>()
  const result: any[] = []
  for (const c of all) {
    const key = (c?.email || '').toLowerCase().trim()
      || `${(c?.prenom || '').toLowerCase().trim()}_${(c?.nom || '').toLowerCase().trim()}`
    if (!key.replace(/_/g, '')) continue // skip empty
    if (seen.has(key)) continue
    seen.add(key)
    result.push(c)
  }
  return result
}

// Choisir la valeur "la plus complète" pour les champs scalar
function pickBest<T>(winnerVal: T | null, loserVal: T | null): T | null {
  if (winnerVal !== null && winnerVal !== '' && winnerVal !== undefined) return winnerVal
  if (loserVal !== null && loserVal !== '' && loserVal !== undefined) return loserVal
  return winnerVal ?? loserVal
}

interface MergeReport {
  cluster_key: string
  winner_id: string
  winner_nom: string
  loser_ids: string[]
  loser_noms: string[]
  fk_migrated: { emails: number; entretiens: number; missions: number }
  contacts_before: number
  contacts_after: number
  fields_filled_from_loser: string[]
}

async function main() {
  console.log(`\n🔍 ${APPLY ? '⚠️  APPLY MODE - changements appliqués en DB' : 'DRY-RUN - aucun changement'}\n`)

  const { data: clients, error } = await supabase
    .from('clients')
    .select(CLIENT_COLUMNS)
    .order('created_at', { ascending: true })
    .returns<Client[]>()

  if (error || !clients) { console.error('Erreur fetch:', error); process.exit(1) }
  console.log(`📊 ${clients.length} clients fetchés\n`)

  // Group
  const groups = new Map<string, Client[]>()
  for (const c of clients) {
    const cleanNom = cleanCompanyName(c.nom_entreprise || '')
    if (!cleanNom) continue
    const key = `${cleanNom}|${cleanCity(c.ville)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  const doublons = Array.from(groups.entries()).filter(([, list]) => list.length >= 2)
  console.log(`🚨 ${doublons.length} groupes de doublons (${doublons.reduce((acc, [, l]) => acc + l.length, 0)} clients concernés)\n`)

  if (doublons.length === 0) { console.log('✅ Rien à fusionner.'); return }

  const reports: MergeReport[] = []

  for (const [key, group] of doublons) {
    const { winner, losers } = pickWinner(group)
    console.log('─'.repeat(120))
    console.log(`\n📍 ${key}`)
    console.log(`   ✓ WINNER : ${winner.id}  "${winner.nom_entreprise}"  (zefix=${winner.zefix_uid ? 'OUI' : 'non'}, contacts=${winner.contacts?.length || 0}, créé ${winner.created_at.slice(0, 10)})`)
    for (const l of losers) {
      console.log(`   ✗ loser  : ${l.id}  "${l.nom_entreprise}"  (zefix=${l.zefix_uid ? 'OUI' : 'non'}, contacts=${l.contacts?.length || 0}, créé ${l.created_at.slice(0, 10)})`)
    }

    // Compter les FK que les losers ont
    const loserIds = losers.map(l => l.id)
    const [emailsCount, entretiensCount, missionsCount] = await Promise.all([
      supabase.from('emails_envoyes').select('id', { count: 'exact', head: true }).in('client_id', loserIds).then(r => r.count ?? 0),
      supabase.from('entretiens' as any).select('id', { count: 'exact', head: true }).in('entreprise_id', loserIds).then(r => r.count ?? 0),
      supabase.from('missions').select('id', { count: 'exact', head: true }).in('client_id', loserIds).then(r => r.count ?? 0),
    ])
    console.log(`   FK à migrer : ${emailsCount} email(s) · ${entretiensCount} entretien(s) · ${missionsCount} mission(s)`)

    // Merger contacts (winner + tous les losers)
    let mergedContacts = winner.contacts || []
    for (const l of losers) {
      mergedContacts = mergeContacts(mergedContacts, l.contacts)
    }
    const contactsBefore = winner.contacts?.length || 0
    console.log(`   Contacts : ${contactsBefore} → ${mergedContacts.length} après merge dédup`)

    // Compléter les champs manquants du winner depuis les losers
    const filledFields: string[] = []
    const updates: Partial<Client> = {}
    const fieldsToFill: (keyof Client)[] = [
      'telephone', 'site_web', 'adresse', 'notes', 'secteur', 'canton', 'npa',
      'zefix_uid', 'zefix_status', 'zefix_name', 'zefix_verified_at',
      'latitude', 'longitude',
    ]
    for (const field of fieldsToFill) {
      if (winner[field] === null || winner[field] === '' || winner[field] === undefined) {
        for (const l of losers) {
          if (l[field] !== null && l[field] !== '' && l[field] !== undefined) {
            ;(updates as any)[field] = l[field]
            filledFields.push(field)
            break
          }
        }
      }
    }
    // secteurs_activite : merger les arrays (dédup)
    const winnerSec = winner.secteurs_activite || []
    const loserSecs = losers.flatMap(l => l.secteurs_activite || [])
    const allSec = Array.from(new Set([...winnerSec, ...loserSecs]))
    if (allSec.length > winnerSec.length) {
      ;(updates as any).secteurs_activite = allSec
      filledFields.push('secteurs_activite')
    }
    if (mergedContacts.length > contactsBefore) {
      ;(updates as any).contacts = mergedContacts
    }

    if (filledFields.length > 0) console.log(`   Champs complétés depuis loser : ${filledFields.join(', ')}`)

    reports.push({
      cluster_key: key,
      winner_id: winner.id,
      winner_nom: winner.nom_entreprise || '',
      loser_ids: loserIds,
      loser_noms: losers.map(l => l.nom_entreprise || ''),
      fk_migrated: { emails: emailsCount, entretiens: entretiensCount, missions: missionsCount },
      contacts_before: contactsBefore,
      contacts_after: mergedContacts.length,
      fields_filled_from_loser: filledFields,
    })

    if (APPLY) {
      // 1. Migrer les FK
      if (emailsCount > 0) {
        await supabase.from('emails_envoyes').update({ client_id: winner.id }).in('client_id', loserIds)
      }
      if (entretiensCount > 0) {
        await (supabase.from('entretiens' as any) as any).update({ entreprise_id: winner.id }).in('entreprise_id', loserIds)
      }
      if (missionsCount > 0) {
        await supabase.from('missions').update({ client_id: winner.id }).in('client_id', loserIds)
      }
      // 2. Update winner avec contacts merged + champs complétés
      if (Object.keys(updates).length > 0 || mergedContacts.length > contactsBefore) {
        if (mergedContacts.length > contactsBefore) (updates as any).contacts = mergedContacts
        const { error: updErr } = await supabase.from('clients').update(updates).eq('id', winner.id)
        if (updErr) console.error(`   ❌ Erreur update winner :`, updErr.message)
      }
      // 3. DELETE les losers
      const { error: delErr } = await supabase.from('clients').delete().in('id', loserIds)
      if (delErr) console.error(`   ❌ Erreur delete losers :`, delErr.message)
      else console.log(`   ✅ ${losers.length} loser(s) supprimé(s)`)
    }
  }

  console.log('\n' + '═'.repeat(120))
  const totalLosers = reports.reduce((acc, r) => acc + r.loser_ids.length, 0)
  const totalEmails = reports.reduce((acc, r) => acc + r.fk_migrated.emails, 0)
  const totalEntretiens = reports.reduce((acc, r) => acc + r.fk_migrated.entretiens, 0)
  const totalMissions = reports.reduce((acc, r) => acc + r.fk_migrated.missions, 0)
  console.log(`\n📊 RÉCAP ${APPLY ? '(appliqué)' : '(DRY-RUN)'}\n`)
  console.log(`   Groupes      : ${reports.length}`)
  console.log(`   Losers à del : ${totalLosers}`)
  console.log(`   FK migrées   : ${totalEmails} emails · ${totalEntretiens} entretiens · ${totalMissions} missions`)

  // CSV rapport
  const csvLines: string[] = []
  csvLines.push(['cluster_key', 'winner_id', 'winner_nom', 'loser_ids', 'loser_noms', 'emails_migrated', 'entretiens_migrated', 'missions_migrated', 'contacts_before', 'contacts_after', 'fields_filled_from_loser'].join(';'))
  for (const r of reports) {
    csvLines.push([
      `"${r.cluster_key.replace(/"/g, '""')}"`,
      r.winner_id,
      `"${r.winner_nom.replace(/"/g, '""')}"`,
      r.loser_ids.join('|'),
      `"${r.loser_noms.join(' || ').replace(/"/g, '""')}"`,
      r.fk_migrated.emails,
      r.fk_migrated.entretiens,
      r.fk_migrated.missions,
      r.contacts_before,
      r.contacts_after,
      r.fields_filled_from_loser.join('|'),
    ].join(';'))
  }
  const csv = '﻿' + csvLines.join('\n')
  const outPath = join(homedir(), 'Desktop', `merge-doublons-clients-${APPLY ? 'APPLIED' : 'DRYRUN'}.csv`)
  writeFileSync(outPath, csv, 'utf-8')
  console.log(`\n📁 CSV rapport : ${outPath}\n`)

  if (!APPLY) {
    console.log('💡 Pour appliquer ces fusions, relance avec --apply :')
    console.log('   npx tsx --env-file=.env.local scripts/batch/merge-doublons-clients.ts --apply\n')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
