'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Globe,
  Pencil, Trash2, X, Check, FileText, Loader2,
  Briefcase, MessageSquare, Users, Smartphone, User, Activity, Plus,
  ShieldCheck, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { useClient, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { useQueryClient } from '@tanstack/react-query'
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
// v1.9.116 — DisplayField : affichage seul (édition via modal global de la card).
// Si href fourni (mailto: pour email, https:// pour site), le champ devient cliquable
// et ouvre le client mail / un nouvel onglet.
function DisplayField({ label, value, icon, href, multiline }: {
  label: string
  value: string | null
  icon?: React.ReactNode
  href?: string
  multiline?: boolean
}) {
  const isLink = !!(href && value)
  const Wrapper: any = isLink ? 'a' : 'div'
  return (
    <Wrapper
      href={isLink ? href : undefined}
      target={isLink && href!.startsWith('http') ? '_blank' : undefined}
      rel={isLink && href!.startsWith('http') ? 'noopener noreferrer' : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <span style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0, width: 14, display: 'flex', justifyContent: 'center' }}>
        {icon || null}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 500,
          color: value ? (isLink ? 'var(--info)' : 'var(--foreground)') : 'var(--muted)',
          textDecoration: isLink ? 'underline' : 'none',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflow: multiline ? undefined : 'hidden',
          textOverflow: multiline ? undefined : 'ellipsis',
        }}>
          {value || '---'}
        </div>
      </div>
    </Wrapper>
  )
}

// v1.9.116 — Modal d'édition multi-champs pour une card (Contact ou Adresse).
// Évite les boutons "Modifier" par champ qui rendaient l'UI bruitée.
interface CardEditField {
  field: string
  label: string
  multiline?: boolean
}

function CardEditModal({ title, fields, values, onSave, onClose, isSaving }: {
  title: string
  fields: CardEditField[]
  values: Record<string, string | null>
  onSave: (next: Record<string, string>) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.field] = values[f.field] || ''
    return init
  })

  const handleSubmit = () => {
    const out: Record<string, string> = {}
    for (const f of fields) out[f.field] = draft[f.field] || ''
    onSave(out)
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 80px rgba(0,0,0,0.3)', border: '2px solid var(--border)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(f => (
            <div key={f.field}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  value={draft[f.field] || ''}
                  onChange={e => setDraft(d => ({ ...d, [f.field]: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '2px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              ) : (
                <input
                  value={draft[f.field] || ''}
                  onChange={e => setDraft(d => ({ ...d, [f.field]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                  style={{ width: '100%', height: 38, padding: '0 12px', border: '2px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', background: 'var(--secondary)', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <button onClick={onClose} disabled={isSaving} style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: isSaving ? 0.6 : 1 }}>
            <Check size={13} strokeWidth={3} /> {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>,
    document.body
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
                  {/* v1.9.116 — Civilité (Madame / Monsieur / aucune) — éditable car
                      auto-extraction du parsing CV se trompe souvent (toutes les fiches
                      affichaient "Monsieur" même pour les femmes). */}
                  <select value={draft.titre || ''}
                    onChange={e => setDraft(d => ({ ...d, titre: e.target.value }))}
                    style={{ ...inputStyle, paddingRight: 28, cursor: 'pointer' }}
                  >
                    <option value="">— Civilité (optionnel) —</option>
                    <option value="Monsieur">Monsieur</option>
                    <option value="Madame">Madame</option>
                  </select>
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
  // v1.9.116 — Modal édition card (Contact / Adresse)
  const [editingCard, setEditingCard] = useState<'contact' | 'adresse' | 'notes' | null>(null)
  // v1.9.117 — Vérification Zefix
  const queryClient = useQueryClient()
  const [verifyingZefix, setVerifyingZefix] = useState(false)
  const [zefixVerifyResult, setZefixVerifyResult] = useState<{ found: boolean; bestMatch: any; candidates?: any[] } | null>(null)

  const handleSave = (field: string, value: string) => {
    updateClient.mutate({ id, data: { [field]: value } as any })
  }

  // v1.9.117 — Vérification Zefix : POST /api/clients/zefix/verify et refresh la fiche
  const handleVerifyZefix = async () => {
    setVerifyingZefix(true)
    setZefixVerifyResult(null)
    try {
      const res = await fetch('/api/clients/zefix/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur vérification')
      setZefixVerifyResult(json)
      // Invalide la fiche pour récupérer les zefix_* à jour
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      if (json.found) {
        toast.success(`Vérifié au RC : ${json.bestMatch.name} (${json.bestMatch.statusLabel})`)
      } else {
        toast.warning('Aucune correspondance trouvée au registre du commerce')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erreur de vérification')
    } finally {
      setVerifyingZefix(false)
    }
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
      {/* v1.9.117 — Bouton retour aligné sur /candidats/[id] : router.back() natif
          (respecte l'historique nav et donc page+filtres+scroll), fallback /clients */}
      <button
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back()
          } else {
            router.push('/clients')
          }
        }}
        className="neo-btn-ghost neo-btn-sm"
        style={{ marginBottom: 16 }}
      >
        <ArrowLeft size={14} /> Retour
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

      {/* v1.9.116 — Info cards grid : un seul bouton "Modifier" par card → modal multi-champs.
          Site web et email sont cliquables (ouvrent navigateur / mailto) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Contact */}
        <div style={{
          background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
          padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Contact
            </h3>
            <button
              onClick={() => setEditingCard('contact')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 7, color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: 0.3 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <Pencil size={11} /> Modifier
            </button>
          </div>
          <DisplayField
            label="Email" value={client.email} icon={<Mail size={14} />}
            href={client.email ? `mailto:${client.email}` : undefined}
          />
          <DisplayField
            label="Telephone" value={client.telephone} icon={<Phone size={14} />}
            href={client.telephone ? `tel:${client.telephone.replace(/\s+/g, '')}` : undefined}
          />
          <DisplayField
            label="Site web" value={client.site_web} icon={<Globe size={14} />}
            href={client.site_web
              ? (client.site_web.startsWith('http') ? client.site_web : `https://${client.site_web}`)
              : undefined}
          />
        </div>

        {/* Adresse */}
        <div style={{
          background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
          padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Adresse
            </h3>
            <button
              onClick={() => setEditingCard('adresse')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 7, color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: 0.3 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <Pencil size={11} /> Modifier
            </button>
          </div>
          <DisplayField label="Adresse" value={client.adresse} icon={<MapPin size={14} />} />
          <DisplayField label="NPA" value={client.npa} />
          <DisplayField label="Ville" value={client.ville} />
          <DisplayField label="Canton" value={client.canton} />
        </div>
      </div>

      {/* v1.9.116 — Modals édition card (Contact + Adresse) */}
      {editingCard === 'contact' && (
        <CardEditModal
          title="Modifier les coordonnées"
          fields={[
            { field: 'email', label: 'Email' },
            { field: 'telephone', label: 'Téléphone' },
            { field: 'site_web', label: 'Site web' },
          ]}
          values={{ email: client.email, telephone: client.telephone, site_web: client.site_web }}
          isSaving={updateClient.isPending}
          onSave={(next) => {
            updateClient.mutate(
              { id, data: next as any },
              { onSuccess: () => setEditingCard(null) }
            )
          }}
          onClose={() => setEditingCard(null)}
        />
      )}
      {editingCard === 'adresse' && (
        <CardEditModal
          title="Modifier l'adresse"
          fields={[
            { field: 'adresse', label: 'Adresse' },
            { field: 'npa', label: 'NPA' },
            { field: 'ville', label: 'Ville' },
            { field: 'canton', label: 'Canton' },
          ]}
          values={{ adresse: client.adresse, npa: client.npa, ville: client.ville, canton: client.canton }}
          isSaving={updateClient.isPending}
          onSave={(next) => {
            updateClient.mutate(
              { id, data: next as any },
              { onSuccess: () => setEditingCard(null) }
            )
          }}
          onClose={() => setEditingCard(null)}
        />
      )}

      {/* v1.9.114 — Personnes de contact (juste après les infos entreprise) */}
      <ContactsEditor
        contacts={(typeof client.contacts === 'string' ? JSON.parse(client.contacts) : client.contacts) || []}
        onSave={(next) => updateClient.mutate({ id, data: { contacts: next } as any })}
        isSaving={updateClient.isPending}
      />

      {/* v1.9.116 — Notes (bouton "Modifier" → modal multi-champ comme Contact/Adresse) */}
      <div style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{
            fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: 0,
            textTransform: 'uppercase', letterSpacing: 0.5,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <MessageSquare size={14} />
            Notes
          </h3>
          <button
            onClick={() => setEditingCard('notes')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 7, color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: 0.3 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Pencil size={11} /> Modifier
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: client.notes ? 'var(--foreground)' : 'var(--muted)', whiteSpace: 'pre-wrap', minHeight: 20 }}>
          {client.notes || '— Aucune note —'}
        </div>
      </div>
      {editingCard === 'notes' && (
        <CardEditModal
          title="Modifier les notes"
          fields={[{ field: 'notes', label: 'Notes', multiline: true }]}
          values={{ notes: client.notes }}
          isSaving={updateClient.isPending}
          onSave={(next) => {
            updateClient.mutate(
              { id, data: next as any },
              { onSuccess: () => setEditingCard(null) }
            )
          }}
          onClose={() => setEditingCard(null)}
        />
      )}

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

      {/* v1.9.117 — Registre du commerce suisse (Zefix) */}
      {(() => {
        const status = (client as any).zefix_status as string | null | undefined
        const isDissolved = status === 'GELOESCHT'
        const isLiquidating = status === 'AUFGELOEST'
        const isActive = status === 'EXISTIEREND'
        const sBg = isDissolved ? 'rgba(220,38,38,0.08)'
          : isLiquidating ? 'rgba(234,88,12,0.08)'
          : isActive ? 'rgba(22,163,74,0.08)' : 'var(--secondary)'
        const sFg = isDissolved ? '#dc2626'
          : isLiquidating ? '#ea580c'
          : isActive ? '#16a34a' : 'var(--muted)'
        const sLabel = isDissolved ? 'Radiée'
          : isLiquidating ? 'En liquidation'
          : isActive ? 'Actif au RC'
          : (status || 'Non vérifié')

        const verifiedAt = (client as any).zefix_verified_at
        const cantonalUrl = zefixVerifyResult?.bestMatch?.cantonalExcerptUrl

        return (
          <div style={{
            background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
            padding: '20px 22px', marginBottom: 20,
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: 12, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={18} color="var(--primary)" />
                <div>
                  <h3 style={{
                    fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: 0,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    Registre du commerce
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
                    Source : Zefix.ch — registre officiel suisse
                  </p>
                </div>
              </div>
              <button
                onClick={handleVerifyZefix}
                disabled={verifyingZefix}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8,
                  background: 'var(--primary)', color: 'var(--ink)',
                  border: 'none', fontSize: 12, fontWeight: 700,
                  cursor: verifyingZefix ? 'wait' : 'pointer',
                  opacity: verifyingZefix ? 0.6 : 1,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {verifyingZefix ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {verifyingZefix ? 'Vérification…' : (status ? 'Re-vérifier' : 'Vérifier sur Zefix')}
              </button>
            </div>

            {status ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Bandeau alerte si radiée ou en liquidation */}
                {isDissolved && (
                  <div style={{
                    padding: 12, borderRadius: 10,
                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#dc2626',
                  }}>
                    <AlertTriangle size={16} />
                    <strong>Entreprise radiée au RC.</strong> Tu peux désactiver ce client si elle n'existe plus.
                  </div>
                )}
                {isLiquidating && (
                  <div style={{
                    padding: 12, borderRadius: 10,
                    background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.3)',
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#ea580c',
                  }}>
                    <AlertTriangle size={16} />
                    <strong>Entreprise en liquidation.</strong> Vérifie avant nouveau placement.
                  </div>
                )}

                {/* Données RC */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
                      Statut
                    </div>
                    <span style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 999,
                      fontSize: 12, fontWeight: 700, background: sBg, color: sFg,
                    }}>
                      {sLabel}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
                      IDE
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {(client as any).zefix_uid || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
                      Raison sociale RC
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                      {(client as any).zefix_name || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
                      Vérifié le
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
                      {verifiedAt ? new Date(verifiedAt).toLocaleDateString('fr-CH', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      }) : '—'}
                    </div>
                  </div>
                </div>

                {cantonalUrl && (
                  <a
                    href={cantonalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                      padding: '6px 12px', borderRadius: 8,
                      background: 'var(--secondary)', color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      fontSize: 12, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={12} /> Voir l'extrait du registre cantonal
                  </a>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                Cette fiche n'a pas encore été vérifiée au registre du commerce. Clique sur "Vérifier sur Zefix" pour récupérer l'IDE officiel et le statut.
              </p>
            )}

            {/* Si vérif n'a pas trouvé, montrer les candidats proposés */}
            {zefixVerifyResult && !zefixVerifyResult.found && (zefixVerifyResult.candidates?.length ?? 0) > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
                  Candidats RC (aucun match auto, similarité &lt; 75%) :
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                  {zefixVerifyResult.candidates!.slice(0, 5).map((c: any, i: number) => (
                    <li key={i}>{c.name} <code>{c.uid}</code> — {c.legalSeat} ({c.similarity}%)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })()}

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
