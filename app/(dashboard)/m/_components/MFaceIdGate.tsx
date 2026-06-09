'use client'
// Verrou Face ID / biométrie — actif UNIQUEMENT dans l'app native consultant
// (user-agent « TalentFlowApp » + pont Capacitor). Sur navigateur web : inactif.
// Appelle le plugin natif @aparajita/capacitor-biometric-auth via window.Capacitor.
import { useEffect, useState, useCallback } from 'react'
import { Lock, Loader2, Fingerprint } from 'lucide-react'

function isInApp(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.userAgent.includes('TalentFlowApp')
}

export default function MFaceIdGate() {
  const [locked, setLocked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(false)

  const authenticate = useCallback(async () => {
    setError(false)
    setChecking(true)
    const cap = (typeof window !== 'undefined' ? (window as any).Capacitor : null)
    const bio = cap?.Plugins?.BiometricAuth
    // Plugin absent (vieux build / web) → ne pas bloquer l'accès.
    if (!bio) { setChecking(false); setLocked(false); return }
    try {
      // Vérifie qu'une biométrie/credential est disponible ; sinon on n'enferme pas.
      try {
        const info = await bio.checkBiometry()
        if (info && info.isAvailable === false && info.deviceIsSecure === false) {
          setChecking(false); setLocked(false); return
        }
      } catch { /* checkBiometry indispo → on tente quand même authenticate */ }

      await bio.authenticate({
        reason: 'Déverrouillez votre espace recruteur',
        cancelTitle: 'Annuler',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Utiliser le code',
        androidTitle: 'TalentFlow',
        androidSubtitle: 'Authentification requise',
      })
      sessionStorage.setItem('tf_faceid_ok', '1')
      setChecking(false)
      setLocked(false)
    } catch {
      // Échec / annulation → reste verrouillé avec bouton réessayer.
      setChecking(false)
      setError(true)
      setLocked(true)
    }
  }, [])

  useEffect(() => {
    if (!isInApp()) return
    if (sessionStorage.getItem('tf_faceid_ok') === '1') return
    setLocked(true)
    authenticate()
  }, [authenticate])

  if (!locked) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#FAFAF7', color: '#1C1A14',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
        padding: 'env(safe-area-inset-top, 0px) 24px env(safe-area-inset-bottom, 0px)',
        textAlign: 'center',
      }}
    >
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#1C1A14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checking ? <Loader2 size={34} color="#F7C948" className="animate-spin" /> : <Lock size={32} color="#F7C948" />}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>TalentFlow verrouillé</div>
      <div style={{ fontSize: 14, color: '#6b6657', maxWidth: 260 }}>
        {checking ? 'Authentification en cours…' : 'Déverrouillez avec Face ID pour accéder à votre espace.'}
      </div>
      {!checking && (
        <button
          onClick={authenticate}
          style={{
            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', borderRadius: 14, border: 'none',
            background: '#F7C948', color: '#1C1A14', fontWeight: 700, fontSize: 15,
          }}
        >
          <Fingerprint size={18} /> {error ? 'Réessayer' : 'Déverrouiller'}
        </button>
      )}
    </div>
  )
}
