'use client'

// /sign/portails — Gestion des portails clients (lecture seule public)
// v2.7.0

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Plus, Copy, ExternalLink, Trash2, X, Loader2, Search, ShieldCheck,
  Check, Link as LinkIcon, Calendar,
} from 'lucide-react'

interface ClientPortal {
  id: string
  client_id: string
  client_name: string | null
  slug: string
  name: string
  is_active: boolean
  created_at: string
  last_accessed_at: string | null
}

export default function PortailsPage() {
  const [portals, setPortals] = useState<ClientPortal[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/client-portals', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      setPortals(d.portals || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const handleCopy = async (p: ClientPortal) => {
    const url = `${window.location.origin}/client-portal/${p.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(p.id)
      toast.success('Lien copié')
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  const handleToggleActive = async (p: ClientPortal) => {
    try {
      const r = await fetch(`/api/admin/client-portals/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !p.is_active }),
      })
      if (!r.ok) throw new Error('Erreur')
      setPortals(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x))
      toast.success(p.is_active ? 'Portail désactivé' : 'Portail réactivé')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/client-portals/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Erreur')
      setPortals(prev => prev.filter(x => x.id !== id))
      setConfirmDeleteId(null)
      toast.success('Portail supprimé')
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 32, fontWeight: 400, color: 'var(--foreground)',
            letterSpacing: '-0.01em',
          }}>
            Portails clients
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
            Liens publics lecture seule pour que tes clients voient les collaborateurs en mission + leurs documents.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={primaryBtn}
        >
          <Plus size={14} /> Créer un portail
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : portals.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', borderRadius: 12,
          background: 'var(--surface)', border: '1px dashed var(--border)',
          color: 'var(--muted-foreground)', fontSize: 14,
        }}>
          Aucun portail créé.<br/>
          <span style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
            Clique <strong>Créer un portail</strong> pour générer un lien partageable.
          </span>
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {portals.map(p => (
            <PortalRow
              key={p.id}
              portal={p}
              copied={copiedId === p.id}
              onCopy={() => handleCopy(p)}
              onToggleActive={() => handleToggleActive(p)}
              onDelete={() => setConfirmDeleteId(p.id)}
            />
          ))}
        </div>
      )}

      {/* Modal création */}
      {creating && (
        <CreatePortalModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load() }}
        />
      )}

      {/* Modal confirm delete */}
      {confirmDeleteId && (
        <ConfirmDeleteModal
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
        />
      )}
    </div>
  )
}

// ─── Portal Row ────────────────────────────────────────────────────────────────

function PortalRow({ portal: p, copied, onCopy, onToggleActive, onDelete }: {
  portal: ClientPortal
  copied: boolean
  onCopy: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const lastAccess = p.last_accessed_at
    ? new Date(p.last_accessed_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Jamais consulté'
  return (
    <div style={{
      padding: '16px 18px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: p.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
        color: p.is_active ? '#22C55E' : 'var(--muted-foreground)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <ShieldCheck size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
            {p.client_name || 'Client inconnu'}
          </span>
          {!p.is_active && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Désactivé
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
          {p.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <LinkIcon size={11} /> /client-portal/{p.slug.slice(0, 8)}…
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} /> {lastAccess}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button onClick={onCopy} style={actionBtn(copied ? '#22C55E' : undefined)}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier lien'}
        </button>
        <a href={`/client-portal/${p.slug}`} target="_blank" rel="noopener noreferrer" style={actionBtn()}>
          <ExternalLink size={12} /> Ouvrir
        </a>
        <button onClick={onToggleActive} style={actionBtn()}>
          {p.is_active ? 'Désactiver' : 'Réactiver'}
        </button>
        <button onClick={onDelete} style={actionBtn('var(--destructive)')}>
          <Trash2 size={12} /> Supprimer
        </button>
      </div>
    </div>
  )
}

// ─── Create Portal Modal ───────────────────────────────────────────────────────

interface ClientLite { id: string; nom_entreprise: string }

function CreatePortalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientLite[]>([])
  const [selected, setSelected] = useState<ClientLite | null>(null)
  const [name, setName] = useState('')
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/clients?search=${encodeURIComponent(query)}&per_page=8`)
        const d = await r.json()
        setResults((d.clients || []).map((c: any) => ({ id: c.id, nom_entreprise: c.nom_entreprise || '—' })))
      } finally {
        setSearching(false)
      }
    }, 280)
  }, [query])

  const handleSelect = (c: ClientLite) => {
    setSelected(c)
    setQuery(c.nom_entreprise)
    setResults([])
    if (!name) setName(`L-AGENCE SA — ${c.nom_entreprise}`)
  }

  const handleCreate = async () => {
    if (!selected) { toast.error('Sélectionne un client'); return }
    setCreating(true)
    try {
      const r = await fetch('/api/admin/client-portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selected.id, name: name.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Portail créé')
      onCreated()
    } catch (e: any) { toast.error(e.message) }
    finally { setCreating(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(540px, 95vw)', background: 'var(--card)', borderRadius: 16,
        border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{
            margin: 0, fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 22, fontWeight: 400, color: 'var(--foreground)',
          }}>Créer un portail client</h2>
          <button onClick={onClose} style={closeBtn}><X size={16} /></button>
        </div>

        <div>
          <label style={labelStyle}>Client *</label>
          <div style={{ position: 'relative' }}>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Rechercher un client…"
              style={{ ...inputStyle, paddingRight: 32 }}
            />
            {searching && <Loader2 size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />}
            {!searching && <Search size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />}
          </div>
          {results.length > 0 && !selected && (
            <div style={{
              marginTop: 4, border: '1px solid var(--border)', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto', background: 'var(--card)',
            }}>
              {results.map(c => (
                <button key={c.id} onClick={() => handleSelect(c)} style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--foreground)',
                  fontFamily: 'inherit',
                }}>{c.nom_entreprise}</button>
              ))}
            </div>
          )}
          {selected && (
            <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>✓ Client sélectionné</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Nom du portail (visible côté client)</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 200))}
            placeholder="Ex: L-AGENCE SA — METABADER SA"
            style={inputStyle}
            maxLength={200}
          />
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            Auto-rempli depuis le client. {name.length}/200
          </div>
        </div>

        <div style={{
          padding: 12, borderRadius: 10, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)',
          fontSize: 11.5, color: 'var(--foreground)', lineHeight: 1.55,
        }}>
          <strong>Lien généré :</strong> URL imprévisible 16 caractères (sécurité). Le client peut consulter
          les candidats en mission active chez lui + leurs documents (lecture seule). Tu peux désactiver le portail
          à tout moment.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={secondaryBtn} disabled={creating}>Annuler</button>
          <button onClick={handleCreate} style={primaryBtn} disabled={creating || !selected}>
            {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            Créer le portail
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Confirm Delete Modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return createPortal(
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9600,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(420px, 95vw)', background: 'var(--card)', borderRadius: 14,
        padding: 20, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 20, fontWeight: 400 }}>
          Supprimer ce portail ?
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
          Le lien deviendra invalide pour le client. Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={secondaryBtn}>Annuler</button>
          <button onClick={onConfirm} style={{ ...primaryBtn, background: 'var(--destructive)', borderColor: 'var(--destructive)', color: '#fff' }}>
            Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--secondary)', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 36, padding: '0 16px', borderRadius: 10,
  background: 'var(--primary)', border: '1.5px solid var(--primary)',
  color: '#1C1A14', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 10,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const closeBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--muted-foreground)',
}
function actionBtn(color?: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 30, padding: '0 10px', borderRadius: 7,
    background: 'transparent', border: '1px solid var(--border)',
    color: color || 'var(--foreground)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
  }
}
