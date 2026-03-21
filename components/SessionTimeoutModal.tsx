'use client'
import { useState, useCallback } from 'react'
import { Shield, LogOut, RefreshCw } from 'lucide-react'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'

export function SessionTimeoutModal() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [loggingOut, setLoggingOut]   = useState(false)

  const isWarning = secondsLeft !== null && secondsLeft > 0

  const handleWarning = useCallback((s: number) => {
    setSecondsLeft(s)
  }, [])

  const handleLogout = useCallback(() => {
    setLoggingOut(true)
  }, [])

  const handleActivity = useCallback(() => {
    setSecondsLeft(null)
  }, [])

  const { resetTimer, doLogout } = useSessionTimeout({
    onWarning: handleWarning,
    onLogout: handleLogout,
    onActivity: handleActivity,
  })

  const handleContinue = () => {
    setSecondsLeft(null)
    resetTimer()
  }

  const handleForceLogout = async () => {
    setLoggingOut(true)
    await doLogout()
  }

  if (!isWarning && !loggingOut) return null

  const mins = Math.floor((secondsLeft ?? 0) / 60)
  const secs = (secondsLeft ?? 0) % 60
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secondsLeft}s`

  const progress = secondsLeft !== null ? (secondsLeft / 120) * 100 : 0

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9998, backdropFilter: 'blur(4px)',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        background: 'var(--card)',
        border: '1.5px solid var(--border)',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        padding: '36px 40px',
        width: 420,
        maxWidth: '90vw',
        textAlign: 'center',
      }}>
        {/* Icône */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(245,167,35,0.12)', border: '2px solid rgba(245,167,35,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Shield size={30} color="var(--primary)" />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 10px' }}>
          Déconnexion automatique
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Aucune activité détectée. Pour protéger vos données, vous serez déconnecté dans
        </p>

        {/* Countdown */}
        <div style={{
          fontSize: 48, fontWeight: 900, color: secondsLeft && secondsLeft <= 30 ? '#DC2626' : 'var(--primary)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px',
          margin: '0 0 20px',
          transition: 'color 0.3s',
        }}>
          {timeStr}
        </div>

        {/* Barre de progression */}
        <div style={{ height: 4, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: progress > 25 ? 'var(--primary)' : '#DC2626',
            borderRadius: 99,
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleForceLogout}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: 'var(--secondary)', border: '1.5px solid var(--border)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <LogOut size={15} />Se déconnecter
          </button>
          <button
            onClick={handleContinue}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: 'var(--foreground)', border: 'none',
              color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <RefreshCw size={15} />Continuer
          </button>
        </div>
      </div>
    </>
  )
}
