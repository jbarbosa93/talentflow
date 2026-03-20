'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ─── Table de géocodage statique (villes CH + voisines) ──────────────────────
const GEO_CACHE: Record<string, [number, number]> = {
  // Suisse romande
  'genève': [46.2044, 6.1432], 'geneva': [46.2044, 6.1432],
  'lausanne': [46.5197, 6.6323],
  'monthey': [46.2538, 6.9392],
  'sion': [46.2330, 7.3599],
  'sierre': [46.2926, 7.5337],
  'martigny': [46.1017, 7.0726],
  'fribourg': [46.8065, 7.1618],
  'neuchâtel': [46.9920, 6.9310], 'neuchatel': [46.9920, 6.9310],
  'la chaux-de-fonds': [47.0999, 6.8254],
  'biel': [47.1368, 7.2467], 'bienne': [47.1368, 7.2467],
  'delémont': [47.3649, 7.3430], 'delemont': [47.3649, 7.3430],
  'porrentruy': [47.4175, 7.0741],
  'yverdon': [46.7785, 6.6408], 'yverdon-les-bains': [46.7785, 6.6408],
  'vevey': [46.4631, 6.8419],
  'montreux': [46.4312, 6.9107],
  'morges': [46.5099, 6.4964],
  'nyon': [46.3830, 6.2346],
  'renens': [46.5343, 6.5883],
  'aigle': [46.3181, 6.9683],
  // Suisse alémanique
  'zürich': [47.3769, 8.5417], 'zurich': [47.3769, 8.5417],
  'bern': [46.9481, 7.4474], 'berne': [46.9481, 7.4474],
  'basel': [47.5596, 7.5886], 'bâle': [47.5596, 7.5886], 'bale': [47.5596, 7.5886],
  'luzern': [47.0502, 8.3093], 'lucerne': [47.0502, 8.3093],
  'st. gallen': [47.4245, 9.3767], 'saint-gall': [47.4245, 9.3767],
  'winterthur': [47.5001, 8.7501],
  'thun': [46.7580, 7.6279],
  'köniz': [46.9327, 7.4105], 'koniz': [46.9327, 7.4105],
  'uster': [47.3486, 8.7189],
  'solothurn': [47.2088, 7.5338], 'soleure': [47.2088, 7.5338],
  'aarau': [47.3909, 8.0453],
  'olten': [47.3518, 7.9033],
  'schaffhausen': [47.6958, 8.6347],
  'frauenfeld': [47.5573, 8.8972],
  'rapperswil': [47.2268, 8.8182],
  'horgen': [47.2553, 8.5973],
  'reinach': [47.4968, 7.5921],
  'allschwil': [47.5522, 7.5423],
  'muttenz': [47.5247, 7.6467],
  'binningen': [47.5299, 7.5721],
  'oberwil': [47.5222, 7.5319],
  'riehen': [47.5802, 7.6511],
  'thalwil': [47.2918, 8.5771],
  'wädenswil': [47.2197, 8.6664], 'wadenswil': [47.2197, 8.6664],
  'meilen': [47.2727, 8.6434],
  'küsnacht': [47.3178, 8.5833], 'kusnacht': [47.3178, 8.5833],
  'männedorf': [47.2599, 8.6966], 'mannedorf': [47.2599, 8.6966],
  'wettingen': [47.4661, 8.3233],
  'brugg': [47.4826, 8.2047],
  'grenchen': [47.1912, 7.3958],
  'zug': [47.1661, 8.5163], 'zoug': [47.1661, 8.5163],
  // Tessin
  'lugano': [46.0037, 8.9511],
  'bellinzona': [46.1955, 9.0226],
  'locarno': [46.1703, 8.8019],
  // France proche
  'annecy': [45.8992, 6.1294],
  'lyon': [45.7640, 4.8357],
  'paris': [48.8566, 2.3522],
  'strasbourg': [48.5734, 7.7521],
  'mulhouse': [47.7508, 7.3359],
  'grenoble': [45.1885, 5.7245],
  'marseille': [43.2965, 5.3698],
  'bordeaux': [44.8378, -0.5792],
  'toulouse': [43.6047, 1.4442],
  'nice': [43.7102, 7.2620],
  // Allemagne
  'freiburg': [47.9990, 7.8421],
  'frankfurt': [50.1109, 8.6821],
  'münchen': [48.1351, 11.5820], 'munich': [48.1351, 11.5820],
  'berlin': [52.5200, 13.4050],
  'hamburg': [53.5753, 10.0153],
  'stuttgart': [48.7758, 9.1829],
  'konstanz': [47.6779, 9.1732],
  // Italie
  'milano': [45.4654, 9.1859], 'milan': [45.4654, 9.1859],
  'torino': [45.0703, 7.6869], 'turin': [45.0703, 7.6869],
  'roma': [41.9028, 12.4964], 'rome': [41.9028, 12.4964],
  // Portugal / Espagne
  'lisboa': [38.7169, -9.1395], 'lisbonne': [38.7169, -9.1395],
  'porto': [41.1579, -8.6291],
  'madrid': [40.4168, -3.7038],
  'barcelona': [41.3851, 2.1734], 'barcelone': [41.3851, 2.1734],
  // Belgique / Luxembourg
  'bruxelles': [50.8503, 4.3517], 'brussels': [50.8503, 4.3517],
  'luxembourg': [49.6116, 6.1319],
  'liège': [50.6326, 5.5797], 'liege': [50.6326, 5.5797],
}

const LS_GEO_KEY = 'talentflow_geocache_map'

function loadGeoLS(): Record<string, [number, number]> {
  try {
    const s = localStorage.getItem(LS_GEO_KEY)
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}
function saveGeoLS(cache: Record<string, [number, number]>) {
  try { localStorage.setItem(LS_GEO_KEY, JSON.stringify(cache)) } catch {}
}

async function geocode(ville: string, lsCache: Record<string, [number, number]>): Promise<[number, number] | null> {
  const key = ville.toLowerCase().trim()
  if (GEO_CACHE[key]) return GEO_CACHE[key]
  if (lsCache[key]) return lsCache[key]
  try {
    // Essai 1 : avec "Suisse"
    const r1 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville + ' Switzerland')}&format=json&limit=1`,
      { headers: { 'User-Agent': 'TalentFlow ATS' } }
    )
    const d1 = await r1.json()
    if (d1?.[0]) {
      const coords: [number, number] = [parseFloat(d1[0].lat), parseFloat(d1[0].lon)]
      lsCache[key] = coords
      saveGeoLS(lsCache)
      return coords
    }
    // Essai 2 : juste le nom
    const r2 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'TalentFlow ATS' } }
    )
    const d2 = await r2.json()
    if (d2?.[0]) {
      const coords: [number, number] = [parseFloat(d2[0].lat), parseFloat(d2[0].lon)]
      lsCache[key] = coords
      saveGeoLS(lsCache)
      return coords
    }
  } catch { /* ignore */ }
  return null
}

const ETAPE_COLORS: Record<string, string> = {
  nouveau:   '#94A3B8',
  contacte:  '#3B82F6',
  entretien: '#F59E0B',
  place:     '#10B981',
  refuse:    '#EF4444',
}
const ETAPE_LABELS: Record<string, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}

type Candidat = {
  id: string; nom: string; prenom: string | null
  titre_poste: string | null; statut_pipeline: string; localisation: string | null
}
type LocGroup = { ville: string; candidats: Candidat[]; coords: [number, number] | null }

function markerIcon(count: number) {
  const bg = count >= 5 ? '#EF4444' : count >= 3 ? '#F59E0B' : '#F5A623'
  return L.divIcon({
    html: `<div style="background:${bg};color:#000;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);font-family:system-ui,sans-serif">${count}</div>`,
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export default function CandidatsMap() {
  const supabase = createClient()
  const [groups, setGroups]       = useState<LocGroup[]>([])
  const [geocoding, setGeocoding] = useState(false)

  const { data: candidats = [], isLoading } = useQuery<Candidat[]>({
    queryKey: ['candidats-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('candidats')
        .select('id, nom, prenom, titre_poste, statut_pipeline, localisation')
        .order('created_at', { ascending: false })
        .limit(300)
      return (data || []) as Candidat[]
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!candidats.length) return
    const grouped: Record<string, Candidat[]> = {}
    for (const c of candidats) {
      const loc = c.localisation?.trim()
      if (!loc) continue
      const ville = loc.split(',')[0].trim()
      if (!grouped[ville]) grouped[ville] = []
      grouped[ville].push(c)
    }
    const villes = Object.entries(grouped)
    if (!villes.length) return

    const lsCache = loadGeoLS()

    // Pré-remplir avec les villes déjà cachées (statique ou localStorage)
    const preloaded: LocGroup[] = villes
      .map(([ville, cands]) => {
        const key = ville.toLowerCase().trim()
        const coords = GEO_CACHE[key] || lsCache[key] || null
        return { ville, candidats: cands, coords }
      })
    setGroups(preloaded)

    // Villes encore inconnues → fetch Nominatim
    const todo = villes.filter(([ville]) => {
      const key = ville.toLowerCase().trim()
      return !GEO_CACHE[key] && !lsCache[key]
    })
    if (!todo.length) return

    setGeocoding(true)
    ;(async () => {
      for (let i = 0; i < todo.length; i++) {
        const [ville, cands] = todo[i]
        const coords = await geocode(ville, lsCache)
        if (coords) {
          setGroups(prev => prev.map(g => g.ville === ville ? { ...g, coords } : g))
        }
        if (i < todo.length - 1) await new Promise(r => setTimeout(r, 1100))
      }
      setGeocoding(false)
    })()
  }, [candidats])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#94A3B8', fontSize: 13 }}>
        <div style={{ width: 26, height: 26, border: '3px solid #E2E8F0', borderTopColor: '#F5A623', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        {geocoding ? 'Localisation des candidats…' : 'Chargement…'}
      </div>
    )
  }

  const withCoords = groups.filter(g => g.coords)

  if (!withCoords.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: 13 }}>
        Aucun candidat avec localisation reconnue
      </div>
    )
  }

  // Centre de la carte = moyenne des coordonnées
  const center: [number, number] = [
    withCoords.reduce((s, g) => s + g.coords![0], 0) / withCoords.length,
    withCoords.reduce((s, g) => s + g.coords![1], 0) / withCoords.length,
  ]

  return (
    <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map(g => (
        <Marker key={g.ville} position={g.coords!} icon={markerIcon(g.candidats.length)}>
          <Popup maxWidth={300} minWidth={220}>
            <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2px 0' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                📍 {g.ville}
                <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B' }}>
                  {g.candidats.length} candidat{g.candidats.length > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                {g.candidats.map(c => {
                  const color = ETAPE_COLORS[c.statut_pipeline] || '#94A3B8'
                  const initiales = `${(c.prenom?.[0] || '').toUpperCase()}${(c.nom?.[0] || '').toUpperCase()}`
                  return (
                    <a
                      key={c.id}
                      href={`/candidats/${c.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px 5px 5px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 20, textDecoration: 'none', transition: 'background 0.12s' }}
                      onMouseOver={e => (e.currentTarget.style.background = '#F1F5F9')}
                      onMouseOut={e => (e.currentTarget.style.background = '#F8FAFC')}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {initiales}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.prenom} {c.nom}
                        </div>
                        {c.titre_poste && (
                          <div style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.titre_poste}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>
                        {ETAPE_LABELS[c.statut_pipeline] || c.statut_pipeline}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
