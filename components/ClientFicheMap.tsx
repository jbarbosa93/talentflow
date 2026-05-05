'use client'
// v2.1.15 — Map Leaflet pour fiche client (1 marker centré sur lat/lng du client)
//
// Léger : pas de clustering (1 seul point). Lazy-loaded via dynamic({ssr:false}) côté parent.

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface ClientFicheMapProps {
  latitude: number
  longitude: number
  nom: string
  adresse?: string | null
  ville?: string | null
  npa?: string | null
  height?: number
}

export default function ClientFicheMap({ latitude, longitude, nom, adresse, ville, npa, height = 320 }: ClientFicheMapProps) {
  const center: [number, number] = [latitude, longitude]
  const adresseFull = [adresse, npa ? `${npa} ${ville || ''}`.trim() : ville].filter(Boolean).join(', ')

  return (
    <div style={{
      width: '100%',
      height,
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      position: 'relative',
    }}>
      <MapContainer
        center={center}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center}>
          <Popup>
            <div style={{ fontFamily: 'system-ui, sans-serif', minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{nom}</div>
              {adresseFull && <div style={{ fontSize: 11, color: '#64748B' }}>📍 {adresseFull}</div>}
              <div style={{ marginTop: 8 }}>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}
                >
                  🧭 Itinéraire Google Maps →
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
