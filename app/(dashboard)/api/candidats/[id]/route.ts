// app/(dashboard)/api/candidats/[id]/route.ts
// Lecture / mise à jour / suppression d'un candidat via admin client (bypasse RLS)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
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
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// Toutes les colonnes modifiables de la table candidats
const ALLOWED_COLS = new Set([
  'nom','prenom','email','telephone','localisation','titre_poste',
  'competences','formation','resume_ia','cv_texte_brut','statut_pipeline','tags','notes','source',
  'langues','permis_conduire','date_naissance','experiences','formations_details','photo_url','documents','import_status','rating','genre',
  'cv_url','cv_nom_fichier','cfc','deja_engage',
  'pipeline_consultant','pipeline_metier',
  'created_at','has_update',
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
  photo_url: 'Photo', cv_url: 'CV', cv_nom_fichier: 'Fichier CV',
  formation: 'Formation',
  notes: 'Notes', tags: 'Tags', rating: 'Note',
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
    // Skip if both are effectively empty
    const oldEmpty = !oldVal || oldStr === '' || oldStr === 'null' || oldStr === '[]' || oldStr === 'false'
    const newEmpty = !newVal || newStr === '' || newStr === 'null' || newStr === '[]' || newStr === 'false'
    if (oldEmpty && newEmpty) continue
    if (oldStr !== newStr) {
      // Truncate large text fields for readability
      const truncate = (v: any, fieldName?: string) => {
        if (v == null) return ''
        // For URL fields, just show a short label
        if (fieldName && (fieldName === 'photo_url' || fieldName === 'cv_url')) {
          return v ? '✓' : ''
        }
        const s = Array.isArray(v) ? v.join(', ') : String(v)
        return s.length > 100 ? s.slice(0, 100) + '…' : s
      }
      changes.push({ field, label, old: truncate(oldVal, field), new: truncate(newVal, field) })
    }
  }
  return changes
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
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

    // Pipeline : interdire statut_pipeline non-null sans pipeline_consultant
    if (body.statut_pipeline && body.statut_pipeline !== null && !body.pipeline_consultant) {
      // Vérifier si le candidat a déjà un consultant en DB
      const { data: existing } = await supabase.from('candidats').select('pipeline_consultant' as any).eq('id', id).single()
      if (!(existing as any)?.pipeline_consultant) {
        return NextResponse.json({ error: 'Un consultant doit être sélectionné pour ajouter au pipeline' }, { status: 400 })
      }
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
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
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
    } catch (err) { console.warn('[candidats/id] logActivity failed:', (err as Error).message) }

    return NextResponse.json({ candidat: data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase.from('candidats').delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
