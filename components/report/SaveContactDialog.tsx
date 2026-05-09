// TalentFlow Rapports — Dialog "Enregistrer ce contact ?" (Bug 3 v2.3.10)
//
// Affiché AVANT la création du lien rapport quand l'user a saisi manuellement
// (sans sélectionner depuis le dropdown autocomplete client) un nom + email
// contact qui pourraient être ajoutés à un client existant en DB.
//
// Logique :
//   - Si clientId pré-sélectionné via autocomplete + contactName/Email saisis
//     manuellement (peut-être édités après pick) → propose d'ajouter le contact
//     comme nouveau row dans clients[clientId].contacts[]
//   - Si pas de clientId (saisie 100% manuelle) → SKIP le dialog
//     (on ne crée pas de client entier depuis ce flow)
//
// Réponse user :
//   - "Oui, enregistrer" → POST /api/clients/{id}/add-contact puis appelle onContinue
//   - "Non, continuer sans enregistrer" → appelle directement onContinue
//   - Fermeture (X / ESC / backdrop) → annule le submit (onCancel)
'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Loader2, X } from 'lucide-react'

interface Props {
  open: boolean
  /** Données du contact à éventuellement enregistrer */
  clientName: string
  contactName: string  // "Marie Dupont" (sera split en first/last pour POST)
  contactEmail: string
  /** Si l'user veut enregistrer + continuer */
  onSaveAndContinue: () => void | Promise<void>
  /** Si l'user veut juste continuer sans enregistrer */
  onSkipAndContinue: () => void
  /** Si l'user ferme la modale (annule le submit) */
  onCancel: () => void
  /** True pendant le POST add-contact */
  saving?: boolean
}

export default function SaveContactDialog({
  open, clientName, contactName, contactEmail,
  onSaveAndContinue, onSkipAndContinue, onCancel, saving,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, saving, onCancel])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={() => { if (!saving) onCancel() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 95vw)',
          background: 'var(--card)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          padding: '24px 26px',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          marginBottom: 14,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'var(--primary-soft)',
            color: 'var(--primary, #A16207)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Building2 size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}>
              Enregistrer ce contact ?
            </h2>
            <p style={{
              fontSize: 13, color: 'var(--muted)', margin: '4px 0 0',
              lineHeight: 1.5,
            }}>
              Ajoutez ce contact au client existant pour le réutiliser plus tard.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fermer"
            style={{
              width: 32, height: 32,
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--card)',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', flexShrink: 0,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Récap données */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: 18,
          fontSize: 13, lineHeight: 1.7, color: 'var(--foreground)',
        }}>
          <div><strong style={{ color: 'var(--muted)', fontWeight: 600 }}>Entreprise :</strong> {clientName}</div>
          <div><strong style={{ color: 'var(--muted)', fontWeight: 600 }}>Contact :</strong> {contactName || <em style={{ color: 'var(--muted)' }}>(non renseigné)</em>}</div>
          <div><strong style={{ color: 'var(--muted)', fontWeight: 600 }}>Email :</strong> {contactEmail}</div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={onSkipAndContinue}
            disabled={saving}
            style={{
              padding: '10px 16px',
              fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--card)', color: 'var(--foreground)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Non, continuer sans enregistrer
          </button>
          <button
            type="button"
            onClick={onSaveAndContinue}
            disabled={saving}
            style={{
              padding: '10px 18px',
              fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14',
              borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              minWidth: 160, justifyContent: 'center',
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Enregistrement…' : 'Oui, enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
