// app/(dashboard)/api/missions/import-notion/route.ts
// Import de missions depuis Notion
// POST sans body → liste les bases Notion disponibles
// POST { database_id } → importe les entrées comme missions

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const NOTION_VERSION = '2022-06-28'

function notionFetch(path: string, method = 'GET', body?: object) {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('NOTION_TOKEN manquant dans les variables d\'environnement')
  return fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Extrait une valeur de propriété Notion selon son type
function extractPropValue(prop: any): string | number | null {
  if (!prop) return null
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t: any) => t.plain_text).join('') || null
    case 'rich_text':
      return prop.rich_text?.map((t: any) => t.plain_text).join('') || null
    case 'number':
      return prop.number ?? null
    case 'select':
      return prop.select?.name || null
    case 'date':
      return prop.date?.start || null
    case 'formula':
      if (prop.formula?.type === 'number') return prop.formula.number ?? null
      if (prop.formula?.type === 'string') return prop.formula.string || null
      return null
    default:
      return null
  }
}

// Essaie de trouver une valeur dans un objet de propriétés en cherchant par mots-clés
function findPropByKeywords(props: Record<string, any>, keywords: string[]): any {
  const keys = Object.keys(props)
  for (const kw of keywords) {
    const found = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()))
    if (found) return props[found]
  }
  return null
}

// POST /api/missions/import-notion
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { database_id } = body

    // Mode liste : retourne les bases disponibles
    if (!database_id) {
      const res = await notionFetch('/search', 'POST', {
        filter: { value: 'database', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      })
      if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err.message || `Notion API erreur ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      const databases = (data.results || []).map((db: any) => ({
        id: db.id,
        title: db.title?.map((t: any) => t.plain_text).join('') || 'Sans titre',
        last_edited: db.last_edited_time,
        url: db.url,
      }))
      return NextResponse.json({ databases })
    }

    // Mode import : importer les entrées de la base donnée
    const allPages: any[] = []
    let cursor: string | undefined = undefined
    let hasMore = true

    while (hasMore) {
      const queryBody: any = { page_size: 100 }
      if (cursor) queryBody.start_cursor = cursor

      const res = await notionFetch(`/databases/${database_id}/query`, 'POST', queryBody)
      if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err.message || `Notion API erreur ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      allPages.push(...(data.results || []))
      hasMore = data.has_more
      cursor = data.next_cursor
    }

    if (!allPages.length) {
      return NextResponse.json({ imported: 0, skipped: 0, errors: [], message: 'Aucune entrée trouvée dans cette base' })
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const page of allPages) {
      try {
        const props = page.properties || {}

        // Extraction des champs — flexible sur les noms de colonnes
        const candidat_nom = extractPropValue(
          findPropByKeywords(props, ['candidat', 'nom candidat', 'travailleur', 'intérimaire', 'interim'])
        ) as string | null

        const client_nom = extractPropValue(
          findPropByKeywords(props, ['client', 'entreprise', 'société', 'employeur'])
        ) as string | null

        const metier = extractPropValue(
          findPropByKeywords(props, ['métier', 'metier', 'poste', 'fonction', 'profession'])
        ) as string | null

        const date_debut_raw = extractPropValue(
          findPropByKeywords(props, ['début', 'debut', 'date début', 'start', 'date_debut'])
        ) as string | null

        const date_fin_raw = extractPropValue(
          findPropByKeywords(props, ['fin', 'date fin', 'end', 'date_fin'])
        ) as string | null

        const marge_raw = extractPropValue(
          findPropByKeywords(props, ['marge', 'marge brute', 'bénéfice', 'benefice', 'profit'])
        )

        const coeff_raw = extractPropValue(
          findPropByKeywords(props, ['coefficient', 'coeff', 'multiplicateur'])
        )

        const statut_raw = extractPropValue(
          findPropByKeywords(props, ['statut', 'status', 'état', 'etat'])
        ) as string | null

        const notes_raw = extractPropValue(
          findPropByKeywords(props, ['notes', 'commentaires', 'remarques', 'description'])
        ) as string | null

        // date_debut : fallback sur created_time de la page Notion
        const date_debut_resolved = date_debut_raw || (page.created_time ? page.created_time.slice(0, 10) : null)
        if (!date_debut_resolved) {
          skipped++
          continue
        }

        // marge_brute obligatoire (avec fallback à 0)
        const marge_brute = marge_raw !== null ? Number(marge_raw) : 0

        // Normalisation statut
        let statut = 'en_cours'
        if (statut_raw) {
          const s = statut_raw.toLowerCase()
          if (s.includes('termin') || s.includes('fini') || s.includes('closed') || s.includes('done')) {
            statut = 'terminee'
          } else if (s.includes('annul') || s.includes('cancel')) {
            statut = 'annulee'
          }
        }

        const payload = {
          notion_page_id: page.id,
          candidat_nom: candidat_nom || null,
          client_nom: client_nom || null,
          metier: metier || null,
          date_debut: date_debut_resolved,
          date_fin: date_fin_raw || null,
          marge_brute,
          coefficient: coeff_raw !== null ? Number(coeff_raw) : 1,
          statut,
          notes: notes_raw || null,
          updated_at: new Date().toISOString(),
        }

        // Upsert sur notion_page_id — re-import sans doublon
        const { error } = await (supabase as any)
          .from('missions')
          .upsert(payload, { onConflict: 'notion_page_id', ignoreDuplicates: false })

        if (error) {
          errors.push(`Page ${page.id}: ${error.message}`)
        } else {
          imported++
        }
      } catch (e: any) {
        errors.push(`Page ${page.id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors: errors.slice(0, 10), // max 10 erreurs remontées
      total: allPages.length,
      message: `${imported} mission(s) importée(s)${skipped ? `, ${skipped} ignorée(s) (date manquante)` : ''}${errors.length ? `, ${errors.length} erreur(s)` : ''}`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
