// app/(dashboard)/api/plannings/route.ts
// GET    /api/plannings?semaine=xx&annee=xxxx&statut=actif
// POST   /api/plannings   body: { candidat_id?, client_nom, metier, pourcentage, remarques, statut, semaine, annee }
// PATCH  /api/plannings   body: { id, ...fields }
// DELETE /api/plannings   body: { id }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const semaine = searchParams.get('semaine')
    const annee   = searchParams.get('annee')
    const statut  = searchParams.get('statut') || ''

    let query = (supabase as any)
      .from('plannings')
      .select(`
        id, candidat_id, client_nom, metier, pourcentage, remarques,
        statut, semaine, annee, user_id, created_at, updated_at,
        candidats ( id, nom, prenom, cv_url, titre_poste )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (semaine) query = query.eq('semaine', parseInt(semaine))
    if (annee)   query = query.eq('annee', parseInt(annee))
    if (statut)  query = query.eq('statut', statut)

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ plannings: data ?? [] })
  } catch (e: any) {
    console.error('[plannings] GET error:', e)
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const {
      candidat_id = null,
      client_nom = '',
      metier = '',
      pourcentage = 1,
      remarques = '',
      statut = 'actif',
      semaine,
      annee,
    } = body

    if (!semaine || !annee) {
      return NextResponse.json({ error: 'semaine et annee sont requis' }, { status: 400 })
    }

    const { data, error } = await (supabase as any)
      .from('plannings')
      .insert({
        candidat_id: candidat_id || null,
        client_nom:  client_nom  || null,
        metier:      metier      || null,
        pourcentage: Number(pourcentage),
        remarques:   remarques   || null,
        statut,
        semaine:     Number(semaine),
        annee:       Number(annee),
        user_id:     user.id,
      })
      .select(`
        id, candidat_id, client_nom, metier, pourcentage, remarques,
        statut, semaine, annee, user_id, created_at, updated_at,
        candidats ( id, nom, prenom, cv_url, titre_poste )
      `)
      .single()

    if (error) throw error
    return NextResponse.json({ planning: data }, { status: 201 })
  } catch (e: any) {
    console.error('[plannings] POST error:', e)
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'id est requis' }, { status: 400 })
    }

    // Only allow updating specific fields
    const allowed: Record<string, unknown> = {}
    const allowedKeys = ['candidat_id', 'client_nom', 'metier', 'pourcentage', 'remarques', 'statut', 'semaine', 'annee']
    for (const key of allowedKeys) {
      if (key in fields) allowed[key] = fields[key]
    }
    allowed.updated_at = new Date().toISOString()

    const { data, error } = await (supabase as any)
      .from('plannings')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(`
        id, candidat_id, client_nom, metier, pourcentage, remarques,
        statut, semaine, annee, user_id, created_at, updated_at,
        candidats ( id, nom, prenom, cv_url, titre_poste )
      `)
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Planning introuvable' }, { status: 404 })

    return NextResponse.json({ planning: data })
  } catch (e: any) {
    console.error('[plannings] PATCH error:', e)
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'id est requis' }, { status: 400 })
    }

    const { error } = await (supabase as any)
      .from('plannings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[plannings] DELETE error:', e)
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
