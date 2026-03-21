import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// ─── POST /api/candidats/doublons ─────────────────────────────────────────────
// action = "compare" : compare deux candidats via Claude IA
// action = "merge"   : fusionne deux candidats, supprime le doublon

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.action === 'merge') {
      return handleMerge(body.keep_id, body.delete_id)
    }

    // Default: compare pair
    const { candidat_a, candidat_b } = body
    if (!candidat_a || !candidat_b) {
      return NextResponse.json({ error: 'candidat_a et candidat_b sont requis' }, { status: 400 })
    }

    const prompt = `Tu es un expert RH. Analyse ces deux candidats et détermine s'ils sont la même personne.

CANDIDAT A:
- Nom complet: ${candidat_a.prenom || ''} ${candidat_a.nom || ''}
- Email: ${candidat_a.email || 'non renseigné'}
- Téléphone: ${candidat_a.telephone || 'non renseigné'}
- Titre: ${candidat_a.titre_poste || 'non renseigné'}
- Localisation: ${candidat_a.localisation || 'non renseigné'}
- Expérience: ${candidat_a.annees_exp || 0} ans
- Compétences: ${(candidat_a.competences || []).slice(0, 10).join(', ')}
- Extrait CV: ${(candidat_a.cv_texte_brut || '').slice(0, 600)}

CANDIDAT B:
- Nom complet: ${candidat_b.prenom || ''} ${candidat_b.nom || ''}
- Email: ${candidat_b.email || 'non renseigné'}
- Téléphone: ${candidat_b.telephone || 'non renseigné'}
- Titre: ${candidat_b.titre_poste || 'non renseigné'}
- Localisation: ${candidat_b.localisation || 'non renseigné'}
- Expérience: ${candidat_b.annees_exp || 0} ans
- Compétences: ${(candidat_b.competences || []).slice(0, 10).join(', ')}
- Extrait CV: ${(candidat_b.cv_texte_brut || '').slice(0, 600)}

Retourne UNIQUEMENT ce JSON (sans markdown, sans backticks) :
{
  "is_doublon": true,
  "score": 85,
  "raisons": ["Même email", "Nom identique", "Profil similaire"],
  "explication": "Explication concise en 1-2 phrases."
}

Règles de scoring :
- 90-100: Même personne certaine (email identique, téléphone identique)
- 70-89: Très probable (même nom/prénom + profil similaire)
- 50-69: Possible doublon (nom similaire ou profil très proche)
- < 50: Personnes différentes
- is_doublon: true si score >= 65`

    const client = getClient()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    text = text.replace(/```json|```/g, '').trim()
    const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
    if (fb !== -1 && lb > fb) text = text.substring(fb, lb + 1)

    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[Doublons] Erreur:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// ─── Merge: fusionne B dans A, supprime B ─────────────────────────────────────

async function handleMerge(keep_id: string, delete_id: string) {
  if (!keep_id || !delete_id) {
    return NextResponse.json({ error: 'keep_id et delete_id sont requis' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: keep }, { data: del }] = await Promise.all([
    admin.from('candidats').select('*').eq('id', keep_id).single(),
    admin.from('candidats').select('*').eq('id', delete_id).single(),
  ])

  if (!keep || !del) {
    return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
  }

  // Fusionner les champs: prendre la valeur la plus complète de chaque champ
  const merged: Record<string, any> = {}
  const k = keep as Record<string, any>
  const d = del as Record<string, any>

  // Champs texte: garder la valeur la plus longue/complète (pas juste keep en priorité)
  const textFields = ['email', 'telephone', 'localisation', 'titre_poste', 'formation',
    'resume_ia', 'cv_texte_brut', 'source', 'linkedin', 'notes', 'date_naissance']
  for (const f of textFields) {
    const vKeep = k[f] || ''
    const vDel = d[f] || ''
    // Prendre la plus longue (plus d'info) — sauf si vide
    merged[f] = (vKeep.length >= vDel.length ? vKeep : vDel) || null
  }

  // CV: garder le plus récent (par date d'ajout)
  if (k.cv_url && d.cv_url) {
    const keepDate = new Date(k.created_at).getTime()
    const delDate = new Date(d.created_at).getTime()
    if (delDate > keepDate) {
      merged.cv_url = d.cv_url
      merged.cv_nom_fichier = d.cv_nom_fichier
    } else {
      merged.cv_url = k.cv_url
      merged.cv_nom_fichier = k.cv_nom_fichier
    }
  } else {
    merged.cv_url = k.cv_url || d.cv_url || null
    merged.cv_nom_fichier = k.cv_nom_fichier || d.cv_nom_fichier || null
  }

  // Photo: garder la vraie photo (pas 'checked')
  const photoKeep = k.photo_url && k.photo_url !== 'checked' ? k.photo_url : null
  const photoDel = d.photo_url && d.photo_url !== 'checked' ? d.photo_url : null
  merged.photo_url = photoKeep || photoDel || k.photo_url || d.photo_url || null

  // Numériques: prendre le max
  merged.annees_exp = Math.max(k.annees_exp || 0, d.annees_exp || 0)
  merged.permis_conduire = k.permis_conduire || d.permis_conduire || false

  // Listes: union sans doublons
  merged.competences = [...new Set([...(k.competences || []), ...(d.competences || [])])]
  merged.tags = [...new Set([...(k.tags || []), ...(d.tags || [])])]
  merged.langues = [...new Set([...(k.langues || []), ...(d.langues || [])])]

  // Expériences: union (garder les uniques par entreprise+poste)
  const expA: any[] = k.experiences || []
  const expB: any[] = d.experiences || []
  const expKeys = new Set(expA.map((e: any) => `${e.poste}|${e.entreprise}`))
  merged.experiences = [...expA, ...expB.filter((e: any) => !expKeys.has(`${e.poste}|${e.entreprise}`))]

  // Formations: union (garder les uniques par diplôme+établissement)
  const formA: any[] = k.formations_details || []
  const formB: any[] = d.formations_details || []
  const formKeys = new Set(formA.map((f: any) => `${f.diplome}|${f.etablissement}`))
  merged.formations_details = [...formA, ...formB.filter((f: any) => !formKeys.has(`${f.diplome}|${f.etablissement}`))]

  // Mettre à jour le candidat à garder
  await admin.from('candidats').update(merged).eq('id', keep_id)

  // Déplacer les entrées pipeline du doublon vers le candidat gardé
  const { data: delPipelines } = await admin.from('pipeline').select('*').eq('candidat_id', delete_id)
  if (delPipelines?.length) {
    const { data: keepPipelines } = await admin.from('pipeline').select('offre_id').eq('candidat_id', keep_id)
    const keepOffreIds = new Set((keepPipelines || []).map((p: any) => p.offre_id))
    for (const p of delPipelines) {
      if (!keepOffreIds.has((p as any).offre_id)) {
        await admin.from('pipeline').update({ candidat_id: keep_id }).eq('id', (p as any).id)
      }
    }
  }

  // Supprimer le candidat doublon
  await admin.from('candidats').delete().eq('id', delete_id)

  return NextResponse.json({ success: true, keep_id })
}
