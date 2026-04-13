'use client'
import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000  // 2 heures
const WARNING_BEFORE_MS   = 2 * 60 * 1000    // avertir 2 min avant
const LS_KEY              = 'talentflow_last_activity'

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
    localStorage.removeItem(LS_KEY)
    const supabase = createClient()
    await supabase.auth.signOut()
    await fetch('/api/auth/logout', { method: 'POST' })
    onLogout()
    router.push('/login?reason=timeout')
  }, [router, onLogout])

  // Démarre les timers avec un délai personnalisé (permet de reprendre depuis un état persisté)
  const startTimerWithDelay = useCallback((delayMs: number) => {
    clearAll()
    onActivity()

    if (delayMs <= 0) {
      doLogout()
      return
    }

    const warnDelay = delayMs - WARNING_BEFORE_MS
    if (warnDelay > 0) {
      // Avertir 2 min avant la déconnexion
      warnRef.current = setTimeout(() => {
        let secondsLeft = Math.round(WARNING_BEFORE_MS / 1000)
        onWarning(secondsLeft)
        countRef.current = setInterval(() => {
          secondsLeft -= 1
          onWarning(secondsLeft)
          if (secondsLeft <= 0) clearInterval(countRef.current!)
        }, 1000)
      }, warnDelay)
    } else {
      // Moins de 2 min restantes — avertir immédiatement
      let secondsLeft = Math.max(0, Math.round(delayMs / 1000))
      onWarning(secondsLeft)
      countRef.current = setInterval(() => {
        secondsLeft -= 1
        onWarning(secondsLeft)
        if (secondsLeft <= 0) clearInterval(countRef.current!)
      }, 1000)
    }

    timerRef.current = setTimeout(doLogout, delayMs)
  }, [doLogout, onWarning, onActivity])

  const resetTimer = useCallback(() => {
    lastActive.current = Date.now()
    localStorage.setItem(LS_KEY, lastActive.current.toString())
    startTimerWithDelay(INACTIVITY_LIMIT_MS)
  }, [startTimerWithDelay])

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

    // Au montage : vérifier le timestamp persisté en localStorage
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      const lastTs  = parseInt(stored, 10)
      const elapsed = Date.now() - lastTs
      if (elapsed >= INACTIVITY_LIMIT_MS) {
        // Délai dépassé → déconnecter immédiatement
        doLogout()
      } else {
        // Temps restant → reprendre là où on s'est arrêté
        lastActive.current = lastTs
        startTimerWithDelay(INACTIVITY_LIMIT_MS - elapsed)
      }
    } else {
      // Pas de timestamp → démarrer une session fraîche
      resetTimer()
    }

    return () => {
      clearAll()
      events.forEach(e => window.removeEventListener(e, handleActivity))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { resetTimer, doLogout }
}
