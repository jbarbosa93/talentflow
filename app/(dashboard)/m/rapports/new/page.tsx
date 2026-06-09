'use client'
// TalentFlow Mobile /m/rapports/new — Créer un lien rapport (accès app candidat)
// Hors bureau : envoyer un nouveau lien/accès rapport à un candidat, rattaché à une entreprise.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Check, Loader2, Building2 } from 'lucide-react'
import MHeader from '../../_components/MHeader'
import MAvatar from '../../_components/MAvatar'

interface CandidatRow { id: string; nom?: string | null; prenom?: string | null; photo_url?: string | null; titre_poste?: string | null }
interface ClientRow { id: string; nom_entreprise?: string | null; ville?: string | null; email?: string | null }
interface Template { id: string; name?: string | null; kind?: string | null }

export default function MobileRapportNewPage() {
  const router = useRouter()
  const qc = useQueryClient()

  // Candidat
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [candidat, setCandidat] = useState<CandidatRow | null>(null)
  // Entreprise (recherche)
  const [cSearch, setCSearch] = useState('')
  const [cDebounced, setCDebounced] = useState('')
  const [client, setClient] = useState<ClientRow | null>(null)
  // Template + contact client
  const [templateId, setTemplateId] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { const t = setTimeout(() => setCDebounced(cSearch.trim()), 300); return () => clearTimeout(t) }, [cSearch])

  const { data: candData } = useQuery<{ candidats: CandidatRow[] }>({
    queryKey: ['m', 'rapport-new-cand', debounced],
    queryFn: async () => {
      if (!debounced) return { candidats: [] }
      const r = await fetch(`/api/candidats?per_page=15&page=1&search=${encodeURIComponent(debounced)}`, { credentials: 'include' })
      if (!r.ok) return { candidats: [] }
      return r.json()
    },
    enabled: !!debounced && !candidat,
    staleTime: 30_000,
  })

  const { data: clientData } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['m', 'rapport-new-client', cDebounced],
    queryFn: async () => {
      if (!cDebounced) return { clients: [] }
      const r = await fetch(`/api/clients?per_page=15&page=1&search=${encodeURIComponent(cDebounced)}`, { credentials: 'include' })
      if (!r.ok) return { clients: [] }
      return r.json()
    },
    enabled: !!cDebounced && !client,
    staleTime: 30_000,
  })

  const { data: tplData } = useQuery<{ templates: Template[] }>({
    queryKey: ['m', 'report-templates'],
    queryFn: async () => {
      const r = await fetch('/api/sign/templates', { credentials: 'include' })
      if (!r.ok) return { templates: [] }
      return r.json()
    },
    staleTime: 5 * 60_000,
  })

  const reportTemplates = (tplData?.templates || []).filter((t) => t.kind === 'report')
  useEffect(() => { if (!templateId && reportTemplates.length > 0) setTemplateId(reportTemplates[0].id) }, [reportTemplates, templateId])

  const candFullName = (c: CandidatRow) => `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Sans nom'
  const candInitials = (c: CandidatRow) => ((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase() || '?'

  function pickClient(cl: ClientRow) {
    setClient(cl)
    if (cl.email && !clientEmail) setClientEmail(cl.email)
  }

  async function create() {
    if (!candidat) { setError('Choisis un candidat'); return }
    if (!templateId) { setError('Choisis un modèle de rapport'); return }
    setCreating(true); setError('')
    try {
      const entName = client?.nom_entreprise?.trim() || ''
      const title = entName ? `${candFullName(candidat)} — ${entName}` : candFullName(candidat)
      const payload: Record<string, unknown> = {
        title,
        template_id: templateId,
        candidat_id: candidat.id,
        candidat_name: candFullName(candidat),
        delivery_channel: 'link',
      }
      if (client) { payload.client_id = client.id; payload.client_name = entName }
      if (clientEmail.trim()) payload.client_email = clientEmail.trim()
      if (clientContact.trim()) payload.client_contact_name = clientContact.trim()
      const r = await fetch('/api/admin/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Échec de la création') }
      const j = await r.json().catch(() => ({}))
      qc.invalidateQueries({ queryKey: ['m', 'reports'] })
      const id = j?.link?.id || j?.id
      router.replace(id ? `/m/rapports/${id}` : '/m/rapports')
    } catch (e: any) {
      setError(e.message || 'Erreur'); setCreating(false)
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--m-text-soft, #6b6657)', margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 16, border: '1px solid var(--m-border, #e7e5df)', background: '#fff', color: 'inherit' }

  return (
    <>
      <MHeader title="Nouveau rapport" back="/m/rapports" />
      <div className="m-content">
        {/* CANDIDAT */}
        <div style={labelStyle}>Candidat *</div>
        {candidat ? (
          <div className="m-card" style={{ alignItems: 'center' }}>
            <MAvatar src={candidat.photo_url} initials={candInitials(candidat)} alt={candFullName(candidat)} />
            <div className="m-card-body">
              <div className="m-card-title">{candFullName(candidat)}</div>
              <div className="m-card-sub">{candidat.titre_poste || '—'}</div>
            </div>
            <button onClick={() => { setCandidat(null); setSearch('') }} className="m-btn secondary" style={{ fontSize: 12, marginLeft: 8 }}>Changer</button>
          </div>
        ) : (
          <>
            <div className="m-search">
              <Search size={18} />
              <input type="search" placeholder="Rechercher un candidat..." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
            {(candData?.candidats || []).map((c) => (
              <button key={c.id} className="m-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCandidat(c)}>
                <MAvatar src={c.photo_url} initials={candInitials(c)} alt={candFullName(c)} />
                <div className="m-card-body">
                  <div className="m-card-title">{candFullName(c)}</div>
                  <div className="m-card-sub">{c.titre_poste || '—'}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* ENTREPRISE (recherche) */}
        <div style={labelStyle}>Entreprise (optionnel)</div>
        {client ? (
          <div className="m-card" style={{ alignItems: 'center' }}>
            <div className="m-avatar"><Building2 size={20} /></div>
            <div className="m-card-body">
              <div className="m-card-title">{client.nom_entreprise}</div>
              <div className="m-card-sub">{client.ville || '—'}</div>
            </div>
            <button onClick={() => { setClient(null); setCSearch('') }} className="m-btn secondary" style={{ fontSize: 12, marginLeft: 8 }}>Changer</button>
          </div>
        ) : (
          <>
            <div className="m-search">
              <Search size={18} />
              <input type="search" placeholder="Rechercher une entreprise..." value={cSearch} onChange={(e) => setCSearch(e.target.value)} autoComplete="off" />
            </div>
            {(clientData?.clients || []).map((cl) => (
              <button key={cl.id} className="m-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => pickClient(cl)}>
                <div className="m-avatar"><Building2 size={20} /></div>
                <div className="m-card-body">
                  <div className="m-card-title">{cl.nom_entreprise || 'Sans nom'}</div>
                  <div className="m-card-sub">{cl.ville || '—'}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* Email du client qui valide (chef de chantier / RH) */}
        <div style={labelStyle}>Email du client (validation)</div>
        <input style={inputStyle} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="rh@entreprise.ch" autoCapitalize="off" />

        <div style={labelStyle}>Contact client (optionnel)</div>
        <input style={inputStyle} value={clientContact} onChange={(e) => setClientContact(e.target.value)} placeholder="Nom du responsable" />

        {/* Modèle */}
        <div style={labelStyle}>Modèle de rapport</div>
        <select style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {reportTemplates.length === 0 && <option value="">Aucun modèle rapport</option>}
          {reportTemplates.map((t) => <option key={t.id} value={t.id}>{t.name || 'Modèle'}</option>)}
        </select>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <button onClick={create} disabled={creating || !candidat} className="m-btn primary full" style={{ marginTop: 22, opacity: (creating || !candidat) ? 0.6 : 1 }}>
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {creating ? 'Création...' : 'Créer le lien rapport'}
        </button>
      </div>
    </>
  )
}
