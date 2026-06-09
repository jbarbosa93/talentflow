'use client'
// TalentFlow Mobile /m/candidats — Liste (v2.10.x : filtre métier + pagination + chips métier assigné)
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import MHeader from '../_components/MHeader'
import MAvatar from '../_components/MAvatar'
import MContactActions from '../_components/MContactActions'
import MMultiSelectSheet from '../_components/MMultiSelectSheet'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'

interface CandidatRow {
  id: string
  nom?: string | null
  prenom?: string | null
  titre_poste?: string | null
  localisation?: string | null
  photo_url?: string | null
  email?: string | null
  telephone?: string | null
  pipeline_metier?: string | null
  tags?: string[] | null
}

const PER_PAGE = 20

function initials(c: CandidatRow): string {
  const p = (c.prenom || '').trim()[0] || ''
  const n = (c.nom || '').trim()[0] || ''
  return (p + n).toUpperCase() || '?'
}

export default function MobileCandidatsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [metierSel, setMetierSel] = useState<string[]>([])
  const [statut, setStatut] = useState<'actif' | 'a_traiter'>('actif')
  const [page, setPage] = useState(1)

  const { metiers } = useMetiers()
  const { getColorForMetier } = useMetierCategories()

  // Debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Revenir à la page 1 quand recherche / filtre change
  const metierParam = metierSel.join(',')
  useEffect(() => { setPage(1) }, [debouncedSearch, metierParam, statut])

  const { data, isLoading } = useQuery<{ candidats: CandidatRow[]; total: number; total_pages?: number }>({
    queryKey: ['m', 'candidats', debouncedSearch, metierParam, statut, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        per_page: String(PER_PAGE),
        page: String(page),
        sort: 'date_desc',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (metierParam) params.set('metier', metierParam)
      if (statut === 'a_traiter') params.set('import_status', 'a_traiter')
      const r = await fetch(`/api/candidats?${params}`, { credentials: 'include' })
      if (!r.ok) return { candidats: [], total: 0 }
      return r.json()
    },
    staleTime: 30_000,
  })

  const candidats = data?.candidats || []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? Math.max(1, Math.ceil(total / PER_PAGE))

  // Métiers assignés à afficher = tags présents dans la liste configurée de l'agence
  const assignedMetiers = (c: CandidatRow) =>
    (c.tags || []).filter((t) => metiers.includes(t))

  return (
    <>
      <MHeader title="Candidats" back="/m" />
      <div className="m-content">
        <div className="m-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Rechercher nom, métier, localisation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Filtre métier multi-sélection (liste déroulante app) */}
        <div style={{ marginBottom: 10 }}>
          <MMultiSelectSheet
            options={metiers}
            selected={metierSel}
            onChange={setMetierSel}
            placeholder="Tous les métiers"
            title="Filtrer par métier"
          />
        </div>

        {/* Filtre statut : Actif / À traiter */}
        <div style={{ display: 'flex', gap: 8, margin: '0 0 14px' }}>
          {([['actif', 'Actif'], ['a_traiter', 'À traiter']] as const).map(([val, label]) => {
            const on = statut === val
            return (
              <button
                key={val}
                onClick={() => setStatut(val)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: `1px solid ${on ? 'var(--m-yellow, #F7C948)' : 'var(--m-border, #e7e5df)'}`,
                  background: on ? 'var(--m-yellow, #F7C948)' : '#fff',
                  color: on ? '#1C1A14' : 'var(--m-text-soft, #6b6657)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {isLoading && (
          <div className="m-loading">Chargement...</div>
        )}

        {!isLoading && candidats.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-emoji">🔍</div>
            <div>Aucun candidat trouvé</div>
          </div>
        )}

        {!isLoading && candidats.length > 0 && (
          <>
            <div className="m-section-title">
              {total} candidat{total > 1 ? 's' : ''}
              {debouncedSearch && ` · "${debouncedSearch}"`}
              {metierSel.length > 0 && ` · ${metierSel.join(', ')}`}
            </div>
            {candidats.map((c) => {
              const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Sans nom'
              const tags = assignedMetiers(c)
              return (
                <div key={c.id} className="m-card" style={{ alignItems: 'center' }}>
                  <Link
                    href={`/m/candidats/${c.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                  >
                  <MAvatar src={c.photo_url} initials={initials(c)} alt={fullName} />
                  <div className="m-card-body">
                    <div className="m-card-title">{fullName}</div>
                    {tags.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '3px 0' }}>
                        {tags.map((t) => {
                          const color = getColorForMetier(t) || '#9a8a3a'
                          return (
                            <span
                              key={t}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 999,
                                color,
                                background: `${color}1a`,
                                border: `1px solid ${color}40`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t}
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="m-card-sub">{c.titre_poste || '—'}</div>
                    )}
                    <div className="m-card-meta">{c.localisation || '—'}</div>
                  </div>
                  </Link>
                  {c.telephone && (
                    <div style={{ marginLeft: 8, flexShrink: 0 }}>
                      <MContactActions phone={c.telephone} size="sm" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '20px 0 32px' }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: 12,
                    border: '1px solid var(--m-border, #e7e5df)',
                    background: '#fff', opacity: page <= 1 ? 0.4 : 1,
                  }}
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={20} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Page {page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: 12,
                    border: '1px solid var(--m-border, #e7e5df)',
                    background: '#fff', opacity: page >= totalPages ? 0.4 : 1,
                  }}
                  aria-label="Page suivante"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
