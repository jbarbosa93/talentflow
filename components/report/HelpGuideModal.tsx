// v2.10.0 — Guide d'aide in-app (version HTML du PDF candidat).
// Modal portalisé, branded L-Agence, accessible depuis le bouton « Comment ça marche ? »
// du portail rapport. Explique le parcours complet : compte → rapport → heures → signer.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X as XIcon } from 'lucide-react'

const GREEN = '#15803D'
const BLUE = '#2E6CB8'
const AMBER = '#A16207'

type Step = { n: number; color: string; title: string; body: React.ReactNode }

const STEPS: Step[] = [
  { n: 1, color: AMBER, title: 'Crée ton compte', body: <>Tu reçois un <strong>e-mail de L-Agence</strong> avec un lien. Clique dessus, puis choisis ton <strong>mot de passe</strong> (identifiant = ton e-mail). À faire une seule fois.</> },
  { n: 2, color: GREEN, title: 'Ouvre ton rapport', body: <>Chaque semaine, tu reçois ton lien par <strong>WhatsApp</strong> ou e-mail. Clique sur <strong>« Nouveau rapport »</strong> pour la semaine en cours.</> },
  { n: 3, color: BLUE, title: 'Saisis tes heures, jour par jour', body: <>Indique <strong>Début</strong> et <strong>Fin</strong>, ou clique <strong>« Maintenant »</strong> (met l’heure exacte + ta position GPS). Ajoute tes <strong>pauses</strong>, et la <strong>Zone de travail</strong> (chantier).</> },
  { n: 4, color: BLUE, title: 'Timbreuse LIVE (si activée)', body: <>Un gros bouton <strong>« Démarrer ma journée »</strong> → le chrono tourne en direct → <strong>Pause / Reprendre</strong> → <strong>Terminer</strong>. Encore plus simple sur le chantier.</> },
  { n: 5, color: AMBER, title: 'Absent ou en congé ?', body: <>Clique <strong>« Absent / Congé »</strong> et choisis le motif (Vacances, Jour férié…). Le jour compte 0 h.</> },
  { n: 6, color: GREEN, title: 'Vérifie et signe', body: <>Le <strong>total</strong> se calcule tout seul. À la dernière étape, clique <strong>« Signer ici »</strong>, dessine ta signature au doigt, puis <strong>« Confirmer et envoyer »</strong>. Terminé !</> },
]

export default function HelpGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '92vh', background: '#FAFAF7',
          borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          flexShrink: 0, padding: '16px 18px', background: '#fff',
          borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 22, fontWeight: 400, color: '#1C1A14', lineHeight: 1.1,
            }}>Comment remplir ton rapport ?</div>
            <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>En quelques minutes, depuis ton téléphone.</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          ><XIcon size={16} /></button>
        </div>

        {/* Steps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 12 }}>
              <span style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 999,
                background: s.color, color: '#fff', fontSize: 14, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.n}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1A14' }}>{s.title}</div>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginTop: 2 }}>{s.body}</div>
              </div>
            </div>
          ))}
          <div style={{
            margin: '4px 0 8px', padding: '10px 12px', borderRadius: 10,
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            fontSize: 12.5, color: '#15803D', lineHeight: 1.5,
          }}>
            📍 <strong>Pourquoi le GPS ?</strong> Le bouton « Maintenant » prouve que tu étais sur le chantier. Autorise simplement la localisation quand ton téléphone le demande.
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '12px 18px', borderTop: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Besoin d’aide ? <strong style={{ color: '#1C1A14' }}>+41 76 297 97 95</strong></span>
          <button
            type="button" onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#EAB308', color: '#1C1A14', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
          >J’ai compris</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
