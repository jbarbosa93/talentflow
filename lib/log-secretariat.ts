// lib/log-secretariat.ts — Helper pour logger les modifications secrétariat
import type { SupabaseClient } from '@supabase/supabase-js'

interface LogParams {
  supabase: SupabaseClient
  action: 'create' | 'update' | 'delete'
  table: string
  referenceId: string
  nomCandidat?: string | null
  champsModifies?: Record<string, { avant: any; apres: any }>
}

export async function logSecretariat({ supabase, action, table, referenceId, nomCandidat, champsModifies }: LogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await (supabase as any).from('logs_secretariat').insert({
      user_id: user.id,
      user_email: user.email,
      user_nom: [user.user_metadata?.prenom, user.user_metadata?.nom].filter(Boolean).join(' ') || user.email,
      action,
      table_concernee: table,
      reference_id: referenceId,
      nom_candidat: nomCandidat || null,
      champs_modifies: champsModifies || null,
    })
  } catch (e: any) {
    console.error('[logSecretariat] Error:', e.message)
  }
}

/**
 * Compare l'ancien et le nouveau record, retourne les champs modifiés
 */
export function diffChanges(before: Record<string, any>, after: Record<string, any>): Record<string, { avant: any; apres: any }> | null {
  const skip = ['id', 'created_at', 'updated_at', 'candidat_id', 'annee']
  const diff: Record<string, { avant: any; apres: any }> = {}

  for (const key of Object.keys(after)) {
    if (skip.includes(key)) continue
    if (after[key] !== undefined && String(before[key] ?? '') !== String(after[key] ?? '')) {
      diff[key] = { avant: before[key] ?? null, apres: after[key] }
    }
  }

  return Object.keys(diff).length > 0 ? diff : null
}
