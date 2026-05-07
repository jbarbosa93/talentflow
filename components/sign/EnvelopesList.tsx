// TalentFlow Sign — Liste des enveloppes (style v2 : neo-table)
// v2.2.0 — Phase 1
'use client'

import Link from 'next/link'
import { Eye, Trash2, Send, FileSignature } from 'lucide-react'
import { toast } from 'sonner'
import EnvelopeStatusBadge from './EnvelopeStatusBadge'
import EnvelopeCategoryIcon from './EnvelopeCategoryIcon'
import type { SignEnvelope } from '@/lib/sign/types'
import { CATEGORY_LABELS } from '@/lib/sign/types'

interface Props {
  envelopes: SignEnvelope[]
  onChange: () => void
  emptyLabel?: string
  emptyHint?: string
}

export default function EnvelopesList({ envelopes, onChange, emptyLabel = 'Aucune enveloppe', emptyHint }: Props) {
  if (envelopes.length === 0) {
    return (
      <div className="neo-empty">
        <div className="neo-empty-icon">
          <FileSignature size={36} style={{ color: 'var(--muted)' }} />
        </div>
        <div className="neo-empty-title">{emptyLabel}</div>
        {emptyHint && <div className="neo-empty-sub">{emptyHint}</div>}
      </div>
    )
  }

  const handleSend = async (id: string) => {
    if (!confirm('Envoyer cette enveloppe maintenant ? Les destinataires recevront un lien (Phase 3 : email Resend).')) return
    try {
      const r = await fetch(`/api/sign/envelopes/${id}/send`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur')
      toast.success(`Envoyé · ${data.tokens} destinataire${data.tokens > 1 ? 's' : ''}`)
      onChange()
    } catch (e: any) {
      toast.error(e.message || 'Erreur envoi')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cette enveloppe ?')) return
    try {
      const r = await fetch(`/api/sign/envelopes/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Enveloppe supprimée')
      onChange()
    } catch {
      toast.error('Erreur suppression')
    }
  }

  return (
    <div className="neo-table-wrap" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <table className="neo-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}></th>
            <th>Titre</th>
            <th style={{ width: 130 }}>Statut</th>
            <th style={{ width: 150 }}>Destinataires</th>
            <th style={{ width: 120 }}>Créée</th>
            <th style={{ width: 110, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {envelopes.map(env => (
            <tr key={env.id} style={{ transition: 'background 0.12s' }}>
              <td title={CATEGORY_LABELS[env.document_category]} style={{ textAlign: 'center' }}>
                <EnvelopeCategoryIcon category={env.document_category} size={18} />
              </td>
              <td>
                <Link
                  href={`/sign/${env.id}`}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    textDecoration: 'none',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 380,
                  }}
                >
                  {env.title}
                </Link>
                {env.message && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--muted)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 380,
                    }}
                  >
                    {env.message}
                  </div>
                )}
              </td>
              <td>
                <EnvelopeStatusBadge status={env.status} />
              </td>
              <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {env.recipients.length} destinataire{env.recipients.length > 1 ? 's' : ''}
              </td>
              <td style={{ fontSize: 12.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(env.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <Link
                    href={`/sign/${env.id}`}
                    title="Voir"
                    style={iconBtnStyle}
                  >
                    <Eye size={14} />
                  </Link>
                  {env.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleSend(env.id)}
                      title="Envoyer"
                      style={{ ...iconBtnStyle, color: 'var(--info)' }}
                    >
                      <Send size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(env.id)}
                    title="Supprimer"
                    style={{ ...iconBtnStyle, color: 'var(--destructive)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--foreground)',
  cursor: 'pointer',
  textDecoration: 'none',
}
