// app/(dashboard)/api/geo/route.ts
// Proxy geocodage Nominatim — résout le problème User-Agent interdit côté browser
// GET /api/geo?q=Lausanne → { lat, lon } | { error }

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q?.trim()) {
    return NextResponse.json({ error: 'Paramètre q requis' }, { status: 400 })
  }

  try {
    // Photon (komoot.io) — basé sur OSM, gratuit, pas de rate-limit strict, pas de User-Agent requis
    // GeoJSON response : coordinates = [longitude, latitude]
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=1&lang=fr`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // cache 24h côté Next.js (les villes ne bougent pas)
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Geocoding error' }, { status: res.status })
    }

    const data = await res.json()
    const feature = data?.features?.[0]
    if (feature?.geometry?.coordinates) {
      const [lon, lat] = feature.geometry.coordinates  // GeoJSON = [lon, lat]
      return NextResponse.json({ lat, lon })
    }

    return NextResponse.json({ error: 'Localisation introuvable' }, { status: 404 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur geocodage' },
      { status: 500 }
    )
  }
}
