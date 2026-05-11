// TalentFlow Rapports — Header accueil candidat mobile-first
// v2.4.0 — Phase 1
//
// Affiche :
//   - Logo L-Agence top gauche
//   - Salutation dynamique (heure / jour spécial / Pâques)
//   - Météo Open-Meteo (gratuite, sans clé) — silent si géoloc refusée
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { getWelcomeGreeting, weatherLabel } from '@/lib/report/welcome'

interface Props {
  prenom: string
}

interface Weather { temp: number; emoji: string; text: string }

export default function CandidatWelcomeHeader({ prenom }: Props) {
  const [greeting, setGreeting] = useState(() => getWelcomeGreeting(prenom))
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    setGreeting(getWelcomeGreeting(prenom))
  }, [prenom])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude.toFixed(3)}&longitude=${pos.coords.longitude.toFixed(3)}&current=temperature_2m,weathercode&timezone=auto`
          const r = await fetch(url, { cache: 'no-store' })
          if (!r.ok) return
          const j = await r.json()
          const temp = Math.round(j?.current?.temperature_2m)
          const code = j?.current?.weathercode
          const lbl = weatherLabel(code)
          if (!Number.isFinite(temp) || !lbl) return
          setWeather({ temp, emoji: lbl.emoji, text: lbl.text })
        } catch { /* silent */ }
      },
      () => { /* refus silencieux */ },
      { timeout: 5000, maximumAge: 30 * 60 * 1000 },
    )
  }, [])

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '18px 16px 14px',
      background: 'transparent',
    }}>
      <div style={{ flexShrink: 0 }}>
        <Image
          src="/logo-agence.png"
          alt="L-Agence"
          width={108}
          height={36}
          priority
          style={{ height: 36, width: 'auto', objectFit: 'contain' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 22,
          fontWeight: 400,
          color: '#1C1A14',
          margin: 0,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
        }}>
          {greeting.text} <span aria-hidden>{greeting.emoji}</span>
        </h1>
        {weather && (
          <div style={{
            marginTop: 4,
            fontSize: 13,
            color: '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{weather.temp}°C</span>
            <span aria-hidden>·</span>
            <span>{weather.text}</span>
            <span aria-hidden>{weather.emoji}</span>
          </div>
        )}
      </div>
    </header>
  )
}
