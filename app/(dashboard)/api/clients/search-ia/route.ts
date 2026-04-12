// app/(dashboard)/api/clients/search-ia/route.ts
// POST /api/clients/search-ia — Recherche d'entreprise via Claude web_search + Zefix

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

interface SearchResult {
  nom_entreprise: string
  adresse: string
  npa: string
  ville: string
  canton: string
  telephone: string
  email: string
  site_web: string
  secteur: string
  source: string
  uid: string
  already_exists?: boolean
}

/** Extraire tout le texte des content blocks (web_search retourne plusieurs blocks) */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n')
}

/** Parser un JSON depuis un texte brut (gère backticks, texte autour) */
function parseJsonFromText(text: string, fallback: '[]' | '{}'): any {
  let cleaned = text.replace(/```json|```JSON|```/g, '').trim()
  if (fallback === '[]') {
    const first = cleaned.indexOf('[')
    const last = cleaned.lastIndexOf(']')
    if (first !== -1 && last > first) cleaned = cleaned.substring(first, last + 1)
  } else {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first !== -1 && last > first) cleaned = cleaned.substring(first, last + 1)
  }
  return JSON.parse(cleaned)
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Requete vide' }, { status: 400 })
    }

    const trimmedQuery = query.trim()
    const anthropic = new Anthropic()
    const results: SearchResult[] = []

    // --- Recherche via Claude avec web_search (source principale) ---
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [{
          type: 'web_search_20250305' as any,
          name: 'web_search',
          max_uses: 5,
          user_location: {
            type: 'approximate' as const,
            country: 'CH',
            region: 'Vaud',
            city: 'Lausanne',
            timezone: 'Europe/Zurich',
          },
        } as any],
        messages: [{
          role: 'user',
          content: `Recherche l'entreprise "${trimmedQuery}" dans le registre du commerce suisse (zefix.ch) et dans les annuaires suisses (local.ch, search.ch).

Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks, sans explication) — un tableau d'entreprises trouvées :
[
  {
    "nom_entreprise": "Nom officiel complet",
    "adresse": "Rue et numéro",
    "npa": "Code postal",
    "ville": "Ville",
    "canton": "Abréviation canton (VD, GE, VS...)",
    "telephone": "Numéro de téléphone principal",
    "site_web": "site web sans https://",
    "secteur": "Activité principale en 2-5 mots",
    "uid": "Numéro IDE (CHE-xxx.xxx.xxx) si trouvé"
  }
]

Règles :
- Cherche sur zefix.ch pour le nom officiel, l'adresse, le canton et le numéro IDE
- Cherche sur local.ch ou search.ch pour le téléphone et le site web
- Maximum 5 résultats
- Si aucune entreprise trouvée, retourne []
- telephone : format suisse (ex: "021 653 14 31" ou "+41 21 653 14 31")
- site_web : sans https:// (ex: "www.exemple.ch")
- Ne retourne QUE le JSON, rien d'autre`,
        }],
      })

      const text = extractText(response.content as any)
      console.log('[search-ia] web_search response text length:', text.length)

      if (text) {
        try {
          const parsed = parseJsonFromText(text, '[]')
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              results.push({
                nom_entreprise: item.nom_entreprise || trimmedQuery,
                adresse: item.adresse || '',
                npa: item.npa || '',
                ville: item.ville || '',
                canton: item.canton || '',
                telephone: item.telephone || '',
                email: '',
                site_web: item.site_web || '',
                secteur: item.secteur || '',
                source: 'zefix+ia',
                uid: item.uid || '',
              })
            }
          }
        } catch (parseErr) {
          console.warn('[search-ia] JSON parse failed:', (parseErr as Error).message, 'text:', text.substring(0, 300))
        }
      }
    } catch (err) {
      console.error('[search-ia] web_search failed:', (err as Error).message)

      // Fallback : Claude sans web_search (connaissance générale uniquement)
      try {
        const fallbackResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Recherche l'entreprise "${trimmedQuery}" en Suisse.
Retourne UNIQUEMENT un JSON valide — un tableau de 1 à 3 entreprises :
[{"nom_entreprise":"","adresse":"","npa":"","ville":"","canton":"","secteur":"","uid":""}]
- secteur : activité principale en 2-5 mots
- Si inconnue, retourne []`,
          }],
        })

        const fallbackText = extractText(fallbackResponse.content as any)
        if (fallbackText) {
          const parsed = parseJsonFromText(fallbackText, '[]')
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              results.push({
                nom_entreprise: item.nom_entreprise || trimmedQuery,
                adresse: item.adresse || '',
                npa: item.npa || '',
                ville: item.ville || '',
                canton: item.canton || '',
                telephone: '',
                email: '',
                site_web: '',
                secteur: item.secteur || '',
                source: 'ia',
                uid: '',
              })
            }
          }
        }
      } catch (fallbackErr) {
        console.error('[search-ia] fallback also failed:', (fallbackErr as Error).message)
      }
    }

    // --- Vérifier les doublons en DB ---
    if (results.length > 0) {
      const supabase = createAdminClient() as any

      for (let i = 0; i < results.length; i++) {
        const name = results[i].nom_entreprise
        try {
          const { data: existing } = await supabase
            .from('clients')
            .select('id, nom_entreprise')
            .ilike('nom_entreprise', `%${name.replace(/[%_]/g, '')}%`)
            .limit(1)

          if (existing && existing.length > 0) {
            results[i].already_exists = true
          }
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[search-ia] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
