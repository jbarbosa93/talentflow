// v2.7.3 — Helper : récupère ou crée le portail client d'une entreprise
// Utilisé par /api/admin/reports (POST + PATCH) quand use_client_portal=true.
//
// Retourne le slug permanent pour générer le lien /client-portal/{slug}?tab=rapports
// envoyé au client à chaque signature candidat.

import { createAdminClient } from '@/lib/supabase/admin'
import { generatePortalSlug } from '@/lib/compliance/slug'

export interface PortalForClient {
  id: string
  slug: string
  is_active: boolean
  /** true si le portail vient d'être créé par cet appel, false s'il existait déjà */
  created: boolean
}

/**
 * Récupère le portail actif d'un client. Si aucun portail n'existe → en crée un
 * automatiquement (slug 16 chars random + is_active=true).
 *
 * Si un portail INACTIF existe → le réactive (plutôt que d'en créer un 2e).
 *
 * @param clientId UUID du client
 * @param createdBy UUID user (pour audit), optionnel
 * @returns null si client introuvable ou erreur DB
 */
export async function getOrCreateClientPortal(
  clientId: string,
  createdBy?: string | null,
): Promise<PortalForClient | null> {
  if (!clientId) return null

  const admin = createAdminClient()

  // 1. Cherche un portail existant (le plus récent, n'importe quel statut)
  const { data: existing } = await (admin as any)
    .from('client_portals')
    .select('id, slug, is_active')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Si inactif → réactive plutôt que d'en créer un 2e
    if (!existing.is_active) {
      await (admin as any)
        .from('client_portals')
        .update({ is_active: true })
        .eq('id', existing.id)
    }
    return {
      id: existing.id,
      slug: existing.slug,
      is_active: true,
      created: false,
    }
  }

  // 2. Aucun portail → vérifie que le client existe
  const { data: client } = await (admin as any)
    .from('clients')
    .select('id, nom_entreprise')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return null

  // 3. Crée le portail
  const slug = await generatePortalSlug()
  const { data, error } = await (admin as any)
    .from('client_portals')
    .insert({
      client_id: clientId,
      slug,
      name: `L-AGENCE SA — ${client.nom_entreprise}`.slice(0, 200),
      is_active: true,
      created_by: createdBy || null,
    })
    .select('id, slug, is_active')
    .single()

  if (error || !data) {
    console.error('[getOrCreateClientPortal] insert failed', error)
    return null
  }

  return {
    id: data.id,
    slug: data.slug,
    is_active: true,
    created: true,
  }
}
