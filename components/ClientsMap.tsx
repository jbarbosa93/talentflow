'use client'
// v1.9.118 — Carte interactive des clients (Leaflet + MarkerCluster + OSM)
//
// 1 marker par client (pas regroupement par ville). MarkerCluster groupe automatiquement
// les markers proches au zoom-out pour éviter ~1200 points superposés.
//
// Popup HTML simple (Leaflet ne render pas du JSX) : logo + nom + IDE + secteurs + lien fiche.
// Lien <a href> natif → full page reload accepté (changement de fiche = changement de page).

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Client } from '@/hooks/useClients'

// Fix Leaflet default icon (Webpack/Turbopack ne résout pas les images par défaut)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface ClientsMapProps {
  clients: Client[]
  height?: string | number
  /** v1.9.119 — Mode split : id du client à mettre en focus (zoom + popup ouvert) */
  focusedClientId?: string | null
}

function escHtml(s: string | null | undefined): string {
  return (s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch))
}

function buildPopupHtml(c: Client): string {
  const secteurs = (c.secteurs_activite || []).slice(0, 3)
  const secteursPills = secteurs.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${secteurs.map(s =>
        `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#FEF3C7;color:#854D0E;border:1px solid #F7C948">${escHtml(s)}</span>`
      ).join('')}</div>`
    : ''
  const ville = c.ville ? `${c.npa ? c.npa + ' ' : ''}${escHtml(c.ville)}${c.canton ? ', ' + escHtml(c.canton) : ''}` : ''
  const uid = (c as any).zefix_uid as string | null | undefined
  const status = (c as any).zefix_status as string | null | undefined
  const statusBadge = status === 'EXISTIEREND'
    ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:700;margin-left:6px">Actif RC</span>`
    : status === 'AUFGELOEST'
      ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.1);color:#ea580c;font-weight:700;margin-left:6px">Liquidation</span>`
      : status === 'GELOESCHT'
        ? `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(220,38,38,0.1);color:#dc2626;font-weight:700;margin-left:6px">Radié</span>`
        : ''

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:240px;max-width:300px">
      <div style="font-size:14px;font-weight:800;color:#0F172A;line-height:1.3">${escHtml(c.nom_entreprise)}${statusBadge}</div>
      ${ville ? `<div style="font-size:11px;color:#64748B;margin-top:3px">📍 ${ville}</div>` : ''}
      ${uid ? `<div style="font-size:10px;color:#94A3B8;font-family:monospace;margin-top:2px">${escHtml(uid)}</div>` : ''}
      ${secteursPills}
      <a href="/clients/${c.id}" style="display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:6px 12px;border-radius:8px;background:#F7C948;color:#1C1A14;font-size:11px;font-weight:700;text-decoration:none;border:1px solid #E2A91A">
        Voir la fiche →
      </a>
    </div>
  `
}

/** Sub-component qui ajoute la couche markercluster à la map */
function ClusterLayer({ clients, focusedClientId }: { clients: Client[]; focusedClientId?: string | null }) {
  const map = useMap()
  const items = useMemo(() => clients.filter(c => c.latitude != null && c.longitude != null), [clients])
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const clusterRef = useRef<any>(null)

  useEffect(() => {
    if (items.length === 0) return

    // Cluster group avec config raisonnable pour 1000+ markers
    const cluster = (L as any).markerClusterGroup({
      chunkedLoading: true,        // évite blocage UI lors de l'ajout de masse
      maxClusterRadius: 50,        // pixels avant regroupement
      spiderfyOnMaxZoom: true,     // étalement en araignée au zoom max
      showCoverageOnHover: false,  // pas de polygon hover (trop visuel sur 1000 points)
      removeOutsideVisibleBounds: true,
    })

    markersRef.current = new Map()
    for (const c of items) {
      const marker = L.marker([c.latitude!, c.longitude!])
      marker.bindPopup(buildPopupHtml(c), { maxWidth: 320, minWidth: 240 })
      cluster.addLayer(marker)
      markersRef.current.set(c.id, marker)
    }
    clusterRef.current = cluster

    map.addLayer(cluster)

    // v1.9.119 — Auto-fit bounds sur PERCENTILE 5-95 (lat ET lng séparément).
    // Ignore les outliers géographiques (ex: 1 client en Suisse alémanique parmi 1200
    // clients romands → on ne veut pas que la carte dézoome jusqu'à Bern/Luzern).
    // Tous les markers restent rendus dans le cluster, juste le viewport initial est serré.
    if (items.length > 0) {
      let bounds: L.LatLngBounds
      if (items.length >= 20) {
        const lats = items.map(c => c.latitude!).sort((a, b) => a - b)
        const lngs = items.map(c => c.longitude!).sort((a, b) => a - b)
        const lo = Math.floor(items.length * 0.05)
        const hi = Math.ceil(items.length * 0.95) - 1
        bounds = L.latLngBounds(
          [lats[lo], lngs[lo]] as [number, number],
          [lats[hi], lngs[hi]] as [number, number],
        )
      } else {
        // Trop peu de points pour percentile (filtre serré) → bounds full
        bounds = L.latLngBounds(items.map(c => [c.latitude!, c.longitude!] as [number, number]))
      }
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 })
    }

    return () => {
      map.removeLayer(cluster)
      markersRef.current = new Map()
      clusterRef.current = null
    }
  }, [map, items])

  // v1.9.119 — Focus marker quand l'user clique une card en mode split.
  // zoomToShowLayer dézoome jusqu'à ce que le marker sorte de son cluster
  // puis ouvre le popup. Animation native Leaflet.
  // v1.9.121 — flag cancelled + try/catch pour éviter le crash Sentry
  // "_leaflet_pos undefined" quand le composant se démonte pendant l'animation
  // (Leaflet appelle le callback après que le marker ait été retiré du cluster).
  useEffect(() => {
    if (!focusedClientId) return
    const marker = markersRef.current.get(focusedClientId)
    const cluster = clusterRef.current
    if (!marker || !cluster) return
    let cancelled = false
    try {
      cluster.zoomToShowLayer(marker, () => {
        if (cancelled) return
        try { marker.openPopup() } catch { /* marker déjà détaché */ }
      })
    } catch { /* cluster déjà démonté */ }
    return () => { cancelled = true }
  }, [focusedClientId])

  return null
}

export default function ClientsMap({ clients, height = 600, focusedClientId }: ClientsMapProps) {
  const withCoords = clients.filter(c => c.latitude != null && c.longitude != null)

  if (withCoords.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height, background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 12,
        color: 'var(--muted)', fontSize: 13, padding: 20, textAlign: 'center',
      }}>
        Aucun client avec coordonnées GPS pour les filtres actifs.
        <br />
        <span style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
          Les coordonnées sont calculées automatiquement depuis le NPA + ville.
        </span>
      </div>
    )
  }

  // Centre par défaut : Suisse romande (Lausanne)
  // Le ClusterLayer fait fitBounds au mount → centre auto sur les filtres
  const defaultCenter: [number, number] = [46.5197, 6.6323]

  return (
    <div style={{
      height, width: '100%', borderRadius: 12, overflow: 'hidden',
      border: '2px solid var(--border)',
    }}>
      <MapContainer
        center={defaultCenter}
        zoom={8}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusterLayer clients={withCoords} focusedClientId={focusedClientId} />
      </MapContainer>
    </div>
  )
}
