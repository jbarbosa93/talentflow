'use client'
import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000  // 30 minutes
const WARNING_BEFORE_MS   = 2 * 60 * 1000    // avertir 2 min avant

type Opts = {
  onWarning: (secondsLeft: number) => void
  onLogout: () => void
  onActivity: () => void
  disabled?: boolean  // Désactiver le timeout (ex: pendant l'import en masse)
}

export function useSessionTimeout({ onWarning, onLogout, onActivity, disabled = false }: Opts) {
  const router     = useRouter()
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActive = useRef(Date.now())

  const clearAll = () => {
    if (timerRef.current)  clearTimeout(timerRef.current)
    if (warnRef.current)   clearTimeout(warnRef.current)
    if (countRef.current)  clearInterval(countRef.current)
  }

  const doLogout = useCallback(async () => {
    clearAll()
    const supabase = createClient()
    await supabase.auth.signOut()
    await fetch('/api/auth/logout', { method: 'POST' })
    onLogout()
    router.push('/login?reason=timeout')
  }, [router, onLogout])

  const resetTimer = useCallback(() => {
    clearAll()
    lastActive.current = Date.now()
    onActivity()

    // Avertir 2 minutes avant la déconnexion
    warnRef.current = setTimeout(() => {
      let secondsLeft = Math.round(WARNING_BEFORE_MS / 1000)
      onWarning(secondsLeft)
      countRef.current = setInterval(() => {
        secondsLeft -= 1
        onWarning(secondsLeft)
        if (secondsLeft <= 0) {
          clearInterval(countRef.current!)
        }
      }, 1000)
    }, INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS)

    // Déconnexion automatique après INACTIVITY_LIMIT_MS
    timerRef.current = setTimeout(doLogout, INACTIVITY_LIMIT_MS)
  }, [doLogout, onWarning, onActivity])

  // Quand l'import est en cours, reset le timer toutes les 5 min pour éviter le logout
  useEffect(() => {
    if (!disabled) return
    clearAll()
    onActivity()  // Cacher le warning si affiché
    const keepAlive = setInterval(() => resetTimer(), 5 * 60 * 1000)
    resetTimer()
    return () => clearInterval(keepAlive)
  }, [disabled, resetTimer, onActivity])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'pointerdown']

    const handleActivity = () => resetTimer()

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    resetTimer() // démarrer le timer au montage

    return () => {
      clearAll()
      events.forEach(e => window.removeEventListener(e, handleActivity))
    }
  }, [resetTimer])

  return { resetTimer, doLogout }
}
