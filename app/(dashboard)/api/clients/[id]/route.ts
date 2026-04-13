// app/(dashboard)/api/clients/[id]/route.ts
// GET / PATCH / DELETE un client par id

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
])

// Labels français pour le suivi des modifications client
const CLIENT_FIELD_LABELS: Record<string, string> = {
  nom_entreprise: 'Nom entreprise', adresse: 'Adresse', npa: 'NPA',
  ville: 'Ville', canton: 'Canton', telephone: 'Téléphone',
  email: 'Email', secteur: 'Secteur', site_web: 'Site web',
  notes: 'Notes', statut: 'Statut', contacts: 'Contacts',
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

    const { data, error } = await supabase
      .from('clients')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
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
