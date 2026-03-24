import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyserCVDepuisPDF, analyserCV } from '@/lib/claude'
import { after } from 'next/server'

export const maxDuration = 60

// Nombre de candidats traités par batch
const BATCH_SIZE = 3

// Comparer ancien vs nouveau et retourner les diffs significatifs
function computeDiffs(old_: any, new_: any): { field: string; old: any; new_val: any }[] {
  const diffs: { field: string; old: any; new_val: any }[] = []
  // NE PAS comparer : nom, prenom, email, telephone, localisation, date_naissance
  // (déjà nettoyés par Cowork — on ne veut pas les écraser)
  const fields = [
    { key: 'titre_poste', label: 'Poste' },
    { key: 'permis_conduire', label: 'Permis' },
    { key: 'formation', label: 'Formation' },
    { key: 'linkedin', label: 'LinkedIn' },
  ]

  for (const { key, label } of fields) {
    const o = old_[key] ?? ''
    const n = new_[key] ?? ''
    const oStr = String(o).trim().toLowerCase()
    const nStr = String(n).trim().toLowerCase()
    // Ignorer si le nouveau est vide ou identique
    if (nStr === '' || oStr === nStr) continue
    // Ignorer si c'est juste une diff de formatting
    if (oStr.replace(/[\s\-\.]/g, '') === nStr.replace(/[\s\-\.]/g, '')) continue
    diffs.push({ field: label, old: o, new_val: n })
  }

  // Compétences : différences significatives
  const oldComp = (old_.competences || []).map((s: string) => s.toLowerCase().trim())
  const newComp = (new_.competences || []).map((s: string) => s.toLowerCase().trim())
  const addedComp = newComp.filter((c: string) => !oldComp.some((oc: string) => oc.includes(c) || c.includes(oc)))
  const removedComp = oldComp.filter((c: string) => !newComp.some((nc: string) => nc.includes(c) || c.includes(nc)))
  if (addedComp.length >= 2 || removedComp.length >= 3) {
    diffs.push({
      field: 'Compétences',
      old: `${old_.competences?.length || 0} (${removedComp.length} retirées)`,
      new_val: `${new_.competences?.length || 0} (+${addedComp.length} nouvelles)`,
    })
  }

  // Langues
  const oldLang = (old_.langues || []).map((s: string) => s.toLowerCase().trim())
  const newLang = (new_.langues || []).map((s: string) => s.toLowerCase().trim())
  const addedLang = newLang.filter((l: string) => !oldLang.some((ol: string) => ol.includes(l) || l.includes(ol)))
  if (addedLang.length > 0) {
    diffs.push({ field: 'Langues', old: old_.langues || [], new_val: new_.langues || [] })
  }

  // Expériences : compter les nouvelles
  const oldExpCount = (old_.experiences || []).length
  const newExpCount = (new_.experiences || []).length
  if (Math.abs(oldExpCount - newExpCount) >= 2) {
    diffs.push({ field: 'Expériences', old: `${oldExpCount}`, new_val: `${newExpCount}` })
  }

  // Formations
  const oldFormCount = (old_.formations_details || []).length
  const newFormCount = (new_.formations_details || []).length
  if (Math.abs(oldFormCount - newFormCount) >= 1) {
    diffs.push({ field: 'Formations', old: `${oldFormCount}`, new_val: `${newFormCount}` })
  }

  // Résumé IA : si vide avant et rempli maintenant
  if (new_.resume && !old_.resume_ia) {
    diffs.push({ field: 'Résumé IA', old: '(vide)', new_val: new_.resume?.slice(0, 100) + '...' })
  }

  return diffs
}

// Traiter un candidat avec retry
async function processCandidat(admin: ReturnType<typeof createAdminClient>, candidat: any): Promise<any> {
  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const cvUrl = candidat.cv_url
      if (!cvUrl) return { id: candidat.id, skipped: true, reason: 'no_cv' }

      // Télécharger le CV avec timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const cvRes = await fetch(cvUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!cvRes.ok) return { id: candidat.id, skipped: true, reason: 'download_failed' }
      const buffer = Buffer.from(await cvRes.arrayBuffer())

      if (buffer.length < 100) return { id: candidat.id, skipped: true, reason: 'file_too_small' }

      // Analyser avec Claude (même moteur que l'import)
      let analyse
      const isPdf = candidat.cv_nom_fichier?.toLowerCase()?.endsWith('.pdf') ||
        cvRes.headers.get('content-type')?.includes('pdf')

      if (isPdf) {
        analyse = await analyserCVDepuisPDF(buffer)
      } else {
        const text = candidat.cv_texte_brut || buffer.toString('utf-8')
        if (text.length < 50) return { id: candidat.id, skipped: true, reason: 'text_too_short' }
        analyse = await analyserCV(text.slice(0, 12000))
      }

      // Si le document n'est pas un CV, skip
      if (analyse.document_type && analyse.document_type !== 'cv') {
        return { id: candidat.id, skipped: true, reason: `document_type_${analyse.document_type}` }
      }

      // Construire old_data
      const old_data = {
        titre_poste: candidat.titre_poste,
        email: candidat.email,
        telephone: candidat.telephone,
        localisation: candidat.localisation,
        date_naissance: candidat.date_naissance,
        permis_conduire: candidat.permis_conduire,
        formation: candidat.formation,
        linkedin: candidat.linkedin,
        competences: candidat.competences || [],
        langues: candidat.langues || [],
        experiences: candidat.experiences || [],
        formations_details: candidat.formations_details || [],
        resume_ia: candidat.resume_ia,
      }

      const diffs = computeDiffs(old_data, analyse)

      // Sauvegarder seulement s'il y a des diffs significatifs (≥2 champs)
      if (diffs.length >= 2) {
        // Vérifier qu'on n'a pas déjà un résultat pour ce candidat
        const { data: existing } = await (admin as any).from('recheck_results')
          .select('id').eq('candidat_id', candidat.id).maybeSingle()

        if (!existing) {
          await (admin as any).from('recheck_results').insert({
            candidat_id: candidat.id,
            candidat_nom: candidat.nom,
            candidat_prenom: candidat.prenom,
            old_data,
            new_data: analyse,
            diffs,
            diff_count: diffs.length,
            status: 'pending',
          })
        }
      }

      return {
        id: candidat.id,
        nom: `${candidat.prenom || ''} ${candidat.nom}`.trim(),
        diffs_count: diffs.length,
        saved: diffs.length >= 2,
      }
    } catch (err: any) {
      if (attempt < maxRetries) {
        console.log(`[Recheck] Retry ${attempt + 1} pour ${candidat.id}: ${err.message}`)
        await new Promise(r => setTimeout(r, 2000)) // Wait 2s before retry
        continue
      }
      console.error(`[Recheck] Erreur finale candidat ${candidat.id}:`, err.message)
      return { id: candidat.id, error: err.message }
    }
  }
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const offset = body.offset || 0
  const action = body.action || 'continue'

  // ─── STATUS ───
  if (action === 'status') {
    const { count: totalWithCv } = await admin.from('candidats')
      .select('id', { count: 'exact', head: true }).not('cv_url', 'is', null)

    const { count: pendingCount } = await (admin as any).from('recheck_results')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending')
    const { count: approvedCount } = await (admin as any).from('recheck_results')
      .select('id', { count: 'exact', head: true }).eq('status', 'approved')
    const { count: rejectedCount } = await (admin as any).from('recheck_results')
      .select('id', { count: 'exact', head: true }).eq('status', 'rejected')

    const { data: pending } = await (admin as any).from('recheck_results')
      .select('*').eq('status', 'pending')
      .order('diff_count', { ascending: false }).limit(50)

    return NextResponse.json({
      total: totalWithCv || 0,
      pending_count: pendingCount || 0,
      approved_count: approvedCount || 0,
      rejected_count: rejectedCount || 0,
      pending: pending || [],
    })
  }

  // ─── PAUSE ───
  if (action === 'pause') {
    return NextResponse.json({ paused: true, offset })
  }

  // ─── START ───
  if (action === 'start') {
    // Reset : supprimer les anciens résultats
    await (admin as any).from('recheck_results').delete().gte('created_at', '2000-01-01')
    console.log('[Recheck] Démarrage analyse complète...')
  }

  // ─── PROCESS BATCH ───
  const { data: candidats, error } = await admin
    .from('candidats')
    .select('id, nom, prenom, email, telephone, localisation, titre_poste, date_naissance, permis_conduire, formation, linkedin, competences, langues, experiences, formations_details, resume_ia, cv_url, cv_nom_fichier, cv_texte_brut')
    .not('cv_url', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1)

  if (error) {
    console.error('[Recheck] Erreur fetch candidats:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!candidats?.length) {
    console.log(`[Recheck] ✅ Terminé ! ${offset} candidats traités.`)
    return NextResponse.json({ done: true, total_processed: offset })
  }

  // Traiter en parallèle (3 à la fois)
  const results = await Promise.all(candidats.map(c => processCandidat(admin, c)))

  const nextOffset = offset + candidats.length
  const hasMore = candidats.length === BATCH_SIZE

  console.log(`[Recheck] Batch ${offset}-${nextOffset}: ${results.filter(r => r?.saved).length} avec diffs, ${results.filter(r => r?.error).length} erreurs`)

  const response = NextResponse.json({
    processed: nextOffset,
    batch_results: results.filter(Boolean),
    has_more: hasMore,
  })

  // Auto-continuation côté serveur via after()
  if (hasMore) {
    const baseUrl = request.nextUrl.origin
    after(async () => {
      try {
        // Petit délai pour ne pas surcharger l'API Claude
        await new Promise(r => setTimeout(r, 1000))
        await fetch(`${baseUrl}/api/candidats/recheck-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset: nextOffset, action: 'continue' }),
        })
      } catch (err) {
        console.error('[Recheck] Erreur auto-continuation:', err)
      }
    })
  }

  return response
}
