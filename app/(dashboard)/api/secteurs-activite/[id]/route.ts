import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateSecteursCache } from '@/lib/secteurs-config-server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

// PATCH — Modifier un secteur (renommage propagé aux clients qui l'utilisent)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin()
  if (adminError) return adminError

  try {
    const { id } = await params
    const body = await request.json()
    const supabase = createAdminClient()

    // Récupérer le secteur actuel pour détecter un renommage
    const { data: oldRow, error: fetchErr } = await (supabase
      .from('secteurs_activite_config' as any) as any)
      .select('nom')
      .eq('id', id)
      .single()
    if (fetchErr || !oldRow) {
      return NextResponse.json({ error: 'Secteur introuvable' }, { status: 404 })
    }
    const oldNom = (oldRow as any).nom as string

    // Construire l'update (champs autorisés uniquement)
    const update: Record<string, any> = {}
    if (typeof body.nom === 'string') {
      const newNom = body.nom.trim()
      if (!newNom) {
        return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
      }
      update.nom = newNom
    }
    if (body.metier_representatif !== undefined) {
      const m = (body.metier_representatif || '').toString().trim()
      update.metier_representatif = m || null
    }
    if (typeof body.ordre === 'number') {
      update.ordre = body.ordre
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
    }

    // Update du secteur
    const { data, error } = await (supabase
      .from('secteurs_activite_config' as any) as any)
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Un secteur avec ce nom existe déjà' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Propagation auto du renommage aux clients qui ont l'ancien nom dans secteurs_activite[]
    let nbClientsMisAJour = 0
    if (update.nom && update.nom !== oldNom) {
      // ARRAY_REPLACE remplace toutes les occurrences de oldNom par update.nom
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
        'rename_secteur_activite',
        { p_old_nom: oldNom, p_new_nom: update.nom }
      )
      if (!rpcErr && typeof rpcData === 'number') {
        nbClientsMisAJour = rpcData
      }
    }

    invalidateSecteursCache()
    return NextResponse.json({ secteur: data, clients_renommes: nbClientsMisAJour })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// DELETE — Supprimer un secteur (refuse si encore utilisé, sauf force=true)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin()
  if (adminError) return adminError

  try {
    const { id } = await params
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === 'true'
    const supabase = createAdminClient()

    // Récupérer le nom pour count usage
    const { data: row, error: fetchErr } = await (supabase
      .from('secteurs_activite_config' as any) as any)
      .select('nom')
      .eq('id', id)
      .single()
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Secteur introuvable' }, { status: 404 })
    }
    const nom = (row as any).nom as string

    // Compter les clients qui utilisent ce secteur (cast any car 'clients' pas dans types DB auto-générés)
    const { count, error: countErr } = await ((supabase as any)
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .contains('secteurs_activite', [nom]))
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }
    const usage = count || 0

    if (usage > 0 && !force) {
      return NextResponse.json({
        error: 'Secteur utilisé',
        usage,
        message: `Ce secteur est utilisé par ${usage} client(s). Ajoute ?force=true pour le retirer aussi de ces clients.`,
      }, { status: 409 })
    }

    // Si force = true, retirer le secteur de tous les clients qui l'ont
    if (usage > 0 && force) {
      await (supabase.rpc as any)('remove_secteur_from_clients', { p_nom: nom })
    }

    const { error: delErr } = await (supabase
      .from('secteurs_activite_config' as any) as any)
      .delete()
      .eq('id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    invalidateSecteursCache()
    return NextResponse.json({ success: true, clients_nettoyes: usage })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
