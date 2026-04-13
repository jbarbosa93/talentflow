import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

// Helper pour accéder à la table non-typée recheck_results
function recheckTable(admin: ReturnType<typeof createAdminClient>) {
  return (admin as any).from('recheck_results')
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const admin = createAdminClient()
  const body = await request.json()
  const { result_id, action } = body

  if (action === 'approve_all') {
    const { data: pending } = await recheckTable(admin).select('*').eq('status', 'pending')
    if (!pending?.length) return NextResponse.json({ updated: 0 })

    let updated = 0
    for (const result of pending) {
      const newData = result.new_data as any
      if (!newData) continue

      // NE PAS toucher : nom, prenom, email, telephone, localisation, date_naissance, photo
      // (déjà nettoyés par Cowork)
      // Seulement les champs "contenu CV"
      const updateFields: Record<string, any> = {
        titre_poste: newData.titre_poste || null,
        competences: newData.competences || [],
        langues: newData.langues || [],
        experiences: newData.experiences || [],
        formations_details: newData.formations_details || [],
        formation: newData.formation || null,
        linkedin: newData.linkedin || null,
        permis_conduire: newData.permis_conduire ?? null,
        resume_ia: newData.resume || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await admin.from('candidats').update(updateFields).eq('id', result.candidat_id)
      if (!error) {
        await recheckTable(admin).update({ status: 'approved' }).eq('id', result.id)
        updated++
      }
    }
    return NextResponse.json({ updated })
  }

  if (!result_id) {
    return NextResponse.json({ error: 'result_id requis' }, { status: 400 })
  }

  const { data: result, error } = await recheckTable(admin).select('*').eq('id', result_id).single()
  if (error || !result) {
    return NextResponse.json({ error: 'Résultat non trouvé' }, { status: 404 })
  }

  if (action === 'reject') {
    await recheckTable(admin).update({ status: 'rejected' }).eq('id', result_id)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action === 'approve') {
    const newData = result.new_data as any
    // NE PAS toucher : nom, prenom, email, telephone, localisation, date_naissance, photo
    const updateFields: Record<string, any> = {
      titre_poste: newData.titre_poste || null,
      competences: newData.competences || [],
      langues: newData.langues || [],
      experiences: newData.experiences || [],
      formations_details: newData.formations_details || [],
      formation: newData.formation || null,
      linkedin: newData.linkedin || null,
      permis_conduire: newData.permis_conduire ?? null,
      resume_ia: newData.resume || null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await admin.from('candidats').update(updateFields).eq('id', result.candidat_id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    await recheckTable(admin).update({ status: 'approved' }).eq('id', result_id)
    return NextResponse.json({ ok: true, status: 'approved' })
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
}
