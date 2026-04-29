'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Globe,
  Pencil, Trash2, X, Check, FileText, Loader2,
  Briefcase, MessageSquare, Users, Smartphone, User, Activity, Plus,
} from 'lucide-react'
import { useClient, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import { toast } from 'sonner'
import ActivityHistory from '@/components/ActivityHistory'
import ClientLogo from '@/components/ClientLogo'
import { SECTEURS_ACTIVITE, SECTEUR_REPRESENTATIVE_METIER } from '@/lib/secteurs-extractor'

// v1.9.114 — couleurs pills secteurs alignées sur catégories métiers
function makeSecteurColors(getColorForMetier: (m: string) => string | undefined) {
  return (secteur: string) => {
    const metier = SECTEUR_REPRESENTATIVE_METIER[secteur as keyof typeof SECTEUR_REPRESENTATIVE_METIER]
    const hex = metier ? getColorForMetier(metier) : undefined
    if (!hex) return { bg: 'var(--primary-soft)', border: 'var(--primary)', text: 'var(--primary)' }
    return { bg: `${hex}1A`, border: hex, text: hex }
  }
}

// Editable field component
function EditableField({ label, value, field, icon, onSave, multiline }: {
  label: string
  value: string | null
  field: string
  icon?: React.ReactNode
  onSave: (field: string, value: string) => void
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  if (editing) {
    return (
      <div style={{ marginBottom: 2 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        {multiline ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            autoFocus
            style={{
              width: '100%', padding: '8px 12px',
              border: '2px solid var(--primary)', borderRadius: 8,
              background: 'var(--secondary)', color: 'var(--foreground)',
              fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        ) : (
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { onSave(field, draft); setEditing(false) }
              if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
            }}
            style={{
              width: '100%', height: 38, padding: '0 12px',
              border: '2px solid var(--primary)', borderRadius: 8,
              background: 'var(--secondary)', color: 'var(--foreground)',
              fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
          <button onClick={() => { onSave(field, draft); setEditing(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #BBF7D0', background: 'var(--success-soft)', color: 'var(--success)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Check size={12} strokeWidth={3} /> Sauvegarder
          </button>
          <button onClick={() => { setDraft(value || ''); setEditing(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <X size={12} /> Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
        cursor: 'pointer', borderRadius: 6,
        transition: 'background 0.1s',
      }}
      onClick={() => { setDraft(value || ''); setEditing(true) }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0, width: 14, display: 'flex', justifyContent: 'center' }}>
        {icon || null}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 500, color: value ? 'var(--foreground)' : 'var(--muted)',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflow: multiline ? undefined : 'hidden',
          textOverflow: multiline ? undefined : 'ellipsis',
        }}>
          {value || '---'}
        </div>
      </div>
      <Pencil size={12} style={{ color: 'var(--muted)', opacity: 0.4, flexShrink: 0, marginTop: 4 }} />
    </div>
  )
}

// v1.9.114 — Éditeur de contacts JSONB (CRUD inline)
interface ContactItem {
  prenom?: string
  nom?: string
  fonction?: string
  email?: string
  telephone?: string
  mobile?: string
  titre?: string
}

function ContactsEditor({ contacts, onSave, isSaving }: {
  contacts: ContactItem[]
  onSave: (next: ContactItem[]) => void
  isSaving: boolean
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<ContactItem>({})

  const startEdit = (idx: number) => {
    setDraft(contacts[idx] || {})
    setEditingIdx(idx)
  }

  const cancelEdit = () => {
    setEditingIdx(null)
    setDraft({})
  }

  const commitEdit = () => {
    if (editingIdx === null) return
    const isEmpty = !((draft.prenom || '').trim() || (draft.nom || '').trim() ||
      (draft.email || '').trim() || (draft.telephone || '').trim() ||
      (draft.fonction || '').trim())
    if (isEmpty) {
      // Edit annulé sur card vide → on retire le placeholder
      const next = contacts.filter((_, i) => i !== editingIdx)
      onSave(next)
    } else {
      const next = [...contacts]
      next[editingIdx] = { ...next[editingIdx], ...draft }
      onSave(next)
    }
    setEditingIdx(null)
    setDraft({})
  }

  const addContact = () => {
    const next = [...contacts, { prenom: '', nom: '', fonction: '', email: '', telephone: '' }]
    onSave(next)
    setDraft({ prenom: '', nom: '', fonction: '', email: '', telephone: '' })
    setEditingIdx(next.length - 1)
  }

  const removeContact = (idx: number) => {
    const next = contacts.filter((_, i) => i !== idx)
    onSave(next)
    if (editingIdx === idx) { setEditingIdx(null); setDraft({}) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 6,
    border: '1.5px solid var(--border)', background: 'var(--card)',
    color: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
  }
  const iconBtnStyle: React.CSSProperties = {
    width: 24, height: 24, borderRadius: 6,
    border: 'none', background: 'transparent',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
  }

  return (
    <div style={{
      background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
      padding: '20px 22px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{
          fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: 0,
          textTransform: 'uppercase', letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Users size={14} />
          Personnes de contact{contacts.length > 0 ? ` (${contacts.length})` : ''}
        </h3>
        <button
          type="button"
          onClick={addContact}
          disabled={isSaving || editingIdx !== null}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 12px', borderRadius: 8,
            border: '1.5px solid var(--primary)', background: 'var(--primary-soft)',
            color: 'var(--primary)', fontSize: 12, fontWeight: 700,
            cursor: isSaving || editingIdx !== null ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)',
            opacity: isSaving || editingIdx !== null ? 0.5 : 1,
          }}
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {contacts.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, fontStyle: 'italic' }}>
          Aucun contact — clique sur « Ajouter » pour en créer un.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: contacts.length === 1 ? '1fr' : '1fr 1fr', gap: 12 }}>
          {contacts.map((c, idx) => {
            const isEditing = editingIdx === idx
            // ─── Mode édition ───
            if (isEditing) {
              return (
                <div key={idx} style={{
                  background: 'var(--secondary)', border: '1.5px solid var(--primary)',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button
                      type="button" onClick={commitEdit} disabled={isSaving}
                      title="Valider"
                      style={iconBtnStyle}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--success, #22C55E)'; e.currentTarget.style.background = 'rgba(34,197,94,0.15)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    ><Check size={14} /></button>
                    <button
                      type="button" onClick={cancelEdit} disabled={isSaving}
                      title="Annuler"
                      style={iconBtnStyle}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.background = 'var(--secondary)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    ><X size={14} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingRight: 56 }}>
                    <input type="text" value={draft.prenom || ''} placeholder="Prénom"
                      onChange={e => setDraft(d => ({ ...d, prenom: e.target.value }))}
                      style={inputStyle} autoFocus />
                    <input type="text" value={draft.nom || ''} placeholder="Nom"
                      onChange={e => setDraft(d => ({ ...d, nom: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <input type="text" value={draft.fonction || ''} placeholder="Fonction (ex: Directeur, RH…)"
                    onChange={e => setDraft(d => ({ ...d, fonction: e.target.value }))}
                    style={inputStyle} />
                  <input type="email" value={draft.email || ''} placeholder="Email"
                    onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                    style={inputStyle} />
                  <input type="tel" value={draft.telephone || ''} placeholder="Téléphone"
                    onChange={e => setDraft(d => ({ ...d, telephone: e.target.value }))}
                    style={inputStyle} />
                </div>
              )
            }
            // ─── Mode display (lecture seule + boutons édit / suppr) ───
            return (
              <div key={idx} style={{
                background: 'var(--secondary)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 6, position: 'relative',
              }}>
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                  <button
                    type="button" onClick={() => startEdit(idx)} disabled={isSaving || editingIdx !== null}
                    title="Modifier"
                    style={{ ...iconBtnStyle, cursor: isSaving || editingIdx !== null ? 'not-allowed' : 'pointer', opacity: editingIdx !== null && editingIdx !== idx ? 0.4 : 1 }}
                    onMouseEnter={e => { if (!isSaving && editingIdx === null) { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-soft)' }}}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                  ><Pencil size={13} /></button>
                  <button
                    type="button" onClick={() => removeContact(idx)} disabled={isSaving || editingIdx !== null}
                    title="Supprimer"
                    style={{ ...iconBtnStyle, cursor: isSaving || editingIdx !== null ? 'not-allowed' : 'pointer', opacity: editingIdx !== null ? 0.4 : 1 }}
                    onMouseEnter={e => { if (!isSaving && editingIdx === null) { e.currentTarget.style.color = 'var(--destructive)'; e.currentTarget.style.background = 'var(--destructive-soft)' }}}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                  ><Trash2 size={13} /></button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 56 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: 'var(--ink)', flexShrink: 0,
                  }}>
                    {((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase() || <User size={14} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[c.titre, c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
                    </div>
                    {c.fonction && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                        {c.fonction}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {c.telephone && (
                    <a href={`tel:${c.telephone}`} style={{ fontSize: 12, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <Phone size={12} color="var(--muted)" /> {c.telephone}
                    </a>
                  )}
                  {c.mobile && c.mobile !== c.telephone && (
                    <a href={`tel:${c.mobile}`} style={{ fontSize: 12, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <Smartphone size={12} color="var(--muted)" /> {c.mobile}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: 'var(--primary-dark, #E6B800)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <Mail size={12} color="var(--muted)" /> {c.email}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: client, isLoading } = useClient(id)
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()
  const { getColorForMetier } = useMetierCategories()
  const getSecteurColor = makeSecteurColors(getColorForMetier)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showActivityHistory, setShowActivityHistory] = useState(false)

  const handleSave = (field: string, value: string) => {
    updateClient.mutate({ id, data: { [field]: value } as any })
  }

  const handleDelete = () => {
    deleteClient.mutate(id, {
      onSuccess: () => router.push('/clients'),
    })
  }

  const handleToggleStatut = () => {
    const newStatut = client?.statut === 'actif' ? 'desactive' : 'actif'
    updateClient.mutate({ id, data: { statut: newStatut } as any })
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '120px 0', gap: 12,
      }}>
        <Loader2 size={24} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>Chargement...</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <Building2 size={48} color="var(--muted)" style={{ opacity: 0.4, marginBottom: 16 }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Client introuvable</p>
        <button
          onClick={() => router.push('/clients')}
          style={{
            marginTop: 16, height: 38, padding: '0 20px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--card)',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          Retour aux clients
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => router.push('/clients')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--secondary)', border: '1.5px solid var(--border)',
          borderRadius: 100, padding: '8px 18px',
          color: 'var(--muted)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-body)',
          marginBottom: 20, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--ink, #1C1A14)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
      >
        <ArrowLeft size={14} />
        Retour aux clients
      </button>

      {/* Header card */}
      <div style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 16,
        padding: '28px 30px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        {/* v1.9.115 — Logo automatique (Clearbit / Google Favicons / initiales) */}
        <ClientLogo nom_entreprise={client.nom_entreprise} site_web={client.site_web} size="lg" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: 'var(--foreground)', margin: 0,
            lineHeight: 1.2,
          }}>
            {client.nom_entreprise}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {client.ville && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 13, color: 'var(--muted)', fontWeight: 500,
              }}>
                <MapPin size={13} />
                {client.npa ? `${client.npa} ` : ''}{client.ville}{client.canton ? `, ${client.canton}` : ''}
              </span>
            )}
            {/* v1.9.114 — Secteurs d'activité colorés par catégorie métier */}
            {client.secteurs_activite && client.secteurs_activite.length > 0 && (
              <>
                {client.secteurs_activite.slice(0, 3).map(s => {
                  const c = getSecteurColor(s)
                  return (
                    <span key={s} style={{
                      padding: '3px 10px', borderRadius: 6,
                      background: c.bg, border: `1px solid ${c.border}`,
                      fontSize: 11, fontWeight: 700, color: c.text,
                    }}>
                      {s}
                    </span>
                  )
                })}
                {client.secteurs_activite.length > 3 && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 6,
                    background: 'var(--secondary)', border: '1px solid var(--border)',
                    fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
                  }}>
                    +{client.secteurs_activite.length - 3}
                  </span>
                )}
              </>
            )}
            {/* Statut toggle */}
            <button
              onClick={handleToggleStatut}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 6,
                background: client.statut === 'actif' ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
                border: `1.5px solid ${client.statut === 'actif' ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.3)'}`,
                fontSize: 11, fontWeight: 700,
                color: client.statut === 'actif' ? '#16A34A' : '#64748B',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: client.statut === 'actif' ? '#22C55E' : '#94A3B8',
              }} />
              {client.statut === 'actif' ? 'Actif' : 'Desactive'}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowActivityHistory(true)}
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              color: 'var(--muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            title="Historique d'activité"
          >
            <Activity size={16} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              color: 'var(--muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#EF4444' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            title="Supprimer ce client"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Info cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Contact info */}
        <div style={{
          background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
          padding: '20px 22px',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Contact
          </h3>
          <EditableField
            label="Email" field="email" value={client.email}
            icon={<Mail size={14} />} onSave={handleSave}
          />
          <EditableField
            label="Telephone" field="telephone" value={client.telephone}
            icon={<Phone size={14} />} onSave={handleSave}
          />
          <EditableField
            label="Site web" field="site_web" value={client.site_web}
            icon={<Globe size={14} />} onSave={handleSave}
          />
        </div>

        {/* Address */}
        <div style={{
          background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
          padding: '20px 22px',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Adresse
          </h3>
          <EditableField
            label="Adresse" field="adresse" value={client.adresse}
            icon={<MapPin size={14} />} onSave={handleSave}
          />
          <EditableField
            label="NPA" field="npa" value={client.npa}
            onSave={handleSave}
          />
          <EditableField
            label="Ville" field="ville" value={client.ville}
            onSave={handleSave}
          />
          <EditableField
            label="Canton" field="canton" value={client.canton}
            onSave={handleSave}
          />
        </div>
      </div>

      {/* v1.9.114 — Personnes de contact (juste après les infos entreprise) */}
      <ContactsEditor
        contacts={(typeof client.contacts === 'string' ? JSON.parse(client.contacts) : client.contacts) || []}
        onSave={(next) => updateClient.mutate({ id, data: { contacts: next } as any })}
        isSaving={updateClient.isPending}
      />

      {/* Notes */}
      <div style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <h3 style={{
          fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 12px',
          textTransform: 'uppercase', letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <MessageSquare size={14} />
          Notes
        </h3>
        <EditableField
          label="Notes" field="notes" value={client.notes}
          icon={<FileText size={14} />} onSave={handleSave}
          multiline
        />
      </div>

      {/* v1.9.114 — Secteurs d'activité (au fond, après notes) */}
      <div style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <h3 style={{
          fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 6px',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          Secteurs d&apos;activité
        </h3>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
          Tagger les secteurs que ce client recherche habituellement. Utilisé par la prospection email et le matching.
          {(client.secteurs_activite?.length ?? 0) === 0 && ' (Aucun secteur — clique sur les pills ci-dessous pour ajouter)'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SECTEURS_ACTIVITE.map(s => {
            const current = client.secteurs_activite ?? []
            const active = current.includes(s)
            const c = getSecteurColor(s)
            return (
              <button
                key={s}
                type="button"
                disabled={updateClient.isPending}
                onClick={() => {
                  const next = active ? current.filter(x => x !== s) : [...current, s]
                  updateClient.mutate({ id, data: { secteurs_activite: next } as any })
                }}
                style={{
                  padding: '5px 11px', borderRadius: 6,
                  border: `1.5px solid ${active ? c.border : 'var(--border)'}`,
                  background: active ? c.bg : 'var(--card)',
                  color: active ? c.text : 'var(--muted-foreground)',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: updateClient.isPending ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-body)',
                  opacity: updateClient.isPending ? 0.6 : 1,
                  transition: 'all 0.1s',
                }}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Meta info */}
      <div style={{
        fontSize: 11, color: 'var(--muted)', fontWeight: 500, textAlign: 'center',
        padding: '8px 0 40px',
      }}>
        Cree le {new Date(client.created_at).toLocaleDateString('fr-CH', {
          day: 'numeric', month: 'long', year: 'numeric',
        })}
      </div>

      {/* Delete confirmation dialog — v1.9.47 portal pour garantir position:fixed centré */}
      {showDeleteConfirm && typeof window !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
              background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Trash2 size={22} color="var(--destructive)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 8px', textAlign: 'center' }}>
              Supprimer ce client ?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>
              Cette action est irreversible. Toutes les informations de <strong>{client.nom_entreprise}</strong> seront perdues.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{
                height: 40, padding: '0 20px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--secondary)',
                color: 'var(--foreground)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
                Annuler
              </button>
              <button onClick={handleDelete} style={{
                height: 40, padding: '0 20px', borderRadius: 8,
                border: '2px solid #DC2626', background: '#EF4444',
                color: 'white', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                boxShadow: '2px 2px 0 #991B1B',
              }}>
                Supprimer definitivement
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showActivityHistory && client && (
        <ActivityHistory
          clientId={client.id}
          clientNom={client.nom_entreprise || ''}
          onClose={() => setShowActivityHistory(false)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
