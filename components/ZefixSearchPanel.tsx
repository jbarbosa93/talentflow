'use client'
// v1.9.117 — Panel recherche entreprise sur Zefix REST (à intégrer dans une modale parente)
// API : POST /api/clients/zefix/search → liste hits + flag already_in_talentflow

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search as SearchIcon, ExternalLink, Building2, Loader2, AlertCircle, Check, Plus } from 'lucide-react'

export interface ZefixItem {
  name: string
  uid: string
  legalSeat: string
  status: string
  statusLabel: string
  isActive: boolean
  isDissolved: boolean
  isLiquidating: boolean
  cantonalExcerptUrl: string
  similarity: number
  alreadyInTalentflow?: { id: string; nom_entreprise: string } | null
}

interface ZefixSearchPanelProps {
  /** Pré-fill du champ recherche. */
  initialQuery?: string
  /** Callback quand l'utilisateur clique "Importer" sur un hit. */
  onImport: (item: ZefixItem) => Promise<void> | void
  /** Pré-rempli + désactive (utile pour la fiche client). */
  importingUid?: string | null
}

export default function ZefixSearchPanel({ initialQuery = '', onImport, importingUid }: ZefixSearchPanelProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [includeInactive, setIncludeInactive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ZefixItem[]>([])
  const [searched, setSearched] = useState(false)
  const [importingTarget, setImportingTarget] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const res = await fetch('/api/clients/zefix/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q, includeInactive }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur')
      setResults(Array.isArray(json?.results) ? json.results : [])
    } catch (e: any) {
      setError(e?.message || 'Erreur de recherche')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (item: ZefixItem) => {
    setImportingTarget(item.uid)
    try {
      await onImport(item)
    } finally {
      setImportingTarget(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) search()
  }

  const statusColor = (item: ZefixItem) => {
    if (item.isDissolved) return { bg: 'rgba(220,38,38,0.1)', fg: '#dc2626', label: 'Radiée' }
    if (item.isLiquidating) return { bg: 'rgba(234,88,12,0.1)', fg: '#ea580c', label: 'Liquidation' }
    if (item.isActive) return { bg: 'rgba(22,163,74,0.1)', fg: '#16a34a', label: 'Actif' }
    return { bg: 'var(--secondary)', fg: 'var(--muted)', label: item.statusLabel }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Search bar */}
      <div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <SearchIcon size={16} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--muted)',
            }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder='Ex: "Riedo Clima", "Renovatech"...'
              style={{
                width: '100%', height: 44, paddingLeft: 38, paddingRight: 14,
                border: '2px solid var(--border)', borderRadius: 10,
                background: 'var(--card)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={search}
            disabled={!query.trim() || loading}
            className="neo-btn-yellow"
            style={{ minWidth: 110 }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <SearchIcon size={15} />}
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 10, fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            style={{ accentColor: 'var(--primary)' }}
          />
          Inclure les entreprises radiées / en liquidation
        </label>
      </div>

      {/* Results */}
      <div style={{ maxHeight: 460, overflowY: 'auto' }}>
        {error && (
          <div style={{
            padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626',
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
          }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {!searched && !loading && (
          <div style={{
            padding: '32px 20px', textAlign: 'center', color: 'var(--muted)',
            fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10,
          }}>
            <Building2 size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
            Tape le nom d'une entreprise — vérification + import direct depuis le registre du commerce suisse.
          </div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div style={{
            padding: '28px 20px', textAlign: 'center', color: 'var(--muted)',
            fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10,
          }}>
            <AlertCircle size={26} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
            Aucune entreprise trouvée pour "<strong>{query}</strong>"
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((item, idx) => {
              const sc = statusColor(item)
              const isImporting = importingTarget === item.uid || importingUid === item.uid
              return (
                <div key={`${item.uid}-${idx}`} style={{
                  padding: 14, borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                        {item.name}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, marginTop: 4,
                        fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap',
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                          {item.uid}
                        </span>
                        {item.legalSeat && <span>📍 {item.legalSeat}</span>}
                        <span style={{ fontSize: 11 }}>~{item.similarity}% match</span>
                      </div>
                    </div>
                    <span style={{
                      flexShrink: 0, padding: '4px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                      background: sc.bg, color: sc.fg,
                    }}>
                      {sc.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {item.alreadyInTalentflow ? (
                      <button
                        onClick={() => router.push(`/clients/${item.alreadyInTalentflow!.id}`)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: 'rgba(22,163,74,0.1)', color: '#16a34a',
                          border: '1px solid rgba(22,163,74,0.3)',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Check size={13} /> Déjà dans TalentFlow → Ouvrir
                      </button>
                    ) : (
                      <button
                        onClick={() => handleImport(item)}
                        disabled={isImporting}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: 'var(--primary)', color: 'var(--ink)',
                          border: 'none', fontSize: 12, fontWeight: 700,
                          cursor: isImporting ? 'wait' : 'pointer',
                          opacity: isImporting ? 0.6 : 1,
                        }}
                      >
                        {isImporting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        {isImporting ? 'Import…' : 'Importer dans TalentFlow'}
                      </button>
                    )}
                    {item.cantonalExcerptUrl && (
                      <a
                        href={item.cantonalExcerptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: 'var(--secondary)', color: 'var(--foreground)',
                          border: '1px solid var(--border)',
                          fontSize: 12, fontWeight: 600, textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={12} /> Extrait RC
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
