// v2.8.8 — Modal de notes partagées sur un candidat
// Utilisé depuis :
//   - Portail client public : posts en tant que 'client' (authorName saisi)
//   - Dashboard admin : posts en tant que 'consultant' (auth user)
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Loader2, MessageSquare, User, Briefcase, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export interface SharedNote {
  id: string
  author_type: 'consultant' | 'client'
  author_name: string
  content: string
  created_at: string
  author_user_id?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  candidatId: string
  candidatName?: string
  /** Mode "public" (portail client) ou "admin" (dashboard) */
  mode: 'public' | 'admin'
  /** Slug portail client (requis si mode=public) */
  slug?: string
  /** Nom auteur par défaut (mode public, peut être édité) */
  defaultAuthorName?: string
  /** Pour mode admin : user id pour check ownership delete */
  currentUserId?: string
  onCountChange?: (count: number) => void
}

export default function SharedNotesModal(props: Props) {
  const [notes, setNotes] = useState<SharedNote[]>([])
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [authorName, setAuthorName] = useState(props.defaultAuthorName || '')
  const [sending, setSending] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const apiBase = props.mode === 'public'
    ? `/api/client-portal/${props.slug}/candidats/${props.candidatId}/notes`
    : `/api/candidats/${props.candidatId}/notes-partagees`

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(apiBase)
      const d = await r.json()
      if (r.ok) {
        setNotes(d.notes || [])
        props.onCountChange?.(d.notes?.length || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [apiBase, props])

  useEffect(() => {
    if (props.open) fetchNotes()
  }, [props.open, fetchNotes])

  if (!mounted || !props.open) return null

  const handleSend = async () => {
    const text = content.trim()
    if (!text) {
      toast.error('Le message ne peut pas être vide')
      return
    }
    if (props.mode === 'public' && !authorName.trim()) {
      toast.error('Indiquez votre nom')
      return
    }
    setSending(true)
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          ...(props.mode === 'public' ? { authorName: authorName.trim() } : {}),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Note ajoutée ✓')
      setContent('')
      await fetchNotes()
    } catch (e: any) {
      toast.error(e.message || 'Erreur envoi')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (noteId: string) => {
    if (props.mode !== 'admin') return
    if (!confirm('Supprimer cette note ?')) return
    try {
      const r = await fetch(`${apiBase}?noteId=${noteId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Erreur')
      toast.success('Note supprimée')
      await fetchNotes()
    } catch {
      toast.error('Erreur suppression')
    }
  }

  return createPortal(
    <div
      onClick={props.onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(580px, 95vw)', maxHeight: '88vh',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <MessageSquare size={20} style={{ color: '#A16207', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 19, fontWeight: 400, color: '#1C1A14',
            }}>
              Notes partagées
            </h2>
            {props.candidatName && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                {props.candidatName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Fermer"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB',
              background: 'transparent', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#6B7280',
            }}
          ><X size={16} /></button>
        </div>

        {/* Liste notes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
          {loading && notes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              <Loader2 size={18} className="animate-spin" style={{ marginBottom: 8 }} /><br/>
              Chargement…
            </div>
          ) : notes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Aucune note pour le moment. Soyez le premier à en ajouter une.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notes.map(n => {
                const isClient = n.author_type === 'client'
                const canDelete = props.mode === 'admin' && (
                  (n.author_type === 'consultant' && n.author_user_id === props.currentUserId)
                )
                return (
                  <div key={n.id} style={{
                    padding: 12,
                    background: isClient ? '#EFF6FF' : '#FEF9C3',
                    border: `1px solid ${isClient ? '#BFDBFE' : '#FDE68A'}`,
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontSize: 11.5, color: '#374151', fontWeight: 700 }}>
                      {isClient ? <Briefcase size={11} /> : <User size={11} />}
                      <span>{n.author_name}</span>
                      <span style={{ color: '#9CA3AF', fontWeight: 500 }}>·</span>
                      <span style={{ color: '#9CA3AF', fontWeight: 500 }}>
                        {isClient ? 'Client' : 'L-Agence'}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 11 }}>
                        {formatDate(n.created_at)}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          aria-label="Supprimer"
                          style={{
                            border: 'none', background: 'transparent',
                            cursor: 'pointer', color: '#DC2626',
                            padding: 2, marginLeft: 2,
                          }}
                          title="Supprimer cette note"
                        ><Trash2 size={12} /></button>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, color: '#1C1A14', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {n.content}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #E5E7EB',
          background: '#FAFAF7',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {props.mode === 'public' && (
            <input
              type="text"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              disabled={sending}
              placeholder="Votre nom"
              maxLength={120}
              style={{
                height: 36, padding: '0 12px',
                border: '1px solid #E5E7EB', borderRadius: 8,
                fontSize: 13, fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          )}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={sending}
            placeholder="Ajouter une note partagée…"
            rows={3}
            maxLength={4000}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSend()
              }
            }}
            style={{
              padding: 10,
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit',
              resize: 'vertical', minHeight: 64,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              {content.length}/4000 · ⌘+Enter pour envoyer
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !content.trim() || (props.mode === 'public' && !authorName.trim())}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: '1.5px solid #EAB308',
                background: '#EAB308', color: '#1C1A14',
                fontSize: 13, fontWeight: 700,
                cursor: sending ? 'wait' : 'pointer',
                opacity: (sending || !content.trim()) ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return `Aujourd'hui ${d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}
