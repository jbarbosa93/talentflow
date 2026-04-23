'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface DeleteConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: React.ReactNode
  /** Mot à taper pour activer le bouton de confirmation. Défaut: "SUPPRIMER" */
  confirmWord?: string
  /** Texte du bouton de confirmation. Défaut: "Supprimer définitivement" */
  confirmLabel?: string
  /** Texte affiché pendant le loading. Défaut: "Suppression..." */
  loadingLabel?: string
  /** Si true, bouton désactivé + spinner */
  isPending?: boolean
}

/**
 * v1.9.96 — Modal de confirmation FORTE pour les actions destructives.
 *
 * Demande à l'utilisateur de taper un mot exact ("SUPPRIMER" par défaut) pour
 * activer le bouton de validation. Empêche les clics accidentels.
 *
 * Pattern : createPortal vers document.body (cf CLAUDE.md pattern #10) pour
 * échapper aux containing blocks créés par Framer Motion / transform parents.
 */
export default function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmWord = 'SUPPRIMER',
  confirmLabel = 'Supprimer définitivement',
  loadingLabel = 'Suppression...',
  isPending = false,
}: DeleteConfirmModalProps) {
  const [typed, setTyped] = useState('')

  // Reset l'input à chaque ouverture pour éviter de garder une saisie d'une session précédente
  useEffect(() => { if (open) setTyped('') }, [open])

  if (typeof window === 'undefined' || !open) return null

  const matches = typed.trim() === confirmWord
  const canConfirm = matches && !isPending

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 16,
          border: '1.5px solid var(--destructive)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          maxWidth: 480, width: '100%',
          padding: '24px 28px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--destructive-soft)', color: 'var(--destructive)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={22} />
          </div>
          <h3 style={{
            fontSize: 17, fontWeight: 800, color: 'var(--destructive)',
            margin: 0, lineHeight: 1.3,
          }}>
            {title}
          </h3>
        </div>

        <div style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.55 }}>
          {description}
        </div>

        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'var(--destructive-soft)',
          border: '1px solid var(--destructive)',
          fontSize: 12, color: 'var(--destructive)', fontWeight: 600,
        }}>
          ⚠️ Cette action est <strong>IRRÉVERSIBLE</strong>.
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>
            Tape <code style={{
              background: 'var(--secondary)', padding: '2px 6px', borderRadius: 4,
              fontWeight: 800, color: 'var(--destructive)', letterSpacing: 1,
            }}>{confirmWord}</code> pour confirmer
          </span>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder={confirmWord}
            style={{
              padding: '10px 12px', borderRadius: 8,
              border: `1.5px solid ${matches ? 'var(--destructive)' : 'var(--border)'}`,
              background: 'var(--background)', color: 'var(--foreground)',
              fontSize: 14, fontFamily: 'inherit', letterSpacing: 1,
              outline: 'none',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: 'var(--card)', color: 'var(--foreground)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: 'none',
              background: canConfirm ? 'var(--destructive)' : 'var(--muted)',
              color: canConfirm ? 'var(--destructive-foreground)' : 'var(--muted-foreground)',
              fontSize: 13, fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
          >
            {isPending ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
