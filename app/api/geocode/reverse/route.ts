// v2.9.89 — Reverse geocoding public (coordonnées GPS → adresse courte).
// Utilisé par la pointeuse (timbrage) sur la page publique /report : quand le
// candidat clique « Maintenant », on capte le GPS puis on résout l'adresse ici
// (côté serveur, pour imposer le User-Agent Nominatim — impossible en fetch navigateur).
// Public par design (page candidat sans session). Lecture seule, aucune écriture DB.
import { NextRequest, NextResponse } from 'next/server'
import { reverseGeocode } from '@/lib/geocode-localisation'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Coordonnées invalides' }, { status: 400 })
  }
  try {
    const address = await reverseGeocode(lat, lng)
    return NextResponse.json({ address }, {
      // Cache 1 jour (même point → même adresse) pour soulager Nominatim.
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return NextResponse.json({ address: null })
  }
}
