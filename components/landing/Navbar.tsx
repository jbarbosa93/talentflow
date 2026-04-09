'use client'
import { useState, useEffect } from 'react'
import Link from "next/link"

export default function Navbar() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Déjà installé ?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      window.location.href = '/demande-acces'
      return
    }
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  return (
    <nav className="l-nav">
      <Link href="/" className="l-logo" style={{ textDecoration: 'none' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          background: '#F5A623', border: '2px solid #1C1A14',
          boxShadow: '2px 2px 0 #1C1A14', flexShrink: 0,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/>
          </svg>
        </span>
        TalentFlow
      </Link>

<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link href="/login" className="l-nav-btn-ghost">
          Espace Recruteurs
        </Link>
        {installed ? (
          <Link href="/login" className="l-nav-btn">
            Ouvrir l&apos;app →
          </Link>
        ) : (
          <button onClick={handleInstall} className="l-nav-btn">
            {deferredPrompt ? 'Installer l\'app →' : 'Demander une démo →'}
          </button>
        )}
      </div>
    </nav>
  )
}
