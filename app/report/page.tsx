'use client'

// TalentFlow Rapport — Page d'entrée /report (point de lancement de la PWA)
// v2.9.36
//
// L'app installée s'ouvre sur /report. Cette page ne reste JAMAIS un cul-de-sac :
//  1. dernier rapport ouvert dans l'app (localStorage) → on l'ouvre ;
//  2. sinon, candidat déjà connecté → on ouvre son rapport ;
//  3. sinon → page de connexion /report/login.
// Après connexion, LoginForm renvoie sur /report → cette page reprend en (2).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { REPORT_LAST_SLUG_KEY } from '@/components/report/ServiceWorkerRegister'

export default function ReportEntryPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'no-report'>('loading')

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      // 1. Dernier rapport ouvert dans l'app
      let slug: string | null = null
      try { slug = localStorage.getItem(REPORT_LAST_SLUG_KEY) } catch { /* silencieux */ }
      if (slug) { router.replace(`/report/${slug}`); return }

      // 2. Candidat déjà connecté → son rapport
      // v2.13.2 — App iOS (WKWebView) : le cookie de session peut arriver avec un
      // léger décalage juste après le login → un 401 transitoire ne doit PAS
      // renvoyer au login. On retente brièvement (≤ ~1 s) avant d'abandonner.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch('/api/portal-auth/me?type=candidat&full=1', { credentials: 'include' })
          if (r.ok) {
            const d = await r.json().catch(() => null)
            const target = d?.account?.targetSlug as string | undefined
            if (cancelled) return
            if (target) { router.replace(`/report/${target}`); return }
            setPhase('no-report')  // connecté mais aucun rapport lié
            return
          }
        } catch { /* réseau KO → on retente */ }
        if (cancelled) return
        if (attempt < 2) await new Promise(res => setTimeout(res, 350))
      }

      // 3. Toujours pas de session après retries → connexion
      if (!cancelled) router.replace('/report/login')
    }

    resolve()
    return () => { cancelled = true }
  }, [router])

  return (
    <div style={{
      minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          src="/report-icon-192.png"
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
              Chargement…
            </p>
            <style>{'@keyframes tfspin{to{transform:rotate(360deg)}}'}</style>
          </>
        ) : (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: '#1C1A14' }}>
              Aucun rapport disponible
            </h1>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#6B7280', lineHeight: 1.55 }}>
              Ton compte n&apos;est lié à aucun rapport pour le moment.
              Contacte ton agence ou ouvre le lien personnel qu&apos;elle t&apos;a envoyé.
            </p>
            <button
              onClick={() => router.replace('/report/login')}
              style={{
                height: 42, padding: '0 20px', borderRadius: 10,
                background: '#1C1A14', color: '#EAB308',
                border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Se connecter
            </button>
          </>
        )}
      </div>
    </div>
  )
}
