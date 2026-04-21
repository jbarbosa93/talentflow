'use client'
// v1.9.68 — Warning informatif affiché dans les modals d'envoi (Email / iMessage / WhatsApp)
// quand ≥1 candidat sélectionné a été contacté par n'importe quel user dans les 7 derniers jours.
// Non bloquant : 2 boutons "Fermer" (masque le warning, on peut envoyer) / "Continuer malgré tout".

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface RecentContact {
  canal: 'email' | 'imessage' | 'whatsapp' | 'sms'
  by: string
  at: string
  days_ago: number
  corps_extract: string
}

const CANAL_LABEL: Record<RecentContact['canal'], string> = {
  email: 'Email', imessage: 'iMessage', whatsapp: 'WhatsApp', sms: 'SMS',
}
const CANAL_ICON: Record<RecentContact['canal'], string> = {
  email: '✉️', imessage: '💬', whatsapp: '📱', sms: '📨',
}

export function useRecentContacts(candidatIds: string[], enabled: boolean) {
  const [contacts, setContacts] = useState<Record<string, RecentContact>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || candidatIds.length === 0) {
      setContacts({})
      return
    }
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ candidat_ids: candidatIds.join(',') }).toString()
    fetch(`/api/messages/recent-contacts?${qs}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { contacts: {} })
      .then(d => { if (!cancelled) setContacts(d.contacts || {}) })
      .catch(() => { if (!cancelled) setContacts({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled, candidatIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return { contacts, loading }
}

interface RecentContactsWarningProps {
  /** Candidats sélectionnés avec leur prénom/nom pour l'affichage */
  candidats: { id: string; prenom: string | null; nom: string | null }[]
  /** Résultat de useRecentContacts */
  contacts: Record<string, RecentContact>
  /** Callback si l'utilisateur continue quand même (pour masquer le warning) */
  onContinue: () => void
  /** Callback pour fermer le warning (même effet) */
  onDismiss?: () => void
}

export function RecentContactsWarning({ candidats, contacts, onContinue, onDismiss }: RecentContactsWarningProps) {
  const affected = candidats.filter(c => contacts[c.id])
  if (affected.length === 0) return null

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--warning-soft)',
      border: '1.5px solid var(--warning)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--warning)' }}>
          {affected.length} candidat{affected.length > 1 ? 's' : ''} déjà contacté{affected.length > 1 ? 's' : ''} ces 7 derniers jours
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            title="Fermer"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--warning)', padding: 2, display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
        {affected.map(c => {
          const info = contacts[c.id]
          const nom = `${c.prenom || ''} ${c.nom || ''}`.trim() || '(sans nom)'
          const whenLabel = info.days_ago === 0
            ? 'aujourd\'hui'
            : info.days_ago === 1
              ? 'hier'
              : `il y a ${info.days_ago} jours`
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--foreground)',
              padding: '5px 8px', borderRadius: 7,
              background: 'var(--card)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13 }}>{CANAL_ICON[info.canal]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{nom}</span>
                <span style={{ color: 'var(--muted-foreground)' }}> — {whenLabel} par <strong>{info.by}</strong> via {CANAL_LABEL[info.canal]}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Fermer
          </button>
        )}
        <button
          onClick={onContinue}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 800,
            border: 'none', background: 'var(--warning)',
            color: 'var(--destructive-foreground)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Continuer malgré tout
        </button>
      </div>
    </div>
  )
}
