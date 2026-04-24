// Inspection workflow folder via Vision IA (scans PDF)
import fs from 'node:fs'
import path from 'node:path'
import { analyserCVDepuisPDF } from '../../lib/claude'

const FOLDER = '/Users/joaobarbosa/Desktop/talentflow-test-fixtures/'

async function analyse(full: string, name: string) {
  const buf = fs.readFileSync(full)
  try {
    const a = await analyserCVDepuisPDF(buf)
    return {
      name,
      type: a.document_type,
      prenom: a.prenom,
      nom: a.nom,
      email: a.email,
      tel: a.telephone,
      titre: a.titre_poste,
      ville: a.localisation,
      ddn: a.date_naissance,
      nbExp: (a.experiences || []).length,
      nbComp: (a.competences || []).length,
    }
  } catch (e: any) {
    return { name, error: e.message }
  }
}

async function main() {
  const files = fs.readdirSync(FOLDER).filter(f => !f.startsWith('.')).sort()
  console.log(`${files.length} fichiers à analyser en parallèle\n`)
  const results = await Promise.all(files.map(f => analyse(path.join(FOLDER, f), f)))
  for (const r of results) {
    console.log('━'.repeat(70))
    console.log(`📄 ${r.name}`)
    if ((r as any).error) { console.log('   ❌', (r as any).error); continue }
    console.log(`   type      : ${r.type}`)
    console.log(`   identité  : ${r.prenom} ${r.nom}`)
    console.log(`   contact   : ${r.email || '(pas d\'email)'} | ${r.tel || '(pas de tel)'}`)
    console.log(`   titre     : ${r.titre || '—'}`)
    console.log(`   ville/ddn : ${r.ville || '—'} | DDN: ${r.ddn || '—'}`)
    console.log(`   données   : ${r.nbExp} exp · ${r.nbComp} comp`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
