// app/(dashboard)/api/clients/[id]/route.ts
// GET / PATCH / DELETE un client par id

import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'
import { extractSecteursFromClient, sanitizeSecteurs } from '@/lib/secteurs-extractor'
import { geocodeLocalisation, geocodeAddress } from '@/lib/geocode-localisation'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const supabase = createAdminClient() as any

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    return NextResponse.json({ client: data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

const ALLOWED_COLS = new Set([
  'nom_entreprise', 'adresse', 'npa', 'ville', 'canton',
  'telephone', 'email', 'secteur', 'notes', 'site_web', 'statut', 'contacts',
  'secteurs_activite', // v1.9.114 — édition manuelle multi-tag taxonomie fermée
  'zefix_uid', // v1.9.117 — saisie manuelle CHE-XXX.XXX.XXX
  'latitude', 'longitude', // v1.9.118 — override manuel coords (rare, sinon recalcul auto)
])

// Labels français pour le suivi des modifications client
const CLIENT_FIELD_LABELS: Record<string, string> = {
  nom_entreprise: 'Nom entreprise', adresse: 'Adresse', npa: 'NPA',
  ville: 'Ville', canton: 'Canton', telephone: 'Téléphone',
  email: 'Email', secteur: 'Secteur', site_web: 'Site web',
  notes: 'Notes', statut: 'Statut', contacts: 'Contacts',
  secteurs_activite: 'Secteurs d\'activité',
  zefix_uid: 'IDE / Zefix UID',
}

/** Compare old and new values, returns array of changes */
function detectClientChanges(
  oldData: Record<string, any>,
  newData: Record<string, any>,
): Array<{ field: string; label: string; old: any; new: any }> {
  const changes: Array<{ field: string; label: string; old: any; new: any }> = []
  for (const [field, newVal] of Object.entries(newData)) {
    const label = CLIENT_FIELD_LABELS[field]
    if (!label) continue
    const oldVal = oldData[field]
    const oldStr = Array.isArray(oldVal) || typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? '')
    const newStr = Array.isArray(newVal) || typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? '')
    if (oldStr !== newStr) {
      const truncate = (v: any) => {
        if (v == null) return ''
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
        return s.length > 100 ? s.slice(0, 100) + '...' : s
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
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const rawBody = await request.json()
    const supabase = createAdminClient() as any

    const body: Record<string, any> = {}
    for (const [k, v] of Object.entries(rawBody)) {
      if (ALLOWED_COLS.has(k)) body[k] = v
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide a mettre a jour' }, { status: 400 })
    }

    // Fetch current data BEFORE update for change tracking
    const { data: oldData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    // v1.9.114 — Gestion secteurs_activite :
    // 1. Si l'utilisateur fournit secteurs_activite explicitement → sanitize (taxonomie fermée)
    // 2. Sinon, si notes change ET pas de secteurs déjà en place → extraire auto
    //    (v1.9.116 fix : ne PAS écraser des secteurs déjà choisis quand l'user édite les notes —
    //    avant, vider les notes vidait aussi les secteurs, ce qui était surprenant)
    if (body.secteurs_activite !== undefined) {
      body.secteurs_activite = sanitizeSecteurs(body.secteurs_activite)
    } else if (
      body.notes !== undefined && oldData && body.notes !== oldData.notes
      && (!oldData.secteurs_activite || oldData.secteurs_activite.length === 0)
    ) {
      const result = extractSecteursFromClient(body.notes, oldData.secteur)
      body.secteurs_activite = result.secteurs
    }

    // v1.9.119 — Re-géocoder si adresse / npa / ville change (et lat/lng pas forcés)
    // Étape 1 (sync) : centroïde NPA via lookup local instantané — coords disponibles
    // immédiatement dans la response. Étape 2 (after) : Nominatim adresse précise en bg.
    const adresseChanged = body.adresse !== undefined && oldData && body.adresse !== oldData.adresse
    const villeChanged = body.ville !== undefined && oldData && body.ville !== oldData.ville
    const npaChanged = body.npa !== undefined && oldData && body.npa !== oldData.npa
    const latLngForced = body.latitude !== undefined || body.longitude !== undefined
    const geocodingTriggered = (adresseChanged || villeChanged || npaChanged) && !latLngForced
    if (geocodingTriggered) {
      try {
        const npa = body.npa !== undefined ? body.npa : oldData.npa
        const ville = body.ville !== undefined ? body.ville : oldData.ville
        if (npa || ville) {
          const loc = `${npa ? npa + ' ' : ''}${ville || ''}, Suisse`.trim()
          const geo = await geocodeLocalisation(loc)
          if (geo) {
            body.latitude = geo.latitude
            body.longitude = geo.longitude
          } else {
            // Adresse devenue invalide → reset coords (carte sera vide jusqu'à correction)
            body.latitude = null
            body.longitude = null
          }
        }
      } catch (err) { console.warn('[clients PATCH] geocode centroïde failed:', (err as Error).message) }
    }

    const { data, error } = await supabase
      .from('clients')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // v1.9.119 — Géocodage adresse précise en BACKGROUND (fire-and-forget).
    // Déclenché si adresse/npa/ville a changé, et qu'on a une adresse non vide à geocoder.
    if (geocodingTriggered) {
      const finalAdresse = body.adresse !== undefined ? body.adresse : oldData.adresse
      const finalNpa = body.npa !== undefined ? body.npa : oldData.npa
      const finalVille = body.ville !== undefined ? body.ville : oldData.ville
      if (finalAdresse && finalAdresse.trim() && (finalNpa || finalVille)) {
        after(async () => {
          try {
            const geo = await geocodeAddress(finalAdresse, finalNpa, finalVille, 'Suisse')
            if (geo && geo.source === 'address') {
              await supabase
                .from('clients')
                .update({ latitude: geo.latitude, longitude: geo.longitude })
                .eq('id', id)
            }
          } catch (err) { console.warn('[clients PATCH after] geocode address failed:', (err as Error).message) }
        })
      }
    }

    // Field-level change tracking
    try {
      if (oldData) {
        const changes = detectClientChanges(oldData, body)
        if (changes.length > 0) {
          const routeUser = await getRouteUser()
          const clientNom = (data as any)?.nom_entreprise || ''
          const changedLabels = changes.map(c => c.label).join(', ')
          await logActivityServer({
            ...routeUser,
            type: 'client_modifie',
            titre: `Client ${clientNom} mis à jour`,
            description: `${changes.length} champ(s) modifié(s): ${changedLabels}`,
            client_id: id,
            client_nom: clientNom,
            metadata: { changes },
          })
        }
      }
    } catch (err) { console.warn('[clients/id] logActivity failed:', (err as Error).message) }

    return NextResponse.json({ client: data })
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
    const supabase = createAdminClient() as any

    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
