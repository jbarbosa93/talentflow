// lib/log-secretariat.ts — Helper pour logger les modifications secrétariat
// v2.9.75 — Accepte user en paramètre (fix bug user=null silent depuis v2.7.5)
import type { SupabaseClient, User } from '@supabase/supabase-js'

interface LogParams {
  supabase: SupabaseClient
  action: 'create' | 'update' | 'delete'
  table: string
  referenceId: string
  nomCandidat?: string | null
  champsModifies?: Record<string, { avant: any; apres: any }>
  /** v2.6.7 — Passer l'user explicitement pour éviter le fail silencieux quand getUser() retourne null après l'UPDATE. */
  user?: User | null
}

export async function logSecretariat({ supabase, action, table, referenceId, nomCandidat, champsModifies, user }: LogParams) {
  try {
    // v2.6.7 — Priorité à l'user passé en param, fallback à auth.getUser()
    let u: User | null = user || null
    if (!u) {
      const { data } = await supabase.auth.getUser()
      u = data?.user || null
    }
    if (!u) {
      console.warn('[logSecretariat] Skipped: no user (action=' + action + ', table=' + table + ', id=' + referenceId + ')')
      return
    }

    const { error } = await (supabase as any).from('logs_secretariat').insert({
      user_id: u.id,
      user_email: u.email,
      user_nom: [u.user_metadata?.prenom, u.user_metadata?.nom].filter(Boolean).join(' ') || u.email,
      action,
      table_concernee: table,
      reference_id: referenceId,
      nom_candidat: nomCandidat || null,
      champs_modifies: champsModifies || null,
    })
    if (error) {
      console.error('[logSecretariat] Insert error:', error.message, '(action=' + action + ', table=' + table + ')')
    }
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
