'use client'

// TalentFlow Rapport — Bandeau d'annonce « application à venir »
// v2.10.16 — Affiché en haut du portail candidat (/report/[slug]).
// Refermable, mémorisé en localStorage (ne réapparaît plus une fois fermé).

import { useEffect, useState } from 'react'
import { X, Smartphone } from 'lucide-react'

// v2.13.28 — clé v2 : le nouveau bandeau « app disponible » réapparaît même chez
// ceux qui avaient fermé l'ancien « app bientôt ».
const DISMISS_KEY = 'tf_report_app_available_dismissed_v2'

export default function AppComingSoonBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== '1') setShow(true)
    } catch {
      setShow(true)
    }
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* silencieux */ }
    setShow(false)
  }

  return (
    <div style={{
      margin: '10px 16px 0',
      padding: '12px 12px 12px 14px',
      borderRadius: 14,
      background: 'linear-gradient(135deg, #1C1A14 0%, #2a2620 100%)',
      color: '#fff',
      display: 'flex', alignItems: 'flex-start', gap: 11,
      boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
    }}>
      <div style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 10,
        background: 'rgba(247,201,72,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Smartphone size={20} color="#F7C948" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
          📱 L’application est disponible !
        </div>
        <div style={{ fontSize: 12.5, color: '#E7E5DF', lineHeight: 1.5, marginTop: 3 }}>
          Télécharge l’app TalentFlow pour gérer tes rapports d’heures, tes documents et tes notifications.
        </div>
        <a href="/telecharger" target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9,
          padding: '7px 13px', borderRadius: 9, background: '#F7C948', color: '#1C1A14',
          fontSize: 12.5, fontWeight: 800, textDecoration: 'none',
        }}>
          ⬇️ Télécharger maintenant
        </a>
      </div>
      <button
        type="button" onClick={dismiss} aria-label="Fermer"
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 8,
          background: 'rgba(255,255,255,0.10)', border: 'none', color: '#E7E5DF',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      ><X size={15} /></button>
    </div>
  )
}
