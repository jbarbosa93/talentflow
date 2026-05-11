// TalentFlow Rapports — Section "Entreprises autorisées" (dashboard détail lien)
// v2.4.0 — Phase 1 multi-entreprise
// v2.4.3 — Refonte : format tableau + modal édition + auto-create depuis legacy
//
// Affiche TOUJOURS au moins 1 entreprise (auto-création depuis link.client_* si vide).
// Format colonnes : Nom entreprise / Nom contact / Email / [⋮ Modifier / Supprimer].
// Modal centré au clic sur Modifier (3 champs : nom entreprise, nom contact, email).
// La modification s'applique aux soumissions FUTURES (les emails envoyés restent).
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Trash2, Plus, Mail, User, Loader2, Pencil, X as XIcon, Check, Phone, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import type { ReportLinkClient } from '@/lib/report/types'
import ClientContactAutocomplete, { type ClientContactPick } from './ClientContactAutocomplete'

interface Props {
  linkId: string
  /** Coords legacy du lien (link.client_*) — pour auto-create si liste vide */
  fallbackClient?: {
    client_name?: string | null
    client_email?: string | null
    client_contact_name?: string | null
    client_phone?: string | null
  } | null
}

interface FormState {
  client_name: string
  client_contact_name: string
  client_email: string
  client_id: string | null
  /** v2.4.8 — true si l'entreprise est liée à un client existant en DB (autocomplete) */
  isLinked: boolean
  /** v2.6.1 — Mission fields (responsable terrain) */
  mission_contact_name: string
  mission_phone: string
  mission_start_date: string  // YYYY-MM-DD ou ''
  mission_end_date: string    // YYYY-MM-DD ou ''
}

const EMPTY_FORM: FormState = {
  client_name: '', client_contact_name: '', client_email: '',
  client_id: null, isLinked: false,
  mission_contact_name: '', mission_phone: '',
  mission_start_date: '', mission_end_date: '',
}

export default function LinkClientsSection({ linkId, fallbackClient }: Props) {
  const [clients, setClients] = useState<ReportLinkClient[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /** Modal mode : null = fermé, 'create' = ajout, ReportLinkClient = édition de cette row */
  const [modal, setModal] = useState<null | 'create' | ReportLinkClient>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const fetchList = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/reports/${linkId}/clients`)
      const d = await r.json()
      if (r.ok) {
        const list = (d.clients || []) as ReportLinkClient[]
        // v2.4.3 — Auto-create silencieuse depuis legacy si vide et fallback dispo
        if (list.length === 0 && fallbackClient?.client_name) {
          await fetch(`/api/admin/reports/${linkId}/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: fallbackClient.client_name,
              client_email: fallbackClient.client_email || null,
              client_contact_name: fallbackClient.client_contact_name || null,
              client_phone: fallbackClient.client_phone || null,
              display_order: 0,
            }),
          })
          const r2 = await fetch(`/api/admin/reports/${linkId}/clients`)
          const d2 = await r2.json()
          if (r2.ok) setClients((d2.clients || []) as ReportLinkClient[])
          else setClients([])
        } else {
          setClients(list)
        }
      }
    } catch {
      toast.error('Erreur chargement entreprises')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [linkId])  // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setModal('create')
  }
  const openEdit = (c: ReportLinkClient) => {
    setForm({
      client_name: c.client_name || '',
      client_contact_name: c.client_contact_name || '',
      client_email: c.client_email || '',
      client_id: c.client_id || null,
      isLinked: !!c.client_id,
      mission_contact_name: c.mission_contact_name || '',
      mission_phone: c.mission_phone || '',
      mission_start_date: c.mission_start_date || '',
      mission_end_date: c.mission_end_date || '',
    })
    setModal(c)
  }
  const closeModal = () => {
    if (busy) return
    setModal(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async () => {
    if (!form.client_name.trim()) {
      toast.error('Nom de l\'entreprise requis')
      return
    }
    // v2.4.7 — Capture du modal courant pour éviter les races avec setModal
    const currentModal = modal
    if (!currentModal) {
      toast.error('Modal fermée prématurément')
      return
    }
    setBusy(true)
    try {
      const isEdit = currentModal !== 'create'
      const editingId = isEdit ? currentModal.id : null
      const payload: Record<string, unknown> = {
        client_name: form.client_name.trim(),
        client_contact_name: form.client_contact_name.trim() || null,
        client_email: form.client_email.trim().toLowerCase() || null,
        mission_contact_name: form.mission_contact_name.trim() || null,
        mission_phone: form.mission_phone.trim() || null,
        mission_start_date: form.mission_start_date || null,
        mission_end_date: form.mission_end_date || null,
      }
      // Validation côté UI (le serveur revalide aussi)
      if (form.mission_start_date && form.mission_end_date && form.mission_end_date < form.mission_start_date) {
        toast.error('La date de fin doit être ≥ date de début')
        setBusy(false)
        return
      }
      // v2.4.8 — Persiste client_id si l'entreprise vient de la DB clients (autocomplete)
      if (!isEdit) {
        payload.display_order = clients.length
        if (form.client_id) payload.client_id = form.client_id
      }

      const url = isEdit
        ? `/api/admin/reports/${linkId}/clients/${editingId}`
        : `/api/admin/reports/${linkId}/clients`
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        console.error('[LinkClientsSection] save error', { status: r.status, body: d })
        throw new Error(d.error || `Erreur ${r.status}`)
      }
      // Refresh
      if (isEdit && editingId) {
        setClients(prev => prev.map(c => c.id === editingId ? (d.client || c) : c))
      } else {
        setClients(prev => [...prev, d.client])
      }
      toast.success(isEdit ? 'Entreprise modifiée' : 'Entreprise ajoutée')
      setModal(null)
      setForm(EMPTY_FORM)
    } catch (e: any) {
      console.error('[LinkClientsSection] save exception', e)
      toast.error(e?.message || 'Erreur enregistrement')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (clientId: string, name: string) => {
    if (!confirm(`Supprimer l'entreprise "${name}" de ce lien ?\n\nLes rapports déjà envoyés ne sont pas affectés.`)) return
    try {
      const r = await fetch(`/api/admin/reports/${linkId}/clients/${clientId}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur suppression')
      }
      setClients(prev => prev.filter(c => c.id !== clientId))
      toast.success('Entreprise supprimée')
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    }
  }

  return (
    <section>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--muted)', margin: 0,
        }}>
          Entreprises autorisées
        </h2>
        <button
          type="button"
          onClick={openCreate}
          className="neo-btn-ghost neo-btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div style={{
          padding: 18,
          background: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          fontSize: 13, color: 'var(--muted)',
          textAlign: 'center',
        }}>
          Aucune entreprise. Cliquez « Ajouter » pour configurer le premier destinataire.
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--card)',
        }}>
          {/* Header colonnes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1.2fr 1.6fr 80px',
            gap: 12,
            padding: '10px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--muted)',
          }}>
            <span>Nom entreprise</span>
            <span>Nom client</span>
            <span>Email client</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {clients.map((c, idx) => (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1.2fr 1.6fr 80px',
                gap: 12,
                padding: '12px 16px',
                alignItems: 'center',
                borderBottom: idx < clients.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Building2 size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ color: 'var(--foreground)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.client_name}
                </span>
              </div>
              <span style={{ color: c.client_contact_name ? 'var(--foreground)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.client_contact_name || '—'}
              </span>
              <span style={{ color: c.client_email ? 'var(--foreground)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.client_email || '—'}
              </span>
              <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  title="Modifier"
                  style={iconBtnStyle('var(--foreground)')}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id, c.client_name)}
                  title="Supprimer"
                  style={iconBtnStyle('#DC2626')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal édition / création — centré */}
      {modal !== null && typeof window !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px, 95vw)',
              maxHeight: '90vh', overflow: 'auto',
              background: 'var(--card)',
              borderRadius: 16, border: '1px solid var(--border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
              padding: '22px 24px 20px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{
                  margin: 0,
                  fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                  fontSize: 22, fontWeight: 400, color: 'var(--foreground)',
                  letterSpacing: '-0.01em', lineHeight: 1.15,
                }}>
                  {modal === 'create' ? 'Ajouter une entreprise' : 'Modifier l’entreprise'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
                  Le client reçoit toujours par email. Le candidat peut aussi envoyer par WhatsApp depuis son téléphone.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                aria-label="Fermer"
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--foreground)',
                  flexShrink: 0,
                }}
              >
                <XIcon size={15} />
              </button>
            </div>

            <FormField label="Nom de l'entreprise *">
              {/* v2.4.8 — Autocomplete depuis la DB clients (même pattern que /sign/rapports/new).
                  Au clic sur une suggestion : pré-remplit nom + contact + email + client_id.
                  Tape directement un nom non-DB → saisie manuelle libre. */}
              <ClientContactAutocomplete
                value={form.client_name}
                isLinked={form.isLinked}
                placeholder="Recherche entreprise ou saisie manuelle…"
                onChange={(name, pick) => {
                  if (pick) {
                    // Sélection dans le dropdown : remplit nom + contact + email + client_id
                    // v2.6.1 : préserve les éventuelles infos mission déjà saisies
                    setForm(prev => ({
                      ...prev,
                      client_name: pick.clientName,
                      client_contact_name: pick.contactName || '',
                      client_email: pick.contactEmail || '',
                      client_id: pick.clientId,
                      isLinked: true,
                    }))
                  } else {
                    // Saisie libre — pas de lien DB
                    setForm(prev => ({ ...prev, client_name: name }))
                  }
                }}
                onUnlink={() => setForm(prev => ({
                  ...prev,
                  client_id: null,
                  isLinked: false,
                }))}
              />
            </FormField>
            <FormField label="Nom du contact">
              <input
                type="text"
                value={form.client_contact_name}
                onChange={(e) => setForm({ ...form, client_contact_name: e.target.value })}
                placeholder="Ex : Sébastien D'Agostino"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Email du contact">
              <input
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                placeholder="Ex : sd@metabader.ch"
                style={inputStyle}
              />
            </FormField>

            {/* v2.6.1 — Section Mission (séparée visuellement) */}
            <div style={{
              marginTop: 6, paddingTop: 14,
              borderTop: '1px dashed var(--border)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'var(--muted)',
              }}>
                Mission (affiché côté candidat)
              </div>
              <FormField label="Responsable de mission (terrain)">
                <input
                  type="text"
                  value={form.mission_contact_name}
                  onChange={(e) => setForm({ ...form, mission_contact_name: e.target.value })}
                  placeholder="Ex : Pedro Silva (chef de chantier)"
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Téléphone du responsable">
                <input
                  type="tel"
                  value={form.mission_phone}
                  onChange={(e) => setForm({ ...form, mission_phone: e.target.value })}
                  placeholder="Ex : +41 79 123 45 67"
                  style={inputStyle}
                />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FormField label="Début mission">
                  <input
                    type="date"
                    value={form.mission_start_date}
                    onChange={(e) => setForm({ ...form, mission_start_date: e.target.value })}
                    max={form.mission_end_date || undefined}
                    style={inputStyle}
                  />
                </FormField>
                <FormField label="Fin mission">
                  <input
                    type="date"
                    value={form.mission_end_date}
                    onChange={(e) => setForm({ ...form, mission_end_date: e.target.value })}
                    min={form.mission_start_date || undefined}
                    style={inputStyle}
                  />
                </FormField>
              </div>
            </div>

            {modal !== 'create' && (
              <div style={{
                padding: '8px 10px',
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: 8,
                fontSize: 11.5, color: '#92400E', lineHeight: 1.5,
              }}>
                💡 La modification s'applique aux <strong>futures soumissions</strong> seulement. Les rapports déjà envoyés ne sont pas affectés.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="neo-btn-ghost neo-btn-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !form.client_name.trim()}
                className="neo-btn neo-btn-sm"
                style={{
                  background: '#EAB308', color: '#1C1A14', border: '1px solid #1C1A14',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                {!busy && <Check size={12} />}
                {modal === 'create' ? 'Ajouter' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13.5,
  fontFamily: 'inherit',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--foreground)',
  boxSizing: 'border-box',
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent',
    border: '1px solid var(--border)',
    color,
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
}
