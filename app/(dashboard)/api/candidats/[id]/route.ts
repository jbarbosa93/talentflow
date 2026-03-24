// app/(dashboard)/api/candidats/[id]/route.ts
// Lecture / mise à jour / suppression d'un candidat via admin client (bypasse RLS)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('candidats')
      .select('*, notes_candidat(*), pipeline(*, offres(*))')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    }

    return NextResponse.json({ candidat: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// Toutes les colonnes modifiables de la table candidats
const ALLOWED_COLS = new Set([
  'nom','prenom','email','telephone','localisation','titre_poste','annees_exp',
  'competences','formation','resume_ia','cv_texte_brut','statut_pipeline','tags','notes','source',
  'langues','linkedin','permis_conduire','date_naissance','experiences','formations_details','photo_url','documents','import_status','rating','genre',
  'cv_url','cv_nom_fichier','created_at',
])

// Labels français pour le suivi des modifications
const FIELD_LABELS: Record<string, string> = {
  nom: 'Nom', prenom: 'Prénom', titre_poste: 'Métier',
  localisation: 'Localisation', email: 'Email', telephone: 'Téléphone',
  date_naissance: 'Date de naissance', resume_ia: 'Résumé',
  competences: 'Compétences', langues: 'Langues',
  formations_details: 'Formations', experiences: 'Expériences',
  statut_pipeline: 'Statut pipeline', import_status: 'Statut import',
  permis_conduire: 'Permis de conduire', genre: 'Genre',
}

/** Compare old and new values, returns array of changes */
function detectChanges(
  oldData: Record<string, any>,
  newData: Record<string, any>,
): Array<{ field: string; label: string; old: any; new: any }> {
  const changes: Array<{ field: string; label: string; old: any; new: any }> = []
  for (const [field, newVal] of Object.entries(newData)) {
    const label = FIELD_LABELS[field]
    if (!label) continue // only track labelled fields
    const oldVal = oldData[field]
    // Normalize for comparison
    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '')
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '')
    if (oldStr !== newStr) {
      // Truncate large text fields for readability
      const truncate = (v: any) => {
        if (v == null) return ''
        const s = Array.isArray(v) ? v.join(', ') : String(v)
        return s.length > 100 ? s.slice(0, 100) + '…' : s
      }
      changes.push({ field, label, old: truncate(oldVal), new: truncate(newVal) })
    }
  }
  return changes
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await request.json()
    const supabase = createAdminClient()

    // Filtrer : ne garder que les colonnes autorisées
    const body: Record<string, any> = {}
    for (const [k, v] of Object.entries(rawBody)) {
      if (ALLOWED_COLS.has(k)) body[k] = v
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 })
    }

    // Fetch current data BEFORE update for change tracking
    const { data: oldData } = await supabase
      .from('candidats')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('candidats')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[PATCH candidat] update error:', error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log activité équipe avec suivi des modifications
    try {
      const candidatNom = `${(data as any)?.prenom || ''} ${(data as any)?.nom || ''}`.trim()
      const routeUser = await getRouteUser()

      // Track import_status changes with old → new values
      if (body.import_status && oldData) {
        const oldStatus = (oldData as any).import_status || 'a_traiter'
        const newStatus = body.import_status
        const statusLabels: Record<string, string> = { a_traiter: 'À traiter', traite: 'Validé', archive: 'Archivé' }
        const statusLabel = statusLabels[newStatus] || newStatus
        await logActivityServer({
          ...routeUser,
          type: 'statut_change',
          titre: `${candidatNom} — ${statusLabel}`,
          description: `Statut import : ${statusLabels[oldStatus] || oldStatus} → ${statusLabel}`,
          candidat_id: id,
          candidat_nom: candidatNom,
          metadata: {
            change_type: 'import_status',
            old_status: oldStatus,
            new_status: newStatus,
            old_label: statusLabels[oldStatus] || oldStatus,
            new_label: statusLabel,
          },
        })
      }

      // Track statut_pipeline changes with old → new values
      if (body.statut_pipeline && oldData) {
        const oldPipeline = (oldData as any).statut_pipeline || 'nouveau'
        const newPipeline = body.statut_pipeline
        if (oldPipeline !== newPipeline) {
          const pipelineLabels: Record<string, string> = {
            nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien',
            place: 'Placé', refuse: 'Refusé',
          }
          await logActivityServer({
            ...routeUser,
            type: 'statut_change',
            titre: `${candidatNom} — pipeline ${pipelineLabels[newPipeline] || newPipeline}`,
            description: `Pipeline : ${pipelineLabels[oldPipeline] || oldPipeline} → ${pipelineLabels[newPipeline] || newPipeline}`,
            candidat_id: id,
            candidat_nom: candidatNom,
            metadata: {
              change_type: 'statut_pipeline',
              old_status: oldPipeline,
              new_status: newPipeline,
              old_label: pipelineLabels[oldPipeline] || oldPipeline,
              new_label: pipelineLabels[newPipeline] || newPipeline,
            },
          })
        }
      }

      // Field-level change tracking
      if (oldData) {
        const changes = detectChanges(oldData, body)
        if (changes.length > 0) {
          const titrePoste = (data as any)?.titre_poste || ''
          const changedLabels = changes.map(c => c.label).join(', ')
          await logActivityServer({
            ...routeUser,
            type: 'candidat_modifie',
            titre: `Profil ${candidatNom}${titrePoste ? ` — ${titrePoste}` : ''} mis à jour`,
            description: `${changes.length} champ(s) modifié(s): ${changedLabels}`,
            candidat_id: id,
            candidat_nom: candidatNom,
            metadata: { changes },
          })
        }
      }
    } catch {}

    return NextResponse.json({ candidat: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase.from('candidats').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
