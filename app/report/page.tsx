'use client'

// TalentFlow Rapport — Page d'entrée /report (point de lancement de la PWA)
// v2.9.35
//
// L'app installée (Android) s'ouvre sur /report. Cette page :
//  - redirige vers le dernier rapport ouvert si on en connaît un (localStorage),
//  - sinon affiche un message invitant à ouvrir le lien reçu.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { REPORT_LAST_SLUG_KEY } from '@/components/report/ServiceWorkerRegister'

export default function ReportEntryPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'no-link'>('loading')

  useEffect(() => {
    let slug: string | null = null
    try { slug = localStorage.getItem(REPORT_LAST_SLUG_KEY) } catch { /* silencieux */ }
    if (slug) {
      router.replace(`/report/${slug}`)
    } else {
      setPhase('no-link')
    }
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#FAFAF7',
    }}>
      <div style={{
        width: 'min(420px, 100%)', background: '#fff',
        border: '1px solid #E5E7EB', borderRadius: 18,
        padding: '32px 26px', textAlign: 'center',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt="TalentFlow Rapport"
          width={56}
          height={56}
          style={{ borderRadius: 13, margin: '0 auto 16px', display: 'block' }}
        />
        {phase === 'loading' ? (
          <>
            <div style={{
              width: 26, height: 26, margin: '0 auto 14px',
              border: '3px solid #E5E7EB', borderTopColor: '#EAB308',
              borderRadius: '50%', animation: 'tfspin 0.7s linear infinite',
            }} />
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
              Ouverture de ton rapport…
            </p>
            <style>{'@keyframes tfspin{to{transform:rotate(360deg)}}'}</style>
          </>
        ) : (
          <>
            <h1 style={{
              margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#1C1A14',
            }}>
              Bienvenue sur TalentFlow Rapport
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: '#6B7280', lineHeight: 1.55 }}>
              Pour accéder à ton rapport hebdomadaire, ouvre le lien personnel
              que ton agence t&apos;a envoyé par email ou WhatsApp.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
