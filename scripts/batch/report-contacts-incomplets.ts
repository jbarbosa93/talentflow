// scripts/batch/report-contacts-incomplets.ts
// v1.9.114 — Rapport CSV des contacts (clients.contacts JSONB) ayant un nom
// mais ni email NI téléphone NI mobile renseigné.
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/report-contacts-incomplets.ts
//
// SORTIE : ~/Desktop/contacts-incomplets.csv (format Excel-friendly, BOM UTF-8, ; séparateur).

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

interface ContactItem {
  prenom?: string
  nom?: string
  fonction?: string
  titre?: string
  email?: string
  telephone?: string
  mobile?: string
}

interface Row {
  client_id: string
  nom_entreprise: string
  ville: string
  canton: string
  npa: string
  tel_entreprise: string
  email_entreprise: string
  prenom: string
  nom: string
  titre: string
  fonction: string
}

function normStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function csvEscape(v: string): string {
  if (v == null) return ''
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

async function main() {
  console.log('\n=== report-contacts-incomplets ===\n')

  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, ville, canton, npa, telephone, email, contacts')
    .not('contacts', 'is', null)
    .neq('contacts', '[]')

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  const rows: Row[] = []
  for (const c of (data || []) as any[]) {
    const contacts: ContactItem[] = Array.isArray(c.contacts) ? c.contacts : []
    for (const contact of contacts) {
      const prenom = normStr(contact.prenom)
      const nom = normStr(contact.nom)
      const email = normStr(contact.email)
      const telephone = normStr(contact.telephone)
      const mobile = normStr(contact.mobile)

      const hasName = !!(prenom || nom)
      const hasReach = !!(email || telephone || mobile)
      if (!hasName || hasReach) continue

      rows.push({
        client_id: c.id,
        nom_entreprise: c.nom_entreprise || '',
        ville: c.ville || '',
        canton: c.canton || '',
        npa: c.npa || '',
        tel_entreprise: c.telephone || '',
        email_entreprise: c.email || '',
        prenom,
        nom,
        titre: normStr(contact.titre),
        fonction: normStr(contact.fonction),
      })
    }
  }

  rows.sort((a, b) => {
    const ne = a.nom_entreprise.localeCompare(b.nom_entreprise, 'fr')
    if (ne !== 0) return ne
    const n = a.nom.localeCompare(b.nom, 'fr')
    if (n !== 0) return n
    return a.prenom.localeCompare(b.prenom, 'fr')
  })

  const headers = [
    'Entreprise', 'Ville', 'Canton', 'NPA',
    'Tél. entreprise', 'Email entreprise',
    'Prénom contact', 'Nom contact', 'Titre', 'Fonction',
    'URL fiche',
  ]
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent-flow.ch'
  const lines: string[] = [headers.join(';')]
  for (const r of rows) {
    lines.push([
      csvEscape(r.nom_entreprise),
      csvEscape(r.ville),
      csvEscape(r.canton),
      csvEscape(r.npa),
      csvEscape(r.tel_entreprise),
      csvEscape(r.email_entreprise),
      csvEscape(r.prenom),
      csvEscape(r.nom),
      csvEscape(r.titre),
      csvEscape(r.fonction),
      csvEscape(`${baseUrl}/clients/${r.client_id}`),
    ].join(';'))
  }

  const outPath = join(homedir(), 'Desktop', 'contacts-incomplets.csv')
  // BOM UTF-8 pour Excel macOS
  writeFileSync(outPath, '﻿' + lines.join('\n'), 'utf8')

  const uniqueClients = new Set(rows.map(r => r.client_id)).size
  console.log(`Contacts incomplets : ${rows.length}`)
  console.log(`Clients concernés   : ${uniqueClients}`)
  console.log(`Fichier             : ${outPath}\n`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
