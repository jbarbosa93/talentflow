'use client'
// v1.9.71 — Modal attaché à une commande : affiche les candidats liés + permet d'ajouter de nouveaux.
// - Liste des candidats déjà liés avec statut editable (a_envoyer / envoye) + date_envoi + retrait
// - Barre de recherche flexible (accents/casse insensibles, booléenne ET/OU/SAUF) pour ajouter des candidats
// - POST /api/offres-candidats pour lier, PATCH pour changer statut, DELETE pour retirer

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, X, Search, Loader2, Check, Plus, Trash2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { parseBooleanSearch, normalize } from '@/lib/boolean-search'
import { formatFullName, formatInitials } from '@/lib/format-candidat'

interface CandidatLight {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  email: string | null
  telephone: string | null
  photo_url: string | null
  localisation: string | null
  competences?: string[]
  tags?: string[]
}

interface LinkRow {
  id: string
  offre_id: string
  candidat_id: string
  statut: 'a_envoyer' | 'envoye'
  date_envoi: string | null
  user_id: string | null
  created_at: string
  candidats: CandidatLight | null
}

interface Props {
  offreId: string
  offreTitre: string
  onClose: () => void
}

export default function OffreCandidatsModal({ offreId, offreTitre, onClose }: Props) {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loadingLinks, setLoadingLinks] = useState(true)
  const [allCandidats, setAllCandidats] = useState<CandidatLight[]>([])
  const [loadingCandidats, setLoadingCandidats] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Set<string>>(new Set())

  const loadLinks = async () => {
    try {
      const res = await fetch(`/api/offres-candidats?offre_id=${offreId}`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLinks(data.links || [])
    } catch {
      toast.error('Erreur chargement candidats liés')
    } finally {
      setLoadingLinks(false)
    }
  }

  useEffect(() => {
    loadLinks()
    const loadCandidats = async () => {
      try {
        const res = await fetch('/api/candidats?per_page=2000&import_status=traite', { credentials: 'include' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        setAllCandidats(data.candidats || [])
      } catch {
        toast.error('Erreur chargement candidats')
      } finally {
        setLoadingCandidats(false)
      }
    }
    loadCandidats()
  }, [offreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const linkedIds = useMemo(() => new Set(links.map(l => l.candidat_id)), [links])

  const booleanMatcher = useMemo(() => parseBooleanSearch(search), [search])
  const q = useMemo(() => normalize(search), [search])

  const filteredCandidats = useMemo(() => {
    if (!search.trim()) return allCandidats.filter(c => !linkedIds.has(c.id)).slice(0, 50)
    const available = allCandidats.filter(c => !linkedIds.has(c.id))
    return available.filter(c => {
      const hay = `${c.prenom || ''} ${c.nom || ''} ${c.titre_poste || ''} ${c.email || ''} ${c.telephone || ''} ${c.localisation || ''} ${(c.competences || []).join(' ')} ${(c.tags || []).join(' ')}`
      if (booleanMatcher) return booleanMatcher(hay)
      return normalize(hay).includes(q)
    }).slice(0, 50)
  }, [allCandidats, search, linkedIds, booleanMatcher, q])

  const addCandidat = async (candidatId: string) => {
    setAdding(prev => new Set(prev).add(candidatId))
    try {
      const res = await fetch('/api/offres-candidats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ offre_id: offreId, candidat_ids: [candidatId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Candidat lié')
      await loadLinks()
    } catch {
      toast.error('Erreur liaison')
    } finally {
      setAdding(prev => { const next = new Set(prev); next.delete(candidatId); return next })
    }
  }

  const updateStatut = async (linkId: string, statut: 'a_envoyer' | 'envoye') => {
    // Optimistic
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, statut, date_envoi: statut === 'envoye' && !l.date_envoi ? new Date().toISOString().slice(0, 10) : l.date_envoi } : l))
    try {
      const body: any = { id: linkId, statut }
      if (statut === 'envoye') {
        const existing = links.find(l => l.id === linkId)
        if (!existing?.date_envoi) body.date_envoi = new Date().toISOString().slice(0, 10)
      }
      const res = await fetch('/api/offres-candidats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Erreur mise à jour')
      loadLinks()
    }
  }

  const updateDateEnvoi = async (linkId: string, dateStr: string) => {
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, date_envoi: dateStr || null } : l))
    try {
      const res = await fetch('/api/offres-candidats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: linkId, date_envoi: dateStr || null }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Erreur mise à jour date')
      loadLinks()
    }
  }

  const removeLink = async (linkId: string) => {
    if (!confirm('Retirer ce candidat de la commande ?')) return
    try {
      const res = await fetch(`/api/offres-candidats?id=${linkId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      toast.success('Candidat retiré')
      setLinks(prev => prev.filter(l => l.id !== linkId))
    } catch {
      toast.error('Erreur suppression')
    }
  }

  if (typeof document === 'undefined') return null

  const statutMeta: Record<'a_envoyer' | 'envoye', { label: string; color: string; bg: string }> = {
    a_envoyer: { label: 'À envoyer', color: 'var(--warning)', bg: 'var(--warning-soft)' },
    envoye:    { label: 'Envoyé',     color: 'var(--success)', bg: 'var(--success-soft)' },
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 16,
          width: '100%', maxWidth: 860, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Briefcase size={16} color="var(--primary-foreground)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offreTitre}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {links.length} candidat{links.length > 1 ? 's' : ''} lié{links.length > 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 22px' }}>

          {/* Section candidats liés */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Candidats liés ({links.length})
            </div>
            {loadingLinks ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
              </div>
            ) : links.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20, background: 'var(--secondary)', borderRadius: 10 }}>
                Aucun candidat lié à cette commande
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {links.map(l => {
                  const c = l.candidats
                  if (!c) return null
                  const meta = statutMeta[l.statut]
                  const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 12, fontWeight: 800, color: 'var(--foreground)' }}>
                        {hasPhoto ? (
                          <Image src={c.photo_url!} alt="" width={36} height={36} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          formatInitials(c.prenom, c.nom)
                        )}
                      </div>
                      <a
                        href={`/candidats/${c.id}?from=offres`}
                        style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatFullName(c.prenom, c.nom)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.titre_poste || 'Sans titre'}{c.localisation ? ` · ${c.localisation}` : ''}
                        </div>
                      </a>

                      {/* Statut toggle */}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {(['a_envoyer', 'envoye'] as const).map(s => {
                          const sMeta = statutMeta[s]
                          const active = l.statut === s
                          return (
                            <button
                              key={s}
                              onClick={() => updateStatut(l.id, s)}
                              style={{
                                padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                                border: `1px solid ${active ? sMeta.color : 'var(--border)'}`,
                                background: active ? sMeta.bg : 'var(--card)',
                                color: active ? sMeta.color : 'var(--muted-foreground)',
                                cursor: 'pointer', fontFamily: 'inherit',
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {sMeta.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Date envoi (si statut = envoye) */}
                      {l.statut === 'envoye' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <Calendar size={11} color="var(--muted)" />
                          <input
                            type="date"
                            value={l.date_envoi || ''}
                            onChange={e => updateDateEnvoi(l.id, e.target.value)}
                            style={{
                              padding: '3px 6px', fontSize: 11,
                              border: '1px solid var(--border)', borderRadius: 5,
                              background: 'var(--card)', color: 'var(--foreground)',
                              fontFamily: 'inherit', outline: 'none',
                            }}
                          />
                        </div>
                      )}

                      <button
                        onClick={() => removeLink(l.id)}
                        title="Retirer ce candidat de la commande"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--muted)', padding: 4, flexShrink: 0,
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--destructive)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section ajouter candidats */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Ajouter des candidats
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher : nom, métier, compétence, ville… ET/OU/SAUF"
                style={{
                  width: '100%', height: 38, paddingLeft: 32, paddingRight: 12,
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {loadingCandidats ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
              </div>
            ) : filteredCandidats.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
                {search.trim() ? 'Aucun candidat ne correspond à la recherche' : 'Tous les candidats actifs sont déjà liés ou commence à taper pour rechercher'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                {filteredCandidats.map(c => {
                  const isAdding = adding.has(c.id)
                  const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addCandidat(c.id)}
                      disabled={isAdding}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        cursor: isAdding ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        opacity: isAdding ? 0.5 : 1, transition: 'background 0.12s',
                      }}
                      onMouseOver={e => { if (!isAdding) e.currentTarget.style.background = 'var(--secondary)' }}
                      onMouseOut={e => (e.currentTarget.style.background = 'var(--card)')}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 11, fontWeight: 800, color: 'var(--foreground)' }}>
                        {hasPhoto ? (
                          <Image src={c.photo_url!} alt="" width={30} height={30} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          formatInitials(c.prenom, c.nom)
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatFullName(c.prenom, c.nom)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.titre_poste || 'Sans titre'}{c.localisation ? ` · ${c.localisation}` : ''}
                        </div>
                      </div>
                      {isAdding
                        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
                        : <Plus size={13} color="var(--primary)" />
                      }
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
