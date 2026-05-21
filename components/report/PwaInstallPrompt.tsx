'use client'

// TalentFlow Rapport — Bandeau d'installation PWA
// v2.9.35
//
// - Android / Chrome : capture `beforeinstallprompt` → bouton « Installer »
//   (installation native en 1 tap).
// - iPhone / Safari : pas d'install auto possible (limite Apple) → bouton qui
//   ouvre un mini-tutoriel illustré (Partager → Sur l'écran d'accueil).
// - Ne s'affiche jamais si l'app est déjà installée (mode standalone).
// - Refermable : masqué 14 jours après un rejet.
// - Visible uniquement sur la page rapport candidat /report/{slug}.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { X, Share, Plus, Download, Smartphone } from 'lucide-react'

const DISMISS_KEY = 'tf_report_pwa_dismissed'
const DISMISS_DAYS = 14

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    if (!v) return false
    const ts = Number(v)
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_DAYS * 86_400_000
  } catch { return false }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iphone = /iphone|ipad|ipod/i.test(ua)
  // iPad iOS 13+ se présente comme un Mac → détection par le tactile
  const ipadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iphone || ipadOS
}

export default function PwaInstallPrompt() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    setMounted(true)
    if (isStandalone() || isDismissed()) return
    setIsIOS(detectIOS())
    setHidden(false)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Uniquement sur la page rapport candidat /report/{slug}
  const onReportPage = !!pathname
    && /^\/report\/[^/]+\/?$/.test(pathname)
    && !/^\/report\/(login|set-password|account|client)\b/.test(pathname)

  if (!mounted || hidden || !onReportPage) return null
  // Android sans événement installable ET pas iOS → rien à proposer
  if (!isIOS && !deferred) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* silencieux */ }
    setHidden(true)
  }

  async function handleInstall() {
    if (deferred) {
      try {
        await deferred.prompt()
        await deferred.userChoice
      } catch { /* silencieux */ }
      setDeferred(null)
      setHidden(true)
      return
    }
    if (isIOS) setShowGuide(true)
  }

  return createPortal(
    <>
      {/* Bandeau bas */}
      <div style={bannerWrap}>
        <div style={bannerCard}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#1C1A14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Smartphone size={19} color="#EAB308" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1C1A14', lineHeight: 1.25 }}>
              Installe l&apos;application
            </div>
            <div style={{ fontSize: 11.5, color: '#6B7280', lineHeight: 1.3, marginTop: 1 }}>
              Accès direct depuis ton écran d&apos;accueil
            </div>
          </div>
          <button onClick={handleInstall} style={installBtn}>
            <Download size={14} /> Installer
          </button>
          <button onClick={dismiss} aria-label="Fermer" style={closeBtn}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Tutoriel iPhone */}
      {showGuide && (
        <div onClick={() => setShowGuide(false)} style={guideOverlay}>
          <div onClick={e => e.stopPropagation()} style={guideCard}>
            <button onClick={() => setShowGuide(false)} aria-label="Fermer" style={{ ...closeBtn, position: 'absolute', top: 12, right: 12 }}>
              <X size={16} />
            </button>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1C1A14', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 14px' }}>
              <Smartphone size={24} color="#EAB308" />
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#1C1A14', textAlign: 'center' }}>
              Installer sur iPhone
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#6B7280', textAlign: 'center', lineHeight: 1.4 }}>
              3 étapes simples dans Safari
            </p>
            <GuideStep n={1}>
              Appuie sur le bouton <strong>Partager</strong>
              <span style={inlineIcon}><Share size={14} color="#1C1A14" /></span>
              en bas de l&apos;écran
            </GuideStep>
            <GuideStep n={2}>
              Fais défiler et choisis <strong>« Sur l&apos;écran d&apos;accueil »</strong>
              <span style={inlineIcon}><Plus size={14} color="#1C1A14" /></span>
            </GuideStep>
            <GuideStep n={3}>
              Appuie sur <strong>« Ajouter »</strong> en haut à droite
            </GuideStep>
            <button onClick={() => setShowGuide(false)} style={{ ...installBtn, width: '100%', justifyContent: 'center', marginTop: 16, height: 42 }}>
              J&apos;ai compris
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: '#EAB308', color: '#1C1A14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12.5, fontWeight: 800,
      }}>{n}</div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, paddingTop: 2 }}>
        {children}
      </div>
    </div>
  )
}

const bannerWrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9000,
  padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
  pointerEvents: 'none',
}

const bannerCard: React.CSSProperties = {
  pointerEvents: 'auto',
  maxWidth: 520, margin: '0 auto',
  display: 'flex', alignItems: 'center', gap: 11,
  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
  padding: '10px 12px',
  boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
}

const installBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
  height: 36, padding: '0 14px', borderRadius: 9,
  background: '#EAB308', color: '#1C1A14',
  border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
  fontFamily: 'inherit',
}

const closeBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#F3F4F6', border: '1px solid #E5E7EB',
  color: '#6B7280', cursor: 'pointer',
}

const guideOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9700,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const guideCard: React.CSSProperties = {
  position: 'relative',
  width: 'min(380px, 100%)',
  background: '#fff', borderRadius: 18, padding: '24px 22px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
}

const inlineIcon: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: 6, background: '#F3F4F6',
  border: '1px solid #E5E7EB', margin: '0 4px', verticalAlign: 'middle',
}
