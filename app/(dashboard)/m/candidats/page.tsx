'use client'
// TalentFlow Mobile /m/candidats — Liste simplifiée (v2.9.72)
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, Users } from 'lucide-react'
import MHeader from '../_components/MHeader'

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
}

function initials(c: CandidatRow): string {
  const p = (c.prenom || '').trim()[0] || ''
  const n = (c.nom || '').trim()[0] || ''
  return (p + n).toUpperCase() || '?'
}

export default function MobileCandidatsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useMemo(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery<{ candidats: CandidatRow[]; total: number }>({
    queryKey: ['m', 'candidats', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        per_page: '50',
        page: '1',
        sort: 'date_desc',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const r = await fetch(`/api/candidats?${params}`, { credentials: 'include' })
      if (!r.ok) return { candidats: [], total: 0 }
      return r.json()
    },
    staleTime: 30_000,
  })

  const candidats = data?.candidats || []

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
              {data?.total ?? 0} candidat{(data?.total ?? 0) > 1 ? 's' : ''}{debouncedSearch && ` · "${debouncedSearch}"`}
            </div>
            {candidats.map((c) => {
              const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Sans nom'
              return (
                <Link key={c.id} href={`/m/candidats/${c.id}`} className="m-card">
                  <div className="m-avatar">
                    {c.photo_url
                      ? <img src={c.photo_url} alt={fullName} loading="lazy" />
                      : initials(c)}
                  </div>
                  <div className="m-card-body">
                    <div className="m-card-title">{fullName}</div>
                    <div className="m-card-sub">{c.titre_poste || c.pipeline_metier || '—'}</div>
                    <div className="m-card-meta">{c.localisation || '—'}</div>
                  </div>
                </Link>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}
