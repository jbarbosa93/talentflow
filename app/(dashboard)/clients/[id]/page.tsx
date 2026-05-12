'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'

// v2.1.15 — Map fiche client (lazy load, ssr off — Leaflet incompatible SSR)
const ClientFicheMap = dynamic(() => import('@/components/ClientFicheMap'), { ssr: false })
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
import { useSecteursActiviteConfig } from '@/hooks/useSecteursActiviteConfig'

// v1.9.114 — couleurs pills secteurs alignées sur catégories métiers
// v1.9.122 — mapping vient désormais de la table DB (fallback constante si pas trouvé)
function makeSecteurColors(
  getColorForMetier: (m: string) => string | undefined,
  secteursMap: Map<string, string | null>,
) {
  return (secteur: string) => {
    const metier = secteursMap.get(secteur)
      ?? SECTEUR_REPRESENTATIVE_METIER[secteur as keyof typeof SECTEUR_REPRESENTATIVE_METIER]
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

function CardEditModal({ title, fields, values, onSave, onClose, isSaving, extraAction }: {
  title: string
  fields: CardEditField[]
  values: Record<string, string | null>
  onSave: (next: Record<string, string>) => void
  onClose: () => void
  isSaving: boolean
  extraAction?: { label: string; variant?: 'danger' | 'default'; onClick: () => void }
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
        style={{
          background: 'var(--surface, var(--card))', borderRadius: 14,
          width: '100%', maxWidth: 540,
          boxShadow: 'var(--shadow-xl, 0 24px 80px rgba(0,0,0,0.3))',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--text, var(--foreground))', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, border: '1px solid var(--border)', background: 'transparent', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3, var(--muted-foreground))' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(f => (
            <div key={f.field}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3, var(--muted-foreground))', display: 'block', marginBottom: 5 }}>
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  value={draft[f.field] || ''}
                  onChange={e => setDraft(d => ({ ...d, [f.field]: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface, var(--card))', color: 'var(--text, var(--foreground))', fontSize: 14, fontFamily: 'var(--font-jakarta), system-ui, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              ) : (
                <input
                  value={draft[f.field] || ''}
                  onChange={e => setDraft(d => ({ ...d, [f.field]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                  style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface, var(--card))', color: 'var(--text, var(--foreground))', fontSize: 14, fontFamily: 'var(--font-jakarta), system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', background: 'var(--secondary)', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          {extraAction ? (
            <button
              onClick={extraAction.onClick}
              disabled={isSaving}
              style={{
                padding: '9px 14px', borderRadius: 8, border: '1px solid',
                borderColor: extraAction.variant === 'danger' ? 'var(--destructive)' : 'var(--border)',
                background: extraAction.variant === 'danger' ? 'var(--destructive-soft)' : 'var(--card)',
                color: extraAction.variant === 'danger' ? 'var(--destructive)' : 'var(--foreground)',
                fontSize: 13, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {extraAction.label}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={isSaving} style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              Annuler
            </button>
            <button onClick={handleSubmit} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: isSaving ? 0.6 : 1 }}>
              <Check size={13} strokeWidth={3} /> {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
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
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                  {/* v1.9.121 — boutons texte en bas (les anciens icônes en absolute
                      étaient minuscules et invisibles sur fond similaire) */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" onClick={cancelEdit} disabled={isSaving}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: '1.5px solid var(--border)', background: 'var(--card)',
                        color: 'var(--foreground)', cursor: isSaving ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    ><X size={14} /> Annuler</button>
                    <button type="button" onClick={commitEdit} disabled={isSaving}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground, #fff)',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 6,
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    ><Check size={14} /> {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
                  </div>
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
  // v2.1.14 — Marquer ce client comme vu (pour faire disparaître le badge isNew dans la liste)
  useEffect(() => {
    if (id) {
      import('@/lib/clients-seen').then(m => m.markClientSeen(id))
    }
  }, [id])
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()
  const { getColorForMetier } = useMetierCategories()
  // v1.9.122 — taxonomie secteurs DB
  const { data: secteursList } = useSecteursActiviteConfig()
  const secteursMap = useMemo(
    () => new Map((secteursList || []).map(s => [s.nom, s.metier_representatif])),
    [secteursList]
  )
  const SECTEURS_LIST = useMemo(
    () => (secteursList && secteursList.length > 0 ? secteursList.map(s => s.nom) : [...SECTEURS_ACTIVITE]),
    [secteursList]
  )
  const getSecteurColor = makeSecteurColors(getColorForMetier, secteursMap)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showActivityHistory, setShowActivityHistory] = useState(false)
  const [showNotesTooltip, setShowNotesTooltip] = useState(false) // v2.1.15
  // v1.9.116 — Modal édition card (Contact / Adresse)
  const [editingCard, setEditingCard] = useState<'header' | 'contact' | 'adresse' | 'notes' | 'add-contact' | 'new-commande' | null>(null)
  const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null)  /* v1.9.127 — index contact en cours d'édition */
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
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* v1.9.127 — Header style maquette V2 : ligne unique sans card autour
          Titre serif Instrument Serif + sous-titre meta inline + actions à droite. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{
            fontFamily: 'var(--font-instrument-serif), Georgia, serif',
            fontSize: 38, fontWeight: 400, lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: 'var(--text, var(--foreground))',
            margin: 0,
          }}>
            {client.nom_entreprise}
          </h1>
          <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--text-3, var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(client.secteurs_activite && client.secteurs_activite.length > 0) && (
              <>
                <span>{client.secteurs_activite[0]}</span>
                {client.secteurs_activite.length > 1 && <span style={{ opacity: 0.6 }}>+{client.secteurs_activite.length - 1}</span>}
                {client.ville && <span style={{ opacity: 0.4 }}>·</span>}
              </>
            )}
            {client.ville && <span>{client.ville}{client.canton ? `, ${client.canton}` : ''}</span>}
            {/* Statut */}
            <button
              onClick={handleToggleStatut}
              title={client.statut === 'actif' ? 'Cliquer pour désactiver' : 'Cliquer pour activer'}
              style={{
                marginLeft: 4,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px', borderRadius: 999,
                background: client.statut === 'actif' ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
                border: `1px solid ${client.statut === 'actif' ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.3)'}`,
                fontSize: 11, fontWeight: 600,
                color: client.statut === 'actif' ? '#16A34A' : '#64748B',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: client.statut === 'actif' ? '#22C55E' : '#94A3B8' }} />
              {client.statut === 'actif' ? 'Actif' : 'Désactivé'}
            </button>
            {client.created_at && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ fontSize: 12 }}>
                  Créé le {new Date(client.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions à droite : Retour ghost + Contacter ghost + Nouvelle commande primary */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) router.back()
              else router.push('/clients')
            }}
            className="neo-btn-ghost neo-btn-sm"
          >
            <ArrowLeft size={13} /> Retour
          </button>
          {/* v2.1.15 — Bouton Notes header avec preview au mouseover (style fiche candidat) */}
          <div style={{ position: 'relative' }}
            onMouseEnter={() => setShowNotesTooltip(true)}
            onMouseLeave={() => setShowNotesTooltip(false)}
          >
            <button
              onClick={() => { setEditingCard('notes'); setShowNotesTooltip(false) }}
              className="neo-btn-ghost neo-btn-sm"
              style={{ position: 'relative' }}
              title="Notes internes"
            >
              <MessageSquare size={13} />
              {client.notes && client.notes.trim().length > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--primary)',
                }} />
              )}
            </button>
            {showNotesTooltip && client.notes && client.notes.trim().length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 500, width: 320,
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
                boxShadow: '0 16px 40px rgba(0,0,0,0.20)', padding: 14,
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Notes internes
                </p>
                <p style={{ fontSize: 13, color: 'var(--foreground)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                  {client.notes}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowActivityHistory(true)}
            className="neo-btn-ghost neo-btn-sm"
            title="Historique d'activité"
          >
            <Activity size={13} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="neo-btn-ghost neo-btn-sm"
            style={{ color: 'var(--destructive)' }}
            title="Supprimer ce client"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setEditingCard('new-commande')}
            className="neo-btn-yellow neo-btn-sm"
          >
            <Plus size={13} /> Nouvelle commande
          </button>
        </div>
      </div>

      {/* v1.9.127 — Cards V2 maquette : Informations (gauche) + Contacts (droite).
          Les anciennes cards Contact + Adresse sont conservées plus bas (display: none)
          pour préserver la logique d'édition / EditCardModal. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* ═══ Card Informations ═══ */}
        <div className="neo-card-soft" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 18, fontWeight: 400, letterSpacing: '-0.005em', color: 'var(--text, var(--foreground))', margin: 0 }}>
              Informations
            </label>
            <button
              onClick={() => setEditingCard('header')}
              title="Modifier les informations"
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, var(--card))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3, var(--muted-foreground))' }}
            >
              <Pencil size={12} />
            </button>
          </div>
          <div style={{ padding: '8px 18px 14px' }}>
            {(() => {
              const adresseParts = [client.adresse, client.npa && client.ville ? `${client.npa} ${client.ville}` : (client.ville || '')].filter(Boolean)
              const adresse = adresseParts.join(', ') || null
              const zefixUid = (client as any).zefix_uid as string | null
              const rows: Array<{ label: string; value: React.ReactNode }> = [
                { label: 'Raison sociale', value: client.nom_entreprise },
                { label: 'Secteur',        value: (client.secteurs_activite && client.secteurs_activite[0]) || (client as any).secteur || null },
                { label: 'Adresse',        value: adresse },
                // v2.1.14 — Email + Téléphone général affichés sur la fiche (étaient seulement dans le modal édition)
                { label: 'Email',          value: client.email ? (
                  <a href={`mailto:${client.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {client.email}
                  </a>
                ) : null },
                { label: 'Téléphone',      value: client.telephone ? (
                  <a href={`tel:${client.telephone.replace(/\s+/g, '')}`} style={{ color: 'var(--foreground)', textDecoration: 'none' }}>
                    {client.telephone}
                  </a>
                ) : null },
                { label: 'Site',           value: client.site_web ? (
                  <a href={client.site_web.startsWith('http') ? client.site_web : `https://${client.site_web}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {client.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                ) : null },
                {
                  label: 'Registre RC',
                  value: zefixUid ? (() => {
                    const zefixName = (client as any).zefix_name as string | null
                    const zefixStatus = (client as any).zefix_status as string | null
                    const zefixVerifiedAt = (client as any).zefix_verified_at as string | null
                    const statusLabel = zefixStatus === 'EXISTIEREND' ? 'Actif' : zefixStatus === 'AUFGELOEST' ? 'En liquidation' : zefixStatus === 'GELOESCHT' ? 'Radié' : zefixStatus
                    const statusColor = zefixStatus === 'EXISTIEREND' ? 'var(--success)' : zefixStatus === 'GELOESCHT' ? 'var(--destructive)' : 'var(--warning)'
                    const cantonalUrl = `https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(client.nom_entreprise)}`
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <code style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontSize: 12 }}>{zefixUid}</code>
                          {zefixStatus && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: `${statusColor}15`, color: statusColor }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        {zefixName && zefixName !== client.nom_entreprise && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-3, var(--muted-foreground))' }}>
                            <span style={{ opacity: 0.7 }}>Nom RC : </span>{zefixName}
                          </div>
                        )}
                        {zefixVerifiedAt && (
                          <div style={{ fontSize: 11, color: 'var(--text-3, var(--muted-foreground))', opacity: 0.8 }}>
                            Vérifié le {new Date(zefixVerifiedAt).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <a href={cantonalUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--text-2, var(--muted-foreground))', fontSize: 11, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' }}>
                            <ExternalLink size={11} /> Extrait Zefix
                          </a>
                          <button
                            onClick={() => router.push(`/integrations?zefix_search=${encodeURIComponent(client.nom_entreprise)}`)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--text-2, var(--muted-foreground))', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            <ShieldCheck size={11} /> Re-vérifier
                          </button>
                        </div>
                      </div>
                    )
                  })() : (
                    <button
                      onClick={() => router.push(`/integrations?zefix_search=${encodeURIComponent(client.nom_entreprise)}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--primary-soft, rgba(234,179,8,0.14))', color: 'var(--accent-foreground, #8B5A00)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <ShieldCheck size={12} /> Vérifier sur Zefix
                    </button>
                  ),
                },
              ].filter(r => !!r.value)
              return (
                <div>
                  {rows.map((r, i) => (
                    <div key={r.label} style={{
                      display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10,
                      padding: '10px 0', borderTop: i === 0 ? 'none' : '1px dashed var(--border)',
                      fontSize: 13, lineHeight: 1.4,
                    }}>
                      <span style={{ color: 'var(--text-3, var(--muted-foreground))', fontWeight: 500 }}>{r.label}</span>
                      <span style={{ color: 'var(--text, var(--foreground))', fontWeight: 500, wordBreak: 'break-word' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ═══ Card Contacts ═══ */}
        <div className="neo-card-soft" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 18, fontWeight: 400, letterSpacing: '-0.005em', color: 'var(--text, var(--foreground))', margin: 0 }}>
              Contacts
            </label>
            <button
              onClick={() => setEditingCard('add-contact')}
              title="Ajouter un nouveau contact (personne)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, var(--card))', cursor: 'pointer', color: 'var(--text-2, var(--foreground))', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
            >
              <Plus size={13} /> Ajouter
            </button>
          </div>
          <div style={{ padding: '8px 18px 14px' }}>
            {(() => {
              /* v1.9.127 — Parser robuste : contacts peut être array OU string JSON OU null */
              const raw = (client as any).contacts
              let contacts: any[] = []
              if (Array.isArray(raw)) contacts = raw
              else if (typeof raw === 'string' && raw.trim()) {
                try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) contacts = parsed } catch {}
              }
              if (contacts.length === 0) {
                return <p style={{ fontSize: 13, color: 'var(--muted-foreground, var(--muted))', padding: '12px 0', margin: 0 }}>Aucun contact enregistré</p>
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {contacts.map((p: any, i: number) => {
                    const fullName = ((p.prenom || '') + ' ' + (p.nom || '')).trim() || p.nom || p.email || 'Contact sans nom'
                    const initials = fullName.split(/\s+/).map((x: string) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
                    return (
                      <div key={i}
                        onClick={() => setEditingContactIdx(i)}
                        title="Cliquer pour modifier ce contact"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 6px',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          borderRadius: 8,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2, var(--secondary))')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'var(--surface-3, var(--secondary))',
                          color: 'var(--text-2, var(--foreground))',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>{initials}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, var(--foreground))' }}>{fullName}</div>
                          {p.role && <div style={{ fontSize: 11.5, color: 'var(--text-3, var(--muted-foreground))', marginTop: 1 }}>{p.role}</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 11.5, color: 'var(--text-3, var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                          {p.telephone && <a href={`tel:${p.telephone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.telephone}</a>}
                          {p.email && <a href={`mailto:${p.email}`} style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{p.email}</a>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* === Anciennes cards Contact / Adresse cachées (logique d'édition préservée) === */}
      <div style={{ display: 'none' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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
      </div>{/* v1.9.127 — fin wrapper display:none des anciennes cards Contact/Adresse */}

      {/* v1.9.127 — Modal édition Informations COMPLET (tous les champs de la card V2) */}
      {editingCard === 'header' && (
        <CardEditModal
          title="Modifier les informations"
          fields={[
            { field: 'nom_entreprise', label: 'Raison sociale' },
            { field: 'secteur',        label: 'Secteur (NOGA)' },
            { field: 'adresse',        label: 'Adresse (rue + n°)' },
            { field: 'npa',            label: 'NPA' },
            { field: 'ville',          label: 'Ville' },
            { field: 'canton',         label: 'Canton (VD, VS, GE...)' },
            { field: 'site_web',       label: 'Site web' },
            { field: 'email',          label: 'Email général' },
            { field: 'telephone',      label: 'Téléphone général' },
          ]}
          values={{
            nom_entreprise: client.nom_entreprise,
            secteur:        (client as any).secteur,
            adresse:        client.adresse,
            npa:            client.npa,
            ville:          client.ville,
            canton:         client.canton,
            site_web:       client.site_web,
            email:          client.email,
            telephone:      client.telephone,
          }}
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
      {/* v1.9.127 — Modal Ajouter / Modifier un contact (personne) */}
      {(editingCard === 'add-contact' || editingContactIdx !== null) && (() => {
        /* Parser sûr (string JSON OU array) */
        const raw = (client as any).contacts
        let parsed: any[] = []
        if (Array.isArray(raw)) parsed = raw
        else if (typeof raw === 'string' && raw.trim()) {
          try { const p = JSON.parse(raw); if (Array.isArray(p)) parsed = p } catch {}
        }
        const isEditing = editingContactIdx !== null
        const current = isEditing ? (parsed[editingContactIdx as number] || {}) : {}
        return (
          <CardEditModal
            title={isEditing ? `Modifier ${current.prenom || ''} ${current.nom || ''}`.trim() || 'Modifier le contact' : 'Ajouter un contact'}
            fields={[
              { field: 'prenom',    label: 'Prénom' },
              { field: 'nom',       label: 'Nom' },
              { field: 'role',      label: 'Rôle / Fonction' },
              { field: 'email',     label: 'Email' },
              { field: 'telephone', label: 'Téléphone' },
            ]}
            values={current}
            isSaving={updateClient.isPending}
            onSave={(next) => {
              let updated: any[]
              if (isEditing) {
                updated = parsed.map((c, i) => i === editingContactIdx ? { ...c, ...next } : c)
              } else {
                updated = [...parsed, next]
              }
              updateClient.mutate(
                { id, data: { contacts: updated } as any },
                { onSuccess: () => { setEditingCard(null); setEditingContactIdx(null) } }
              )
            }}
            onClose={() => { setEditingCard(null); setEditingContactIdx(null) }}
            extraAction={isEditing ? {
              label: 'Supprimer',
              variant: 'danger',
              onClick: () => {
                if (!confirm('Supprimer ce contact ?')) return
                const updated = parsed.filter((_, i) => i !== editingContactIdx)
                updateClient.mutate(
                  { id, data: { contacts: updated } as any },
                  { onSuccess: () => { setEditingCard(null); setEditingContactIdx(null) } }
                )
              },
            } : undefined}
          />
        )
      })()}

      {/* v1.9.127 — Modal Nouvelle commande inline (entreprise pré-sélectionnée) */}
      {editingCard === 'new-commande' && (
        <CardEditModal
          title={`Nouvelle commande — ${client.nom_entreprise}`}
          fields={[
            { field: 'titre',           label: 'Titre du poste *' },
            { field: 'nb_postes',       label: 'Nombre de postes' },
            { field: 'date_debut',      label: 'Date de début (JJ/MM/AAAA)' },
            { field: 'duree',           label: 'Durée (ex: 3 mois, CDI)' },
            { field: 'localisation',    label: 'Localisation' },
            { field: 'competences',     label: 'Compétences requises (séparées par virgule)' },
            { field: 'description',     label: 'Description', multiline: true },
            { field: 'notes_internes',  label: 'Notes internes', multiline: true },
          ]}
          values={{ nb_postes: '1' }}
          isSaving={false}
          onSave={async (next) => {
            try {
              const res = await fetch('/api/offres', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  titre: next.titre,
                  client_id: client.id,
                  client_nom: client.nom_entreprise,
                  nombre_postes: parseInt(next.nb_postes || '1', 10) || 1,
                  date_debut: next.date_debut,
                  duree_mission: next.duree,
                  localisation: next.localisation,
                  competences: (next.competences || '').split(',').map((s: string) => s.trim()).filter(Boolean),
                  description: next.description,
                  notes_internes: next.notes_internes,
                  statut: 'active',
                }),
              })
              if (!res.ok) throw new Error('Erreur création')
              setEditingCard(null)
              router.push('/offres')
            } catch (e) {
              console.error(e)
              toast.error('Erreur lors de la création de la commande')
            }
          }}
          onClose={() => setEditingCard(null)}
        />
      )}

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

      {/* v1.9.114 — Personnes de contact — v1.9.127 cachée car remplacée par la card Contacts V2 ci-dessus.
          Conservée dans le DOM pour préserver l'édition complète (modal CardEditModal etc.) */}
      <div style={{ display: 'none' }}>
        <ContactsEditor
          contacts={(typeof client.contacts === 'string' ? JSON.parse(client.contacts) : client.contacts) || []}
          onSave={(next) => updateClient.mutate({ id, data: { contacts: next } as any })}
          isSaving={updateClient.isPending}
        />
      </div>

      {/* v1.9.116 — Notes (bouton "Modifier" → modal multi-champ comme Contact/Adresse) */}
      {/* v2.1.15 — Boîte Notes en bas SUPPRIMÉE (déplacée en bouton header avec tooltip mouseover + modal). */}
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

      {/* v2.1.16 — Section Secteurs d'activité DÉPLACÉE tout en bas (après la Map) */}

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
            display: 'none',  /* v1.9.127 — section RC retirée : intégrée dans card Informations (ligne IDE/RC) */
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

      {/* v1.9.127 — Date création déplacée dans le sous-titre du header */}

      {/* v2.1.15 — Map Leaflet en bas avec marker du client (lat/lng géocodés) */}
      {(() => {
        const lat = (client as any).latitude as number | null
        const lng = (client as any).longitude as number | null
        if (!lat || !lng) return null
        return (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '20px 22px', marginBottom: 20,
          }}>
            <h3 style={{
              fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 14px',
              textTransform: 'uppercase', letterSpacing: 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <MapPin size={14} />
              Localisation
            </h3>
            <ClientFicheMap
              latitude={lat}
              longitude={lng}
              nom={client.nom_entreprise || ''}
              adresse={client.adresse}
              ville={client.ville}
              npa={client.npa}
              height={340}
            />
          </div>
        )
      })()}

      {/* v2.1.16 — Secteurs d'activité TOUT EN BAS (après Map) — demande João */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
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
          {SECTEURS_LIST.map(s => {
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
