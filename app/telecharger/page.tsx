'use client'

// TalentFlow — Page de téléchargement de l'app (lien intelligent).
// v2.13.29 — Design soigné avec les badges OFFICIELS App Store / Google Play.
// Un seul lien `talent-flow.ch/telecharger` : détecte iOS / Android et met en avant
// le bon store (les deux restent visibles). Publique (hors liste protégée middleware).

import { useEffect, useState } from 'react'

const IOS_URL = 'https://apps.apple.com/app/id6777955726'
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=ch.talentflow.sign'
const LOGO = 'https://www.talent-flow.ch/logo-agence-officiel-noir.png'
// Badges officiels hébergés par Apple / Google (FR)
const BADGE_IOS = 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr?size=250x83'
const BADGE_ANDROID = 'https://play.google.com/intl/fr_fr/badges/static/images/badges/fr_badge_web_generic.png'

export default function TelechargerPage() {
  const [device, setDevice] = useState<'ios' | 'android' | 'other'>('other')

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (/iPhone|iPad|iPod/i.test(ua)) setDevice('ios')
    else if (/Android/i.test(ua)) setDevice('android')
    else setDevice('other')
  }, [])

  /* eslint-disable @next/next/no-img-element */
  const iosBadge = (
    <a key="ios" href={IOS_URL} target="_blank" rel="noopener noreferrer"
       style={{ display: 'block', lineHeight: 0 }}>
      <img src={BADGE_IOS} alt="Télécharger dans l'App Store" style={{ height: 56, width: 'auto' }} />
    </a>
  )
  const androidBadge = (
    <a key="android" href={ANDROID_URL} target="_blank" rel="noopener noreferrer"
       style={{ display: 'block', lineHeight: 0 }}>
      <img src={BADGE_ANDROID} alt="Disponible sur Google Play" style={{ height: 56, width: 'auto' }} />
    </a>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#FAFAF7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ width: 'min(400px, 100%)', textAlign: 'center' }}>
        <img src={LOGO} alt="L-Agence" style={{ height: 44, width: 'auto', margin: '0 auto 30px', display: 'block' }} />

        <div style={{
          width: 84, height: 84, margin: '0 auto 20px', borderRadius: 22,
          background: '#1C1A14', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        }}>
          <span style={{ fontSize: 44 }}>⚡</span>
        </div>

        <h1 style={{ fontSize: 25, fontWeight: 800, color: '#1C1A14', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          TalentFlow&nbsp;Sign
        </h1>
        <p style={{ fontSize: 14.5, color: '#6B6457', lineHeight: 1.55, margin: '0 0 30px' }}>
          Télécharge l&apos;application pour gérer tes rapports d&apos;heures,
          tes documents et recevoir tes notifications.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {device === 'android' ? [androidBadge, iosBadge] : [iosBadge, androidBadge]}
        </div>

        <p style={{ fontSize: 12.5, color: '#9A958A', marginTop: 28, lineHeight: 1.5 }}>
          Une fois installée, connecte-toi avec ton e-mail et ton mot de passe.
        </p>
      </div>
    </div>
  )
}
