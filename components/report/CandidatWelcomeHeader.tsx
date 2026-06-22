// TalentFlow Rapports — Header accueil candidat mobile-first
// v2.4.0 — Phase 1
//
// Affiche :
//   - Logo L-Agence top gauche
//   - Salutation dynamique (heure / jour spécial / Pâques)
//   - Météo Open-Meteo (gratuite, sans clé) — silent si géoloc refusée
//   - Slot `actions` (boutons Mon compte / Déconnexion v2.9.0)
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import LogoLAgence from './LogoLAgence'
import { getWelcomeGreeting, weatherLabel } from '@/lib/report/welcome'

interface Props {
  prenom: string
  /** v2.9.6 — Slot pour les boutons d'action (account / logout). Rendus dans
   *  le flow flex à droite du header → plus de position:fixed qui chevauche. */
  actions?: ReactNode
}

interface Weather { temp: number; emoji: string; text: string }

export default function CandidatWelcomeHeader({ prenom, actions }: Props) {
  const [greeting, setGreeting] = useState(() => getWelcomeGreeting(prenom))
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    setGreeting(getWelcomeGreeting(prenom))
  }, [prenom])

  // v2.13.9 — Météo : on ne demande la position qu'UNE SEULE FOIS (WKWebView ne
  // mémorise pas l'autorisation → sans cache, le prompt revient à chaque ouverture).
  // On cache les coords (réutilisées pour rafraîchir la météo sans re-prompt) + la
  // météo (< 1 h → affichage instantané).
  useEffect(() => {
    const COORDS_KEY = 'tf_weather_coords'
    const WEATHER_KEY = 'tf_weather_cache'
    const fetchWeather = async (lat: number, lng: number) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,weathercode&timezone=auto`
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        const temp = Math.round(j?.current?.temperature_2m)
        const lbl = weatherLabel(j?.current?.weathercode)
        if (!Number.isFinite(temp) || !lbl) return
        const w = { temp, emoji: lbl.emoji, text: lbl.text }
        setWeather(w)
        try { localStorage.setItem(WEATHER_KEY, JSON.stringify({ ...w, ts: Date.now() })) } catch { /* quota */ }
      } catch { /* silent */ }
    }
    // 1) météo en cache (< 1 h) → affichage direct, ni géoloc ni fetch
    try {
      const cw = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null')
      if (cw && Date.now() - cw.ts < 3600_000) { setWeather({ temp: cw.temp, emoji: cw.emoji, text: cw.text }); return }
    } catch { /* ignore */ }
    // 2) coords en cache → rafraîchit la météo SANS redemander la position
    try {
      const cc = JSON.parse(localStorage.getItem(COORDS_KEY) || 'null')
      if (cc && Number.isFinite(cc.lat) && Number.isFinite(cc.lng)) { fetchWeather(cc.lat, cc.lng); return }
    } catch { /* ignore */ }
    // 3) 1re fois SEULEMENT → demande la position une fois et cache les coords
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        try { localStorage.setItem(COORDS_KEY, JSON.stringify({ lat, lng })) } catch { /* quota */ }
        fetchWeather(lat, lng)
      },
      () => { /* refus silencieux */ },
      { timeout: 5000, maximumAge: 30 * 60 * 1000 },
    )
  }, [])

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 12px',
        background: 'transparent',
        boxSizing: 'border-box',
        maxWidth: '100%',
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <LogoLAgence height={32} color="dark" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 20,
          fontWeight: 400,
          color: '#1C1A14',
          margin: 0,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {greeting.text} <span aria-hidden>{greeting.emoji}</span>
        </h1>
        {weather && (
          <div style={{
            marginTop: 2,
            fontSize: 12,
            color: '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            <span>{weather.temp}°C</span>
            <span aria-hidden>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{weather.text}</span>
            <span aria-hidden>{weather.emoji}</span>
          </div>
        )}
      </div>
      {actions && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {actions}
        </div>
      )}
    </header>
  )
}
