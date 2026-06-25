'use client'

// TalentFlow — Page de téléchargement de l'app (lien intelligent).
// v2.13.28 — Un seul lien `talent-flow.ch/telecharger` partagé aux candidats :
// détecte iOS / Android et met en avant le bon store (les deux restent visibles).
// Publique (hors liste protégée du middleware).

import { useEffect, useState } from 'react'

const IOS_URL = 'https://apps.apple.com/app/id6777955726'
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=ch.talentflow.sign'
const LOGO = 'https://www.talent-flow.ch/logo-agence-officiel-noir.png'

export default function TelechargerPage() {
  const [device, setDevice] = useState<'ios' | 'android' | 'other'>('other')

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (/iPhone|iPad|iPod/i.test(ua)) setDevice('ios')
    else if (/Android/i.test(ua)) setDevice('android')
    else setDevice('other')
  }, [])

  const StoreButton = ({ href, label, sub, primary }: { href: string; label: string; sub: string; primary: boolean }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      width: '100%', padding: '15px 18px', borderRadius: 14, textDecoration: 'none',
      background: primary ? '#1C1A14' : '#fff',
      color: primary ? '#EAB308' : '#1C1A14',
      border: primary ? 'none' : '1.5px solid #E5E7EB',
      fontSize: 15.5, fontWeight: 800, boxShadow: primary ? '0 8px 24px rgba(0,0,0,0.12)' : 'none',
    }}>
      <span style={{ fontSize: 20 }}>{label.includes('App Store') ? '' : '▶'}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{sub}</span>
        <span>{label}</span>
      </span>
    </a>
  )

  const ios = <StoreButton href={IOS_URL} label="App Store" sub="iPhone / iPad" primary={device !== 'android'} />
  const android = <StoreButton href={ANDROID_URL} label="Google Play" sub="Android" primary={device === 'android'} />

  return (
    <div style={{ minHeight: '100dvh', background: '#FAFAF7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="L-Agence" style={{ height: 46, width: 'auto', margin: '0 auto 26px', display: 'block' }} />
        <div style={{ fontSize: 52, marginBottom: 10 }}>⚡</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1C1A14', margin: '0 0 8px' }}>TalentFlow Sign</h1>
        <p style={{ fontSize: 14.5, color: '#6B6457', lineHeight: 1.55, margin: '0 0 26px' }}>
          Télécharge l&apos;application pour gérer tes rapports d&apos;heures, tes documents et recevoir tes notifications.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Le store correspondant au téléphone est mis en avant en premier */}
          {device === 'android' ? <>{android}{ios}</> : <>{ios}{android}</>}
        </div>
        <p style={{ fontSize: 12.5, color: '#9A958A', marginTop: 22, lineHeight: 1.5 }}>
          Une fois installée, connecte-toi avec ton e-mail et ton mot de passe.
        </p>
      </div>
    </div>
  )
}
