'use client'
import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000  // 2 heures
const WARNING_BEFORE_MS   = 2 * 60 * 1000        // avertir 2 min avant
const CHECK_INTERVAL_MS   = 30 * 1000            // vérifier toutes les 30s (survit à la veille)
const LS_KEY              = 'talentflow_last_activity'

type Opts = {
  onWarning: (secondsLeft: number) => void
  onLogout: () => void
  onActivity: () => void
  disabled?: boolean
}

export function useSessionTimeout({ onWarning, onLogout, onActivity, disabled = false }: Opts) {
  const router     = useRouter()
  const checkRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningRef = useRef(false)
  const logoutDone = useRef(false)

  const clearAll = () => {
    if (checkRef.current) clearInterval(checkRef.current)
    if (countRef.current) clearInterval(countRef.current)
    warningRef.current = false
  }

  const doLogout = useCallback(async () => {
    if (logoutDone.current) return
    logoutDone.current = true
    clearAll()
    localStorage.removeItem(LS_KEY)
    sessionStorage.setItem('auto_logout', 'true')
    const supabase = createClient()
    await supabase.auth.signOut()
    await fetch('/api/auth/logout', { method: 'POST' })
    onLogout()
    router.push('/login?reason=timeout')
  }, [router, onLogout])

  const touchActivity = useCallback(() => {
    const now = Date.now()
    localStorage.setItem(LS_KEY, now.toString())
    // Si on était en phase warning → annuler
    if (warningRef.current) {
      warningRef.current = false
      if (countRef.current) clearInterval(countRef.current)
      countRef.current = null
      onActivity()
    }
  }, [onActivity])

  // Vérification périodique — survit à la veille Mac/Windows
  const checkInactivity = useCallback(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (!stored) return
    const lastTs = parseInt(stored, 10)
    const elapsed = Date.now() - lastTs
    const remaining = INACTIVITY_LIMIT_MS - elapsed

    if (remaining <= 0) {
      // Délai dépassé → logout immédiat
      doLogout()
    } else if (remaining <= WARNING_BEFORE_MS && !warningRef.current) {
      // Entrer en phase warning
      warningRef.current = true
      const secondsLeft = Math.round(remaining / 1000)
      onWarning(secondsLeft)
      // Countdown chaque seconde
      countRef.current = setInterval(() => {
        const now = Date.now()
        const storedNow = parseInt(localStorage.getItem(LS_KEY) || '0', 10)
        const rem = INACTIVITY_LIMIT_MS - (now - storedNow)
        if (rem <= 0) {
          doLogout()
        } else {
          onWarning(Math.max(0, Math.round(rem / 1000)))
        }
      }, 1000)
    }
  }, [doLogout, onWarning])

  const resetTimer = useCallback(() => {
    touchActivity()
  }, [touchActivity])

  // Quand l'import est en cours, reset le timer toutes les 5 min
  useEffect(() => {
    if (!disabled) return
    clearAll()
    onActivity()
    const keepAlive = setInterval(() => touchActivity(), 5 * 60 * 1000)
    touchActivity()
    return () => clearInterval(keepAlive)
  }, [disabled, touchActivity, onActivity])

  useEffect(() => {
    // Écouter les événements d'activité utilisateur
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'pointerdown']
    const handleActivity = () => touchActivity()
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

    // Au montage : vérifier le timestamp persisté
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      const elapsed = Date.now() - parseInt(stored, 10)
      if (elapsed >= INACTIVITY_LIMIT_MS) {
        doLogout()
        return
      }
    } else {
      // Pas de timestamp → session fraîche
      touchActivity()
    }

    // Démarrer la vérification périodique (30s) — survit à la veille
    checkRef.current = setInterval(checkInactivity, CHECK_INTERVAL_MS)
    // Vérifier immédiatement aussi
    checkInactivity()

    return () => {
      clearAll()
      events.forEach(e => window.removeEventListener(e, handleActivity))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { resetTimer, doLogout }
}
