import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Remet en file d'attente les fichiers orphelins :
// traite=true MAIS candidat_id IS NULL ET erreur ne commence pas par "Abandonné", "Document", "Doublon"
// Ces fichiers ont été marqués "traités" mais aucun candidat n'a été créé (bug ancien insert unique)
export async function POST() {
  try {
    const supabase = createAdminClient()

    // Trouver tous les fichiers orphelins
    const { data: orphans, error } = await (supabase as any)
      .from('onedrive_fichiers')
      .select('id, nom_fichier, onedrive_item_id, erreur')
      .eq('traite', true)
      .is('candidat_id', null)

    if (error) throw error

    // Filtrer : exclure les fichiers volontairement sans candidat (abandonnés, documents, doublons)
    const toReset = (orphans || []).filter((f: any) => {
      const err = f.erreur || ''
      return !err.startsWith('Abandonné') &&
             !err.startsWith('Document') &&
             !err.startsWith('Doublon') &&
             !err.includes('non-CV') &&
             !err.includes('sans candidat')
    })

    if (toReset.length === 0) {
      return NextResponse.json({ reset: 0, message: 'Aucun fichier orphelin trouvé' })
    }

    // Remettre à traite:false pour forcer le re-traitement
    const ids = toReset.map((f: any) => f.id)
    const { error: updateError } = await (supabase as any)
      .from('onedrive_fichiers')
      .update({ traite: false, erreur: 'Remis en file — re-sync forcé' })
      .in('id', ids)

    if (updateError) throw updateError

    return NextResponse.json({
      reset: toReset.length,
      files: toReset.map((f: any) => f.nom_fichier).slice(0, 20),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
