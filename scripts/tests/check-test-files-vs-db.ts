// Compare ce que l'IA extrait de chaque fichier test-workflow vs ce qui est en DB
import fs from 'node:fs'
import path from 'node:path'
import { analyserCVDepuisPDF } from '../../lib/claude'
import { createClient } from '@supabase/supabase-js'

const FOLDER = '/Users/joaobarbosa/Desktop/talentflow-test-fixtures/'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function analyse(full: string, name: string) {
  const buf = fs.readFileSync(full)
  const a = await analyserCVDepuisPDF(buf)
  return { name, a }
}

async function findInDb(fields: { email?: string; tel?: string; nom?: string; prenom?: string }) {
  const tel9 = (fields.tel || '').replace(/\D/g, '').slice(-9)
  const qBuilder = supabase.from('candidats').select('id, prenom, nom, email, telephone, date_naissance')
  const matches: any[] = []
  // Email match
  if (fields.email) {
    const { data } = await qBuilder.eq('email', fields.email).limit(5)
    if (data?.length) matches.push(...data.map(d => ({ ...d, matchBy: 'email' })))
  }
  // Tel9 match
  if (tel9 && tel9.length >= 9) {
    const { data } = await supabase.from('candidats').select('id, prenom, nom, email, telephone, date_naissance').ilike('telephone', `%${tel9.slice(-6)}%`).limit(10)
    if (data?.length) {
      for (const d of data) {
        const dTel9 = (d.telephone || '').replace(/\D/g, '').slice(-9)
        if (dTel9 === tel9) matches.push({ ...d, matchBy: 'tel' })
      }
    }
  }
  // Nom+prenom exact (Title Case compare)
  if (fields.nom && fields.prenom) {
    const { data } = await supabase.from('candidats').select('id, prenom, nom, email, telephone, date_naissance')
      .ilike('nom', fields.nom).ilike('prenom', fields.prenom).limit(5)
    if (data?.length) matches.push(...data.map(d => ({ ...d, matchBy: 'nom+prenom exact' })))
  }
  // Dédup par id
  const uniq: Record<string, any> = {}
  for (const m of matches) { uniq[m.id] = uniq[m.id] || m }
  return Object.values(uniq)
}

async function main() {
  const files = fs.readdirSync(FOLDER).filter(f => !f.startsWith('.')).sort()
  console.log(`${files.length} fichiers à analyser\n`)
  const extracts = await Promise.all(files.map(f => analyse(path.join(FOLDER, f), f)))

  for (const { name, a } of extracts) {
    console.log('━'.repeat(75))
    console.log(`📄 ${name}`)
    console.log(`   IA extrait    : ${a.prenom} ${a.nom}  |  ${a.email || '—'}  |  ${a.telephone || '—'}  |  DDN: ${a.date_naissance || '—'}`)
    const db = await findInDb({ email: a.email, tel: a.telephone, nom: a.nom, prenom: a.prenom })
    if (db.length === 0) {
      console.log('   DB match      : ✅ AUCUN — fictif confirmé, scénario nouveau candidat OK')
    } else {
      console.log(`   DB match      : ⚠️ ${db.length} candidat(s) trouvé(s) :`)
      for (const c of db as any[]) {
        const emailMatch = (c.email || '').toLowerCase() === (a.email || '').toLowerCase()
        const tel9c = (c.telephone || '').replace(/\D/g, '').slice(-9)
        const tel9a = (a.telephone || '').replace(/\D/g, '').slice(-9)
        const telMatch = tel9c === tel9a && tel9c.length >= 9
        console.log(`     • ${c.prenom} ${c.nom} (${c.id.slice(0,8)}…) via ${c.matchBy}`)
        console.log(`       email DB    : ${c.email || '—'}  ${emailMatch ? '✖ MATCH EXACT' : '(différent)'}`)
        console.log(`       tel DB      : ${c.telephone || '—'}  ${telMatch ? '✖ MATCH EXACT' : '(différent)'}`)
        console.log(`       DDN DB      : ${c.date_naissance || '—'}`)
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
