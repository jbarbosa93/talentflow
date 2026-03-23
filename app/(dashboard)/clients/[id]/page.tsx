'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Globe,
  Pencil, Trash2, X, Check, FileText, Loader2,
  Briefcase, MessageSquare, Users, Smartphone, User, Activity,
} from 'lucide-react'
import { useClient, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { toast } from 'sonner'
import ActivityHistory from '@/components/ActivityHistory'

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {multiline ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={4}
              autoFocus
              style={{
                flex: 1, padding: '8px 12px',
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
                flex: 1, height: 38, padding: '0 12px',
                border: '2px solid var(--primary)', borderRadius: 8,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}
          <button onClick={() => { onSave(field, draft); setEditing(false) }}
            className="neo-btn-yellow"
            style={{ width: 34, height: 34, padding: 0, flexShrink: 0 }}>
            <Check size={14} strokeWidth={3} />
          </button>
          <button onClick={() => { setDraft(value || ''); setEditing(false) }} style={{
            width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--border)',
            background: 'var(--card)', color: 'var(--muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <X size={14} />
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
      {icon && <span style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0 }}>{icon}</span>}
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

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: client, isLoading } = useClient(id)
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()
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
        {/* Big avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: 16, flexShrink: 0,
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 800, color: 'var(--ink)',
          border: '3px solid var(--foreground)',
          boxShadow: '4px 4px 0 var(--foreground)',
        }}>
          {(client.nom_entreprise?.[0] || '?').toUpperCase()}
        </div>

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
            {client.secteur && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 6,
                background: 'var(--primary-soft)', border: '1px solid var(--primary)',
                fontSize: 11, fontWeight: 700, color: 'var(--foreground)',
              }}>
                <Briefcase size={10} />
                {client.secteur}
              </span>
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

      {/* Secteur */}
      <div style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Activite
        </h3>
        <EditableField
          label="Secteur" field="secteur" value={client.secteur}
          icon={<Briefcase size={14} />} onSave={handleSave}
        />
      </div>

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

      {/* Contacts clients */}
      {(() => {
        const contacts = typeof client.contacts === 'string' ? JSON.parse(client.contacts) : (client.contacts || [])
        if (!contacts || contacts.length === 0) return null
        return (
          <div style={{
            background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
            padding: '20px 22px', marginBottom: 20,
          }}>
            <h3 style={{
              fontSize: 13, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 16px',
              textTransform: 'uppercase', letterSpacing: 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Users size={14} />
              Personnes de contact ({contacts.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: contacts.length === 1 ? '1fr' : '1fr 1fr', gap: 12 }}>
              {contacts.map((c: any, i: number) => (
                <div key={i} style={{
                  background: 'var(--secondary)', border: '1.5px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: 'var(--ink)', flexShrink: 0,
                    }}>
                      {((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase() || <User size={14} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                        {[c.titre, c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'}
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
              ))}
            </div>
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

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
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
              <Trash2 size={22} color="#EF4444" />
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
        </div>
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
