'use client'
// TalentFlow Mobile /m/clients/[id] — Détail entreprise + édition
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Phone, Mail, Globe, FileText, Pencil, X, User } from 'lucide-react'
import MHeader from '../../_components/MHeader'
import MContactActions from '../../_components/MContactActions'
import MClientForm, { ClientFormValues } from '../../_components/MClientForm'

interface Contact {
  prenom?: string; nom?: string; fonction?: string; email?: string; telephone?: string
}
interface Client {
  id: string
  nom_entreprise?: string | null
  adresse?: string | null
  npa?: string | null
  ville?: string | null
  canton?: string | null
  telephone?: string | null
  email?: string | null
  site_web?: string | null
  notes?: string | null
  contacts?: Contact[] | string | null
}

function parseContacts(c: Client['contacts']): Contact[] {
  if (!c) return []
  if (Array.isArray(c)) return c
  try { const p = JSON.parse(c as string); return Array.isArray(p) ? p : [] } catch { return [] }
}

export default function MobileClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data, isLoading } = useQuery<{ client: Client }>({
    queryKey: ['m', 'client', id],
    queryFn: async () => {
      const r = await fetch(`/api/clients/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error('not_found')
      return r.json()
    },
  })

  const cl = data?.client

  if (isLoading) {
    return (<><MHeader title="Entreprise" back="/m/clients" /><div className="m-loading">Chargement...</div></>)
  }
  if (!cl) {
    return (<><MHeader title="Entreprise" back="/m/clients" /><div className="m-empty"><div className="m-empty-emoji">😕</div><div>Entreprise introuvable</div></div></>)
  }

  const loc = [cl.adresse, [cl.npa, cl.ville].filter(Boolean).join(' '), cl.canton].filter(Boolean).join(', ')
  const contacts = parseContacts(cl.contacts)

  async function save(values: ClientFormValues) {
    const payload = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v as string).trim() || null]))
    const r = await fetch(`/api/clients/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(payload),
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Échec') }
    qc.invalidateQueries({ queryKey: ['m', 'client', id] })
    qc.invalidateQueries({ queryKey: ['m', 'clients'] })
    setEditing(false)
  }

  return (
    <>
      <MHeader title={cl.nom_entreprise || 'Entreprise'} back="/m/clients" action={
        <button onClick={() => setEditing(true)} className="m-header-action" aria-label="Modifier">
          <Pencil size={15} /> Modifier
        </button>
      } />
      <div className="m-content">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <div className="m-avatar lg" style={{ width: 84, height: 84 }}><Building2 size={34} /></div>
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>{cl.nom_entreprise || 'Sans nom'}</div>
          {(cl.telephone || cl.email) && (
            <div style={{ marginTop: 12 }}>
              <MContactActions phone={cl.telephone} email={cl.email} size="lg" />
            </div>
          )}
        </div>

        <div className="m-section-title">Coordonnées</div>
        <div className="m-info-list">
          {loc && (
            <div className="m-info-row">
              <MapPin size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-info-label">Adresse</div>
                <div className="m-info-val" style={{ whiteSpace: 'normal' }}>{loc}</div>
              </div>
            </div>
          )}
          {cl.telephone && (
            <a href={`tel:${cl.telephone}`} className="m-info-row">
              <Phone size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Téléphone</div><div className="m-info-val">{cl.telephone}</div></div>
            </a>
          )}
          {cl.email && (
            <a href={`mailto:${cl.email}`} className="m-info-row">
              <Mail size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Email</div><div className="m-info-val">{cl.email}</div></div>
            </a>
          )}
          {cl.site_web && (
            <a href={cl.site_web.startsWith('http') ? cl.site_web : `https://${cl.site_web}`} target="_blank" rel="noopener noreferrer" className="m-info-row">
              <Globe size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Site web</div><div className="m-info-val">{cl.site_web}</div></div>
            </a>
          )}
        </div>

        {contacts.length > 0 && (
          <>
            <div className="m-section-title">Contacts ({contacts.length})</div>
            <div className="m-info-list">
              {contacts.map((ct, i) => {
                const name = [ct.prenom, ct.nom].filter(Boolean).join(' ') || 'Contact'
                return (
                  <div key={i} className="m-info-row">
                    <User size={18} className="m-info-icon" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="m-info-val">{name}{ct.fonction ? ` — ${ct.fonction}` : ''}</div>
                      <div className="m-info-label">{[ct.telephone, ct.email].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <MContactActions phone={ct.telephone} email={ct.email} size="sm" />
                  </div>
                )
              })}
            </div>
          </>
        )}

        {cl.notes && (
          <>
            <div className="m-section-title">Notes</div>
            <div className="m-info-list">
              <div className="m-info-row">
                <FileText size={18} className="m-info-icon" />
                <div className="m-info-val" style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{cl.notes}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }} onClick={() => setEditing(false)} />
          <div style={{
            background: 'var(--m-bg, #FAFAF7)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 20px)', overflowY: 'auto',
            padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Modifier l'entreprise</div>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', padding: 6 }} aria-label="Fermer"><X size={22} /></button>
            </div>
            <MClientForm initial={cl as Partial<ClientFormValues>} submitLabel="Enregistrer" onSubmit={save} />
          </div>
        </div>
      )}
    </>
  )
}
