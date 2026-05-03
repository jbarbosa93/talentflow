'use client'
/**
 * WelcomeV2Modal — v2.0.0
 *
 * Modal d'accueil affichée UNE SEULE FOIS par utilisateur (localStorage).
 * Confettis canvas-confetti + résumé changelog v2.0.
 */

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, ArrowRight } from 'lucide-react'

const STORAGE_KEY = 'seen_v2_welcome'

const HIGHLIGHTS = [
  { emoji: '🎨', text: 'Nouveau design complet (tokens, polices, couleurs)' },
  { emoji: '🗺️', text: 'Vue carte clients (Leaflet — 1219 géocodés)' },
  { emoji: '📍', text: 'Géolocalisation candidats par rayon (5556 géocodés)' },
  { emoji: '✉️', text: 'Prospection email IA en lot' },
  { emoji: '🏢', text: 'Zefix RC suisse (1145 entreprises vérifiées)' },
  { emoji: '🖼️', text: 'Logos entreprises automatiques' },
  { emoji: '🏷️', text: 'Secteurs d’activité clients (23 secteurs, 1174 enrichis)' },
  { emoji: '🔍', text: 'Recherche avancée par rayon géographique' },
  { emoji: '📊', text: 'Normalisation localisations CP Ville, Pays' },
  { emoji: '⚡', text: 'Et toutes les améliorations v1.9.107 → v1.9.126' },
]

export default function WelcomeV2Modal() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    try {
      const seen = localStorage.getItem(STORAGE_KEY)
      if (!seen) {
        // Petit délai pour laisser la page se rendre avant l'ouverture
        const t = setTimeout(() => setOpen(true), 600)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  const fireConfetti = useCallback(async () => {
    if (typeof window === 'undefined') return
    const confetti = (await import('canvas-confetti')).default
    const colors = ['#EAB308', '#F5A623', '#1C1A14', '#FFFDF5']
    const duration = 2500
    const end = Date.now() + duration
    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 70,
        startVelocity: 55,
        origin: { x: 0, y: 0.7 },
        colors,
        scalar: 0.95,
      })
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 70,
        startVelocity: 55,
        origin: { x: 1, y: 0.7 },
        colors,
        scalar: 0.95,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
    // Burst central initial
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.5 },
      colors,
      scalar: 1.1,
    })
  }, [])

  useEffect(() => {
    if (open) fireConfetti()
  }, [open, fireConfetti])

  const close = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setOpen(false)
  }, [])

  if (!mounted || !open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-v2-title"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(28, 26, 20, 0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'welcomeV2BgIn 0.3s ease-out',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: '#FFFDF5',
          border: '1px solid rgba(28, 26, 20, 0.10)',
          borderRadius: 20,
          boxShadow: '0 40px 100px -20px rgba(28, 26, 20, 0.30), 0 0 0 1px rgba(234, 179, 8, 0.10) inset',
          overflow: 'hidden',
          animation: 'welcomeV2In 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
          position: 'relative',
        }}
      >
        {/* Halo brand top-right */}
        <div aria-hidden style={{
          position: 'absolute', top: -120, right: -120,
          width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, #EAB308 0%, transparent 60%)',
          opacity: 0.18, pointerEvents: 'none',
        }} />

        {/* Bouton fermer */}
        <button
          onClick={close}
          aria-label="Fermer"
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(28,26,20,0.05)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#5C5645',
            transition: 'all 0.15s', zIndex: 2,
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(28,26,20,0.10)' }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(28,26,20,0.05)' }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        {/* Header */}
        <div style={{ padding: '36px 36px 20px', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.30)',
            borderRadius: 100, padding: '4px 11px', marginBottom: 16,
          }}>
            <Sparkles size={12} color="#B45309" />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', letterSpacing: '0.04em' }}>
              VERSION 2.0
            </span>
          </div>
          <h2
            id="welcome-v2-title"
            style={{
              fontSize: 36, fontWeight: 400, color: '#1C1A14',
              letterSpacing: '-0.02em', lineHeight: 1.1,
              margin: '0 0 10px',
              fontFamily: 'var(--font-instrument-serif, "Instrument Serif", Georgia, serif)',
            }}
          >
            TalentFlow <em style={{ fontStyle: 'italic', color: '#B45309' }}>2.0</em> est là 🎉
          </h2>
          <p style={{
            fontSize: 14, color: '#5C5645', lineHeight: 1.55, margin: 0, maxWidth: 460,
          }}>
            Une nouvelle interface, plus claire et plus rapide,
            avec une vague de fonctionnalités pensées pour ton quotidien
            de recruteur.
          </p>
        </div>

        {/* Liste des highlights */}
        <div style={{
          padding: '4px 36px 20px',
          display: 'flex', flexDirection: 'column', gap: 8,
          position: 'relative', zIndex: 1,
          maxHeight: '50vh', overflowY: 'auto',
        }}>
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.6)',
                border: '1px solid rgba(28, 26, 20, 0.06)',
                borderRadius: 10,
                animation: `welcomeV2ItemIn 0.4s ease-out ${0.1 + i * 0.04}s both`,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                {h.emoji}
              </span>
              <span style={{ fontSize: 13.5, color: '#1C1A14', lineHeight: 1.45 }}>
                {h.text}
              </span>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div style={{
          padding: '16px 36px 28px',
          display: 'flex', justifyContent: 'flex-end',
          position: 'relative', zIndex: 1,
        }}>
          <button
            onClick={close}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#EAB308', color: '#1C1A14',
              border: '1px solid #EAB308', borderRadius: 10,
              padding: '0 22px', height: 44,
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 24px -8px rgba(234,179,8,0.55)',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#F5A623'
              e.currentTarget.style.borderColor = '#F5A623'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#EAB308'
              e.currentTarget.style.borderColor = '#EAB308'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Découvrir <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes welcomeV2BgIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes welcomeV2In {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes welcomeV2ItemIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}
