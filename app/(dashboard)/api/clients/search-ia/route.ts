// app/(dashboard)/api/clients/search-ia/route.ts
// POST /api/clients/search-ia — Recherche IA d'entreprise via Zefix + Claude

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

interface ZefixCompany {
  name: string
  uid: string
  chlesId?: number
  legalSeat: string
  canton: { abbreviation: string }
  status: string
  address?: { street?: string; houseNumber?: string; swissZipCode?: string; city?: string }
}

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

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Requete vide' }, { status: 400 })
    }

    const trimmedQuery = query.trim()

    // Extraire le nom d'entreprise et la ville du query
    // Heuristique: les derniers mots pourraient etre la ville
    const words = trimmedQuery.split(/\s+/)
    const searchName = trimmedQuery // On envoie tout a Zefix

    // --- 1. Recherche Zefix ---
    let zefixResults: ZefixCompany[] = []
    try {
      const zefixRes = await fetch('https://www.zefix.admin.ch/ZefixREST/api/v1/company/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: searchName,
          activeOnly: true,
          maxEntries: 5,
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (zefixRes.ok) {
        const data = await zefixRes.json()
        zefixResults = Array.isArray(data) ? data : (data?.list || data?.companies || [])
      } else {
        console.warn(`[search-ia] Zefix HTTP ${zefixRes.status}`)
      }
    } catch (err) {
      console.warn('[search-ia] Zefix indisponible:', (err as Error).message)
    }

    // --- 2. Enrichir avec Claude ---
    const anthropic = new Anthropic()

    const results: SearchResult[] = []

    if (zefixResults.length > 0) {
      // Enrichir chaque resultat Zefix avec Claude
      const enrichmentPromises = zefixResults.slice(0, 5).map(async (company) => {
        const companyName = company.name
        const city = company.address?.city || company.legalSeat || ''
        const cantonAbbr = company.canton?.abbreviation || ''
        const street = company.address
          ? [company.address.street, company.address.houseNumber].filter(Boolean).join(' ')
          : ''
        const npa = company.address?.swissZipCode || ''

        // Formater UID
        const uid = company.uid || ''

        let enriched: Partial<SearchResult> = {}
        try {
          const enrichment = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: `Recherche les informations de contact de l'entreprise "${companyName}" situee a ${city}${cantonAbbr ? `, canton ${cantonAbbr}` : ''}, en Suisse.
Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) avec ces champs (laisse "" si inconnu) :
{
  "telephone": "",
  "email": "",
  "site_web": "",
  "secteur": "",
  "adresse": "${street || ''}",
  "npa": "${npa || ''}",
  "ville": "${city || ''}",
  "canton": "${cantonAbbr || ''}"
}
Regles :
- telephone : numero suisse avec indicatif regional (ex: "021 653 14 31" ou "+41 21 653 14 31")
- email : email general de contact de l'entreprise
- site_web : URL du site sans https:// (ex: "www.exemple.ch")
- secteur : activite principale en 2-5 mots (ex: "Installations sanitaires, chauffage")
- Remplis adresse/npa/ville/canton seulement s'ils sont vides ci-dessus
- N'invente RIEN — ne retourne que des informations que tu connais avec certitude`
            }],
          })

          const text = enrichment.content[0]?.type === 'text' ? enrichment.content[0].text : '{}'
          // Parse JSON robuste
          let cleaned = text.replace(/```json|```JSON|```/g, '').trim()
          const firstBrace = cleaned.indexOf('{')
          const lastBrace = cleaned.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1)
          }
          enriched = JSON.parse(cleaned)
        } catch (err) {
          console.warn(`[search-ia] Enrichissement echoue pour ${companyName}:`, (err as Error).message)
        }

        return {
          nom_entreprise: companyName,
          adresse: enriched.adresse || street || '',
          npa: enriched.npa || npa || '',
          ville: enriched.ville || city || '',
          canton: enriched.canton || cantonAbbr || '',
          telephone: enriched.telephone || '',
          email: enriched.email || '',
          site_web: enriched.site_web || '',
          secteur: enriched.secteur || '',
          source: 'zefix+ia',
          uid,
        } as SearchResult
      })

      const enrichedResults = await Promise.all(enrichmentPromises)
      results.push(...enrichedResults)
    } else {
      // Pas de resultat Zefix — recherche 100% Claude
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `L'utilisateur recherche l'entreprise : "${trimmedQuery}" en Suisse.
Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) — un tableau de 1 a 3 entreprises correspondantes :
[
  {
    "nom_entreprise": "",
    "adresse": "",
    "npa": "",
    "ville": "",
    "canton": "",
    "telephone": "",
    "email": "",
    "site_web": "",
    "secteur": ""
  }
]
Regles :
- Recherche l'entreprise la plus probable correspondant a la requete
- telephone : numero suisse (ex: "021 653 14 31")
- site_web : sans https:// (ex: "www.exemple.ch")
- secteur : activite principale en quelques mots
- N'invente RIEN — ne retourne que des informations que tu connais avec certitude
- Si tu ne connais pas l'entreprise, retourne un tableau vide []`
          }],
        })

        const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]'
        let cleaned = text.replace(/```json|```JSON|```/g, '').trim()
        const firstBracket = cleaned.indexOf('[')
        const lastBracket = cleaned.lastIndexOf(']')
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          cleaned = cleaned.substring(firstBracket, lastBracket + 1)
        }

        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            results.push({
              nom_entreprise: item.nom_entreprise || trimmedQuery,
              adresse: item.adresse || '',
              npa: item.npa || '',
              ville: item.ville || '',
              canton: item.canton || '',
              telephone: item.telephone || '',
              email: item.email || '',
              site_web: item.site_web || '',
              secteur: item.secteur || '',
              source: 'ia',
              uid: '',
            })
          }
        }
      } catch (err) {
        console.warn('[search-ia] Claude fallback echoue:', (err as Error).message)
      }
    }

    // --- 3. Verifier les doublons en DB ---
    if (results.length > 0) {
      const supabase = createAdminClient() as any
      const names = results.map(r => r.nom_entreprise)

      // Chercher par nom similaire
      for (let i = 0; i < results.length; i++) {
        const name = results[i].nom_entreprise
        const { data: existing } = await supabase
          .from('clients')
          .select('id, nom_entreprise')
          .ilike('nom_entreprise', `%${name.replace(/[%_]/g, '')}%`)
          .limit(1)

        if (existing && existing.length > 0) {
          results[i].already_exists = true
        }
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
