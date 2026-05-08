// app/(dashboard)/api/clients/match-email/route.ts
// v2.2.3 — Pack 1bis : trouve un client par domaine email
//
// GET /api/clients/match-email?email=info@l-agence.ch
// Réponse :
//   { client: { id, nom_entreprise, contacts[] } | null,
//     isAlreadyContact: boolean,
//     matchType: 'site_web' | 'email_principal' | 'contact_existant' | null }
//
// Utilisé par /sign/new pour proposer "ajouter comme contact" quand
// l'email saisi correspond au domaine d'une entreprise cliente.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

// Liste de domaines à ignorer (génériques) — un email gmail ne doit pas matcher.
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'free.fr', 'orange.fr',
  'wanadoo.fr', 'sfr.fr', 'laposte.net', 'bluewin.ch', 'sunrise.ch',
  'protonmail.com', 'pm.me', 'gmx.ch', 'gmx.fr', 'gmx.com',
])

function extractDomain(email: string): string | null {
  const m = email.toLowerCase().trim().match(/^[^@]+@([a-z0-9.-]+\.[a-z]{2,})$/i)
  if (!m) return null
  let dom = m[1]
  // Strip "www." si présent
  if (dom.startsWith('www.')) dom = dom.slice(4)
  return dom
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const email = (searchParams.get('email') || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ client: null, isAlreadyContact: false, matchType: null })

    const domain = extractDomain(email)
    if (!domain || GENERIC_DOMAINS.has(domain)) {
      return NextResponse.json({ client: null, isAlreadyContact: false, matchType: null })
    }

    const supabase = createAdminClient()
    // Cherche les clients dont site_web ou email principal contient le domaine.
    // Utilise ILIKE %domaine% pour matcher https://l-agence.ch, www.l-agence.ch, etc.
    const { data: clients } = await supabase
      .from('clients' as any)
      .select('id, nom_entreprise, email, site_web, contacts')
      .or(`site_web.ilike.%${domain}%,email.ilike.%@${domain}%`)
      .limit(5)

    const list = (clients || []) as unknown as Array<{
      id: string
      nom_entreprise: string
      email: string | null
      site_web: string | null
      contacts: Array<{ firstName?: string; lastName?: string; email?: string; phone?: string; role?: string }> | null
    }>

    if (list.length === 0) {
      return NextResponse.json({ client: null, isAlreadyContact: false, matchType: null })
    }

    // Premier match (le plus probable)
    const client = list[0]

    // Détermine le type de match
    let matchType: 'site_web' | 'email_principal' | 'contact_existant' | null = null
    if (client.site_web && client.site_web.toLowerCase().includes(domain)) matchType = 'site_web'
    else if (client.email && client.email.toLowerCase().includes(`@${domain}`)) matchType = 'email_principal'

    // Vérifie si l'email exact est déjà dans contacts
    const isAlreadyContact = (client.contacts || []).some(c =>
      c.email && c.email.toLowerCase().trim() === email
    )
    if (isAlreadyContact) matchType = 'contact_existant'

    return NextResponse.json({
      client: {
        id: client.id,
        nom_entreprise: client.nom_entreprise,
        contacts: client.contacts || [],
      },
      isAlreadyContact,
      matchType,
    })
  } catch (e) {
    console.error('[clients/match-email] error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
