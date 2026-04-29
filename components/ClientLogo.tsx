'use client'
// v1.9.115 — Logo entreprise automatique
// Source : logo.dev (si NEXT_PUBLIC_LOGO_DEV_TOKEN défini, vrais logos haute qualité)
// → Google Favicons (fallback gratuit sans clé) → initiales colorées (dernier recours).
// Pas de stockage DB, pas d'upload, tout côté client. <img> natif (pas Next/Image,
// évite la whitelist next.config pour des domaines externes au volume modéré).
//
// Note : Clearbit Logo API a été sunset par HubSpot en 2024 (DNS dead). logo.dev est
// l'alternative officielle (free tier 1000 logos/mois, signup 2 min sur logo.dev).

import { useState, useEffect, useMemo, useRef } from 'react'
import { Building2 } from 'lucide-react'

interface ClientLogoProps {
  nom_entreprise: string
  site_web?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: { box: 32, font: 12, radius: 6, icon: 16 },
  md: { box: 48, font: 16, radius: 8, icon: 22 },
  lg: { box: 64, font: 20, radius: 10, icon: 28 },
} as const

// Palette stable (hash → index) pour fallback initiales
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#FEE4CB', fg: '#9A3412' }, // orange
  { bg: '#DBEAFE', fg: '#1E40AF' }, // bleu
  { bg: '#DCFCE7', fg: '#166534' }, // vert
  { bg: '#FEF3C7', fg: '#854D0E' }, // jaune
  { bg: '#F3E8FF', fg: '#6B21A8' }, // violet
  { bg: '#CFFAFE', fg: '#155E75' }, // cyan
  { bg: '#FCE7F3', fg: '#9D174D' }, // rose
  { bg: '#FFE4E6', fg: '#9F1239' }, // rouge
  { bg: '#E0E7FF', fg: '#3730A3' }, // indigo
  { bg: '#FEF9C3', fg: '#713F12' }, // amber dark
  { bg: '#F1F5F9', fg: '#334155' }, // slate
  { bg: '#FFEDD5', fg: '#7C2D12' }, // brun
]

function extractDomain(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  let s = url.trim()
  if (!s) return null
  // Strip protocol + path + query
  s = s.replace(/^https?:\/\//i, '')
  s = s.replace(/^\/\//, '')
  s = s.split('/')[0].split('?')[0].split('#')[0]
  // Strip leading www.
  s = s.replace(/^www\./i, '').toLowerCase().trim()
  // Validation simple : doit contenir un point + caractère alphanum
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return null
  return s
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function getInitials(name: string): string {
  const cleaned = (name || '').trim()
  if (!cleaned) return '?'
  // Strip suffixes communes (SA, Sàrl, AG, GmbH, Ltd, SAS, EURL)
  const stripped = cleaned.replace(/\b(SA|S\.A\.|Sàrl|S\.à\.r\.l\.|AG|GmbH|Ltd|SAS|EURL|SARL)\b/gi, '').trim()
  const base = stripped || cleaned
  const words = base.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    const w = words[0]
    return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

type Stage = 'logo-dev' | 'favicon' | 'initials'

const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN || ''

function pickInitialStage(domain: string | null): Stage {
  if (!domain) return 'initials'
  return LOGO_DEV_TOKEN ? 'logo-dev' : 'favicon'
}

export default function ClientLogo({ nom_entreprise, site_web, size = 'sm', className }: ClientLogoProps) {
  const dim = SIZES[size]
  const domain = useMemo(() => extractDomain(site_web), [site_web])
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [stage, setStage] = useState<Stage>(() => pickInitialStage(domain))
  const [loaded, setLoaded] = useState(false)

  // Reset si la prop site_web change
  useEffect(() => {
    setStage(pickInitialStage(domain))
    setLoaded(false)
  }, [domain])

  // v1.9.116 — Fix bug "logos disparaissent au retour fiche/back-button" :
  // si l'image est déjà en cache HTTP, le browser la sert sync au mount → l'event onLoad
  // peut ne jamais fire (déjà complete avant que React attache le handler). On vérifie
  // imgRef.current.complete + naturalWidth après chaque render et on force loaded=true.
  useEffect(() => {
    if (loaded) return
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true)
    }
  })

  const palette = useMemo(() => {
    const idx = hashCode((nom_entreprise || '').toLowerCase()) % PALETTE.length
    return PALETTE[idx]
  }, [nom_entreprise])

  const initials = useMemo(() => getInitials(nom_entreprise), [nom_entreprise])

  const src = stage === 'logo-dev' && domain
    ? `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=128&format=png`
    : stage === 'favicon' && domain
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
      : null

  const handleError = () => {
    if (stage === 'logo-dev') {
      setStage('favicon')
      setLoaded(false)
    } else {
      setStage('initials')
    }
  }

  const baseStyle: React.CSSProperties = {
    position: 'relative',
    width: dim.box,
    height: dim.box,
    borderRadius: dim.radius,
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    background: 'var(--card)',
  }

  // v1.9.116 — Initiales colorées TOUJOURS visibles en background, l'image se superpose
  // dessus quand elle charge. Garantit qu'on n'a JAMAIS d'écran vide même si l'image
  // est lente/bloquée par un adblock/timeout réseau, sans dépendre de onError.
  return (
    <div
      className={className}
      style={{
        ...baseStyle,
        background: palette.bg,
        color: palette.fg,
        fontSize: dim.font,
        fontWeight: 800,
        letterSpacing: 0.3,
        border: `1px solid ${palette.fg}1A`,
      }}
      aria-label={`Logo ${nom_entreprise}`}
      title={nom_entreprise}
    >
      {/* Initiales/icône en couche de fond toujours présentes */}
      <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {initials === '?' ? <Building2 size={dim.icon} /> : initials}
      </span>
      {/* Image (logo.dev / favicon) par-dessus, opacity:1 quand chargée */}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={`Logo ${nom_entreprise}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            background: '#FFFFFF',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.18s ease',
          }}
        />
      )}
    </div>
  )
}
