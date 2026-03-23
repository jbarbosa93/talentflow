'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Search, Building2, MapPin, Phone, Mail, Globe,
  Check, X, Pencil, Loader2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

interface SearchResult {
  nom_entreprise: string
  adresse: string
  npa: string
  ville: string
  canton: string
  telephone: string
  email: string
  site_web: string
  secteur: string
  source: string
  uid: string
  already_exists?: boolean
}

interface AIClientSearchProps {
  onClientAdded?: () => void
  onClose?: () => void
  compact?: boolean
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1.5px solid var(--border)', borderRadius: 8,
  background: 'var(--secondary)', color: 'var(--foreground)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

export default function AIClientSearch({ onClientAdded, onClose, compact }: AIClientSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<SearchResult | null>(null)
  const [addingIndex, setAddingIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    setEditingIndex(null)

    try {
      const res = await fetch('/api/clients/search-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erreur ${res.status}`)
      }

      const data = await res.json()
      setResults(data.results || [])

      if (!data.results?.length) {
        setError('Aucune entreprise trouvee. Essayez avec un nom different.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la recherche')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (result: SearchResult, index: number) => {
    setAddingIndex(index)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom_entreprise: result.nom_entreprise,
          adresse: result.adresse || undefined,
          npa: result.npa || undefined,
          ville: result.ville || undefined,
          canton: result.canton || undefined,
          telephone: result.telephone || undefined,
          email: result.email || undefined,
          site_web: result.site_web || undefined,
          secteur: result.secteur || undefined,
          notes: result.uid ? `UID: ${result.uid} | Source: ${result.source}` : `Source: ${result.source}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur creation')
      }

      toast.success(`${result.nom_entreprise} ajouté avec succès !`)

      // Mettre à jour le lastSeen clients pour éviter faux badge rouge
      try {
        const lastSeenData = JSON.parse(localStorage.getItem('talentflow_last_seen') || '{}')
        lastSeenData.clients = new Date().toISOString()
        localStorage.setItem('talentflow_last_seen', JSON.stringify(lastSeenData))
      } catch {}

      // Marquer comme ajoute
      setResults(prev => prev.map((r, i) =>
        i === index ? { ...r, already_exists: true } : r
      ))

      onClientAdded?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'ajout')
    } finally {
      setAddingIndex(null)
    }
  }

  const startEdit = (index: number) => {
    setEditingIndex(index)
    setEditForm({ ...results[index] })
  }

  const saveEdit = () => {
    if (editingIndex !== null && editForm) {
      setResults(prev => prev.map((r, i) => i === editingIndex ? editForm : r))
      setEditingIndex(null)
      setEditForm(null)
    }
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditForm(null)
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'stretch',
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Sparkles size={16} style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: '#F7C948', pointerEvents: 'none',
            }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Ex: Riedo Clima SA Le Mont sur Lausanne"
              disabled={loading}
              style={{
                width: '100%', height: 48, paddingLeft: 42, paddingRight: 14,
                border: '2px solid var(--border)', borderRadius: 12,
                background: 'var(--card)', color: 'var(--foreground)',
                fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none',
                boxSizing: 'border-box', fontWeight: 500,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#F7C948'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(247,201,72,0.2)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            style={{
              height: 48, padding: '0 24px', borderRadius: 12,
              border: '2px solid var(--foreground)',
              background: '#F7C948',
              color: 'var(--ink, #1C1A14)',
              fontSize: 14, fontWeight: 700,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '3px 3px 0 var(--foreground)',
              opacity: loading || !query.trim() ? 0.6 : 1,
              transition: 'transform 0.1s, box-shadow 0.1s',
              whiteSpace: 'nowrap',
            }}
            onMouseDown={e => {
              if (!loading && query.trim()) {
                e.currentTarget.style.transform = 'translate(2px, 2px)'
                e.currentTarget.style.boxShadow = '1px 1px 0 var(--foreground)'
              }
            }}
            onMouseUp={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = '3px 3px 0 var(--foreground)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = '3px 3px 0 var(--foreground)'
            }}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
            Rechercher
          </button>
        </div>
        <p style={{
          fontSize: 12, color: 'var(--muted)', margin: '8px 0 0 4px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Sparkles size={11} color="#F7C948" />
          Recherche dans le registre du commerce suisse (Zefix) + enrichissement IA
        </p>
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
              padding: 32, textAlign: 'center',
            }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #F7C948 0%, #F5B731 100%)',
              border: '2px solid var(--foreground)',
              boxShadow: '3px 3px 0 var(--foreground)',
              marginBottom: 16,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              <Sparkles size={26} color="var(--ink, #1C1A14)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>
              Recherche en cours...
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Interrogation du registre Zefix + enrichissement par IA
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--card)', border: '2px solid #EF4444', borderRadius: 14,
            padding: 20, display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <AlertTriangle size={20} color="#EF4444" />
          <span style={{ fontSize: 14, color: 'var(--foreground)' }}>{error}</span>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, margin: 0 }}>
              {results.length} resultat{results.length > 1 ? 's' : ''} trouve{results.length > 1 ? 's' : ''}
            </p>

            {results.map((result, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                style={{
                  background: 'var(--card)',
                  border: result.already_exists
                    ? '2px solid #F59E0B'
                    : '2px solid var(--border)',
                  borderRadius: 14,
                  padding: 20,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Source badge */}
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  {result.already_exists && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#92400E',
                      background: '#FEF3C7', border: '1px solid #F59E0B',
                      borderRadius: 6, padding: '2px 8px',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <AlertTriangle size={11} /> Existe deja
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                    background: 'var(--secondary)', borderRadius: 6,
                    padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {result.source}
                  </span>
                </div>

                {editingIndex === index && editForm ? (
                  /* Editing mode */
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 14px', paddingRight: 120 }}>
                      Modifier les informations
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
                          Nom de l&apos;entreprise
                        </label>
                        <input
                          value={editForm.nom_entreprise}
                          onChange={e => setEditForm({ ...editForm, nom_entreprise: e.target.value })}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
                          Secteur
                        </label>
                        <input
                          value={editForm.secteur}
                          onChange={e => setEditForm({ ...editForm, secteur: e.target.value })}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
                          Adresse
                        </label>
                        <input
                          value={editForm.adresse}
                          onChange={e => setEditForm({ ...editForm, adresse: e.target.value })}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>NPA</label>
                          <input
                            value={editForm.npa}
                            onChange={e => setEditForm({ ...editForm, npa: e.target.value })}
                            style={INPUT_STYLE}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Ville</label>
                          <input
                            value={editForm.ville}
                            onChange={e => setEditForm({ ...editForm, ville: e.target.value })}
                            style={INPUT_STYLE}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Canton</label>
                          <input
                            value={editForm.canton}
                            onChange={e => setEditForm({ ...editForm, canton: e.target.value })}
                            style={INPUT_STYLE}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Telephone</label>
                          <input
                            value={editForm.telephone}
                            onChange={e => setEditForm({ ...editForm, telephone: e.target.value })}
                            style={INPUT_STYLE}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Email</label>
                          <input
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            style={INPUT_STYLE}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Site web</label>
                        <input
                          value={editForm.site_web}
                          onChange={e => setEditForm({ ...editForm, site_web: e.target.value })}
                          style={INPUT_STYLE}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                      <button onClick={cancelEdit} style={{
                        height: 34, padding: '0 14px', borderRadius: 8,
                        border: '1.5px solid var(--border)', background: 'var(--secondary)',
                        color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <X size={13} /> Annuler
                      </button>
                      <button onClick={saveEdit} style={{
                        height: 34, padding: '0 14px', borderRadius: 8,
                        border: '2px solid var(--foreground)', background: '#F7C948',
                        color: 'var(--ink, #1C1A14)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5,
                        boxShadow: '2px 2px 0 var(--foreground)',
                      }}>
                        <Check size={13} /> Valider
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'var(--secondary)',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Building2 size={20} color="var(--foreground)" />
                      </div>
                      <div style={{ flex: 1, paddingRight: 120 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: 0, lineHeight: 1.3 }}>
                          {result.nom_entreprise}
                        </h3>
                        {result.secteur && (
                          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0', fontWeight: 500 }}>
                            {result.secteur}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 8, marginBottom: 14,
                    }}>
                      {(result.adresse || result.ville) && (
                        <InfoItem icon={<MapPin size={13} />} label="Adresse">
                          {[result.adresse, [result.npa, result.ville].filter(Boolean).join(' '), result.canton].filter(Boolean).join(', ')}
                        </InfoItem>
                      )}
                      {result.telephone && (
                        <InfoItem icon={<Phone size={13} />} label="Telephone">
                          {result.telephone}
                        </InfoItem>
                      )}
                      {result.email && (
                        <InfoItem icon={<Mail size={13} />} label="Email">
                          {result.email}
                        </InfoItem>
                      )}
                      {result.site_web && (
                        <InfoItem icon={<Globe size={13} />} label="Site web">
                          {result.site_web}
                        </InfoItem>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleAdd(result, index)}
                        disabled={addingIndex === index}
                        style={{
                          height: 34, padding: '0 16px', borderRadius: 8,
                          border: '2px solid var(--foreground)',
                          background: result.already_exists ? 'var(--secondary)' : '#10B981',
                          color: result.already_exists ? 'var(--foreground)' : 'white',
                          fontSize: 13, fontWeight: 700, cursor: addingIndex === index ? 'wait' : 'pointer',
                          fontFamily: 'var(--font-body)',
                          display: 'flex', alignItems: 'center', gap: 6,
                          boxShadow: '2px 2px 0 var(--foreground)',
                          transition: 'transform 0.1s',
                        }}
                      >
                        {addingIndex === index ? (
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Check size={14} />
                        )}
                        {result.already_exists ? 'Ajouter quand meme' : 'Ajouter ce client'}
                      </button>
                      <button
                        onClick={() => startEdit(index)}
                        style={{
                          height: 34, padding: '0 14px', borderRadius: 8,
                          border: '1.5px solid var(--border)', background: 'var(--card)',
                          color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Pencil size={13} /> Modifier
                      </button>
                      <button
                        onClick={() => setResults(prev => prev.filter((_, i) => i !== index))}
                        style={{
                          height: 34, padding: '0 14px', borderRadius: 8,
                          border: '1.5px solid var(--border)', background: 'var(--card)',
                          color: '#EF4444', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <X size={13} /> Ignorer
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Style for pulse animation */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 10px', borderRadius: 8,
      background: 'var(--secondary)',
    }}>
      <span style={{ color: 'var(--muted)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {label}
        </span>
        <p style={{ fontSize: 13, color: 'var(--foreground)', margin: 0, fontWeight: 500, wordBreak: 'break-word' }}>
          {children}
        </p>
      </div>
    </div>
  )
}
