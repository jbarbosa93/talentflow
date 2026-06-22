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

// v2.10.9 — Guide « Timbreuse LIVE » (templates avec champ pointage : Metabader…)
const STEPS_TIMBREUSE: Step[] = [
  { n: 1, color: GREEN, title: 'Accède à ton rapport', body: <>Ton lien est <strong>permanent</strong> : garde-le, ou <strong>installe l’app</strong> sur ton téléphone (« Ajouter à l’écran d’accueil ») pour y accéder en 1 tap, tout le temps. Clique <strong>« Nouveau rapport »</strong> pour la semaine en cours.</> },
  { n: 2, color: BLUE, title: 'Saisis tes heures, jour par jour', body: <>Avec la <strong>Timbreuse LIVE</strong> : clique <strong>« Démarrer ma journée »</strong> → le chrono tourne en direct → <strong>Pause / Reprendre</strong> → <strong>Terminer</strong>. (Ou tape Début / Fin à la main.) Renseigne tes <strong>pauses</strong> et la <strong>Zone de travail</strong> (chantier). Le <strong>total</strong> se calcule tout seul.</> },
  { n: 3, color: AMBER, title: 'Absent ou en congé ?', body: <>Clique <strong>« Absent / Congé »</strong> et choisis le motif (Vacances, Jour férié…). Le jour compte 0 h.</> },
  { n: 4, color: GREEN, title: 'Vérifie et signe', body: <>À la dernière étape, clique <strong>« Signer ici »</strong>, dessine ta signature au doigt, puis <strong>« Confirmer et envoyer »</strong>. C’est envoyé à L-Agence. Terminé !</> },
]

// v2.10.9 — Guide « total d'heures » (templates simples : rapport d'heures normal, sans timbreuse)
const STEPS_SIMPLE: Step[] = [
  { n: 1, color: GREEN, title: 'Accède à ton rapport', body: <>Ton lien est <strong>permanent</strong> : garde-le, ou <strong>installe l’app</strong> sur ton téléphone (« Ajouter à l’écran d’accueil ») pour y accéder en 1 tap, tout le temps. Clique <strong>« Nouveau rapport »</strong> pour la semaine en cours.</> },
  { n: 2, color: BLUE, title: 'Saisis tes heures, jour par jour', body: <>Pour chaque jour, inscris ton <strong>total d’heures</strong> travaillées. Renseigne aussi, si besoin, ton <strong>temps de déplacement</strong> et le <strong>n° de chantier</strong>, et coche <strong>Repas</strong> si tu as mangé. Le <strong>total de la semaine</strong> se calcule tout seul.</> },
  { n: 3, color: AMBER, title: 'Jour non travaillé ?', body: <>Laisse simplement le jour <strong>vide</strong> (0 h). Pas besoin de remplir les jours où tu n’as pas travaillé.</> },
  { n: 4, color: GREEN, title: 'Vérifie et signe', body: <>À la dernière étape, clique <strong>« Signer ici »</strong>, dessine ta signature au doigt, puis <strong>« Confirmer et envoyer »</strong>. C’est envoyé à L-Agence. Terminé !</> },
]

export default function HelpGuideModal({ open, onClose, hasTimbreuse = true }: { open: boolean; onClose: () => void; hasTimbreuse?: boolean }) {
  const STEPS = hasTimbreuse ? STEPS_TIMBREUSE : STEPS_SIMPLE
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // v2.13.9 — verrouille le scroll de la page derrière le guide (sinon le fond
    // défile sous le modal sur mobile).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
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
          {hasTimbreuse && (
            <div style={{
              margin: '4px 0 0', padding: '10px 12px', borderRadius: 10,
              background: '#FFFBEB', border: '1px solid #FDE68A',
              fontSize: 12.5, color: '#92400E', lineHeight: 1.55,
            }}>
              ☕ <strong>Comment noter une pause&nbsp;?</strong> Indique <strong>l’heure</strong> où la pause commence et l’heure où elle finit — par exemple ta pause de midi&nbsp;: <strong>de&nbsp;12:00 à&nbsp;13:00</strong>. Le client veut savoir <em>quand</em> tu as fait la pause, pas seulement combien de temps. Mets bien le <strong>début ET la fin</strong> de chaque pause, sinon elle n’est pas déduite. La durée s’affiche toute seule sous la pause.
            </div>
          )}
          {hasTimbreuse && (
            <div style={{
              margin: '4px 0 8px', padding: '10px 12px', borderRadius: 10,
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              fontSize: 12.5, color: '#15803D', lineHeight: 1.5,
            }}>
              📍 <strong>Pourquoi le GPS ?</strong> Quand tu démarres et termines ta journée, ta position est enregistrée — ça prouve que tu étais bien sur le chantier. Autorise simplement la localisation quand ton téléphone le demande.
            </div>
          )}
        </div>

        {/* Footer — v2.13.9 : paddingBottom safe-area (boutons coupés par la barre home iPhone). */}
        <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', borderTop: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="https://wa.me/41762979795?text=Bonjour%2C%20j%27ai%20une%20question%20sur%20mon%20rapport%20d%27heures."
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 14px', borderRadius: 10, background: '#25D366', color: '#fff', fontSize: 13.5, fontWeight: 800, textDecoration: 'none' }}
          >📱 Besoin d’aide ? WhatsApp</a>
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
