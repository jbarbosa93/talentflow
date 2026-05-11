// TalentFlow Rapports — Section "Entreprises autorisées" (dashboard détail lien)
// v2.4.0 — Phase 1 multi-entreprise
//
// Liste les entreprises associées au lien + permet d'ajouter/supprimer.
// Réutilise ClientContactAutocomplete existant pour le lookup clients DB,
// avec fallback saisie manuelle (entreprise pas encore dans la DB clients).
'use client'

import { useEffect, useState } from 'react'
import { Building2, Trash2, Plus, Phone, Mail, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ReportLinkClient } from '@/lib/report/types'

interface Props {
  linkId: string
}

export default function LinkClientsSection({ linkId }: Props) {
  const [clients, setClients] = useState<ReportLinkClient[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    client_name: '',
    client_contact_name: '',
    client_email: '',
    client_phone: '',
  })

  const fetchList = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/reports/${linkId}/clients`)
      const d = await r.json()
      if (r.ok) setClients(d.clients || [])
    } catch {
      toast.error('Erreur chargement entreprises')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [linkId])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    if (!form.client_name.trim()) {
      toast.error('Nom de l\'entreprise requis')
      return
    }
    setAdding(true)
    try {
      const r = await fetch(`/api/admin/reports/${linkId}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          display_order: clients.length,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur ajout')
      setClients(prev => [...prev, d.client])
      setForm({ client_name: '', client_contact_name: '', client_email: '', client_phone: '' })
      setShowForm(false)
      toast.success('Entreprise ajoutée')
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (clientId: string, name: string) => {
    if (!confirm(`Supprimer l'entreprise "${name}" de ce lien ?`)) return
    try {
      const r = await fetch(`/api/admin/reports/${linkId}/clients/${clientId}`, {
        method: 'DELETE',
      })
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
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="neo-btn-ghost neo-btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={13} /> Ajouter
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <>
          {clients.length === 0 && !showForm && (
            <div style={{
              padding: 18,
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 10,
              fontSize: 13, color: 'var(--muted)',
              textAlign: 'center',
            }}>
              Aucune entreprise configurée. Le candidat utilise les coords du lien (legacy).
            </div>
          )}

          {clients.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clients.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 12,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                  }}
                >
                  <div style={{
                    flexShrink: 0,
                    width: 36, height: 36, borderRadius: 8,
                    background: 'var(--surface)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--muted)',
                  }}>
                    <Building2 size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
                      {c.client_name}
                    </div>
                    <div style={{
                      marginTop: 4,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      fontSize: 12, color: 'var(--muted)',
                    }}>
                      {c.client_contact_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <User size={11} /> {c.client_contact_name}
                        </span>
                      )}
                      {c.client_email && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Mail size={11} /> {c.client_email}
                        </span>
                      )}
                      {c.client_phone && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Phone size={11} /> {c.client_phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id, c.client_name)}
                    title="Supprimer"
                    style={{
                      flexShrink: 0,
                      width: 32, height: 32, borderRadius: 8,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: '#DC2626',
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div style={{
              marginTop: 10,
              padding: 14,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>
                Ajouter une entreprise
              </div>
              <input
                type="text"
                placeholder="Nom de l'entreprise *"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Nom du contact (ex: Emilie Herren)"
                value={form.client_contact_name}
                onChange={(e) => setForm({ ...form, client_contact_name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="email"
                placeholder="Email *"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                style={inputStyle}
              />
              <input
                type="tel"
                placeholder="Téléphone WhatsApp (+41 78...)"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45, marginTop: -4 }}>
                Si <strong>Téléphone WhatsApp</strong> est renseigné, le candidat pourra envoyer le rapport
                par WhatsApp directement depuis son lien.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm({ client_name: '', client_contact_name: '', client_email: '', client_phone: '' }) }}
                  disabled={adding}
                  className="neo-btn-ghost neo-btn-sm"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || !form.client_name.trim()}
                  className="neo-btn neo-btn-sm"
                  style={{ background: '#EAB308', color: '#1C1A14', border: '1px solid #1C1A14' }}
                >
                  {adding && <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />}
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--foreground)',
  boxSizing: 'border-box',
}
