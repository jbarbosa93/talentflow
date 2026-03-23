'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Search, Plus, MapPin, Phone, Mail, Globe,
  ChevronLeft, ChevronRight, Loader2, X, Filter,
  Briefcase, LayoutGrid, List, SlidersHorizontal, Users, RotateCcw,
} from 'lucide-react'
import { useClients, useCreateClient, type Client } from '@/hooks/useClients'

const STATUT_TABS = [
  { value: 'all', label: 'Tous' },
  { value: 'actif', label: 'Actifs' },
  { value: 'desactive', label: 'Desactives' },
]

// Cantons suisses abbreviations
const CANTON_COLORS: Record<string, string> = {
  VS: '#E74C3C', VD: '#3498DB', GE: '#2ECC71', FR: '#F39C12',
  BE: '#E67E22', NE: '#9B59B6', JU: '#1ABC9C', TI: '#E91E63',
  ZH: '#00BCD4', AG: '#FF5722', LU: '#8BC34A', SG: '#795548',
  BS: '#607D8B', BL: '#FF9800', SO: '#673AB7', TG: '#009688',
  GR: '#CDDC39', SZ: '#F44336', ZG: '#2196F3', OW: '#4CAF50',
  NW: '#FFC107', UR: '#FF5252', GL: '#00E676', SH: '#6200EA',
  AR: '#DD2C00', AI: '#00C853',
}

function getCantonColor(canton: string | null) {
  if (!canton) return 'var(--muted)'
  const c = canton.toUpperCase().trim()
  return CANTON_COLORS[c] || 'var(--muted)'
}

// Modal creation client
function CreateClientModal({ open, onClose, onCreate }: {
  open: boolean
  onClose: () => void
  onCreate: (data: Partial<Client>) => void
}) {
  const [form, setForm] = useState({
    nom_entreprise: '', adresse: '', npa: '', ville: '', canton: '',
    telephone: '', email: '', secteur: '', site_web: '', notes: '',
  })

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Nouveau client
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', padding: 4,
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {/* Nom entreprise */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>
              Nom de l&apos;entreprise *
            </label>
            <input
              value={form.nom_entreprise}
              onChange={e => setForm(f => ({ ...f, nom_entreprise: e.target.value }))}
              placeholder="Ex: Nestle SA"
              style={{
                width: '100%', height: 40, padding: '0 12px',
                border: '1.5px solid var(--border)', borderRadius: 8,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Secteur */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>
              Secteur
            </label>
            <input
              value={form.secteur}
              onChange={e => setForm(f => ({ ...f, secteur: e.target.value }))}
              placeholder="Ex: Industrie, Construction..."
              style={{
                width: '100%', height: 40, padding: '0 12px',
                border: '1.5px solid var(--border)', borderRadius: 8,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Address row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>
                Adresse
              </label>
              <input
                value={form.adresse}
                onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                placeholder="Rue et numero"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* NPA / Ville / Canton */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>NPA</label>
              <input
                value={form.npa}
                onChange={e => setForm(f => ({ ...f, npa: e.target.value }))}
                placeholder="1950"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Ville</label>
              <input
                value={form.ville}
                onChange={e => setForm(f => ({ ...f, ville: e.target.value }))}
                placeholder="Sion"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Canton</label>
              <input
                value={form.canton}
                onChange={e => setForm(f => ({ ...f, canton: e.target.value }))}
                placeholder="VS"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Telephone</label>
              <input
                value={form.telephone}
                onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                placeholder="+41 27 123 45 67"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Email</label>
              <input
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contact@entreprise.ch"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  background: 'var(--secondary)', color: 'var(--foreground)',
                  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Site web */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Site web</label>
            <input
              value={form.site_web}
              onChange={e => setForm(f => ({ ...f, site_web: e.target.value }))}
              placeholder="https://www.entreprise.ch"
              style={{
                width: '100%', height: 40, padding: '0 12px',
                border: '1.5px solid var(--border)', borderRadius: 8,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'block' }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Notes supplementaires..."
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid var(--border)', borderRadius: 8,
                background: 'var(--secondary)', color: 'var(--foreground)',
                fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            height: 40, padding: '0 20px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--secondary)',
            color: 'var(--foreground)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>
            Annuler
          </button>
          <button
            onClick={() => {
              if (!form.nom_entreprise.trim()) return
              onCreate(form)
              setForm({ nom_entreprise: '', adresse: '', npa: '', ville: '', canton: '', telephone: '', email: '', secteur: '', site_web: '', notes: '' })
              onClose()
            }}
            disabled={!form.nom_entreprise.trim()}
            style={{
              height: 40, padding: '0 20px', borderRadius: 8,
              border: '2px solid var(--foreground)', background: 'var(--primary)',
              color: 'var(--ink)', fontSize: 14, fontWeight: 700,
              cursor: form.nom_entreprise.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-body)',
              opacity: form.nom_entreprise.trim() ? 1 : 0.5,
              boxShadow: '3px 3px 0 var(--foreground)',
            }}
          >
            Creer le client
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cantonFilter, setCantonFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [filterSecteur, setFilterSecteur] = useState('')
  const [filterVille, setFilterVille] = useState('')
  const [filterNPA, setFilterNPA] = useState('')
  const [filterAvecContacts, setFilterAvecContacts] = useState('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isFetching } = useClients({
    search: debouncedSearch,
    statut: statutFilter,
    page,
    per_page: 20,
  })

  const createClient = useCreateClient()

  const clients = data?.clients || []
  const total = data?.total || 0
  const totalPages = data?.total_pages || 1

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28, flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--foreground)', margin: 0, lineHeight: 1.2 }}>
            Clients
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '4px 0 0', fontWeight: 500 }}>
            {total.toLocaleString('fr-CH')} entreprise{total !== 1 ? 's' : ''} enregistree{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="neo-btn-yellow">
          <Plus size={15} /> Ajouter un client
        </button>
      </div>

      {/* Search + Filters bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 480 }}>
          <Search size={16} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ville, secteur, email..."
            style={{
              width: '100%', height: 44, paddingLeft: 40, paddingRight: search ? 36 : 14,
              border: '2px solid var(--border)', borderRadius: 10,
              background: 'var(--card)', color: 'var(--foreground)',
              fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
              boxSizing: 'border-box', fontWeight: 500,
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'var(--secondary)', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', padding: 3, borderRadius: 4, display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Statut tabs */}
        <div style={{
          display: 'flex', gap: 0,
          border: '2px solid var(--border)', borderRadius: 10, overflow: 'hidden',
          background: 'var(--card)',
        }}>
          {STATUT_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setStatutFilter(tab.value); setPage(1) }}
              style={{
                height: 40, padding: '0 16px',
                border: 'none', borderRight: '1px solid var(--border)',
                background: statutFilter === tab.value ? 'var(--primary)' : 'transparent',
                color: statutFilter === tab.value ? 'var(--ink)' : 'var(--foreground)',
                fontSize: 13, fontWeight: statutFilter === tab.value ? 700 : 500,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'background 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filtres avancés button */}
        <button
          onClick={() => setShowAdvancedFilters(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 40, padding: '0 14px', borderRadius: 10,
            border: '2px solid var(--border)',
            background: showAdvancedFilters ? 'var(--primary)' : 'var(--card)',
            color: showAdvancedFilters ? 'var(--ink)' : 'var(--foreground)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          <SlidersHorizontal size={14} />
          Filtres avancés
          {(cantonFilter || filterSecteur || filterVille || filterNPA || filterAvecContacts) && (
            <span style={{ background: '#EF4444', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
              {[cantonFilter, filterSecteur, filterVille, filterNPA, filterAvecContacts].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div style={{
          display: 'flex', gap: 0, border: '2px solid var(--border)',
          borderRadius: 10, overflow: 'hidden', background: 'var(--card)', marginLeft: 'auto',
        }}>
          <button onClick={() => setViewMode('grid')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'grid' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'grid' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer', borderRight: '1px solid var(--border)',
          }}><LayoutGrid size={16} /></button>
          <button onClick={() => setViewMode('list')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'list' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer',
          }}><List size={16} /></button>
        </div>

        {/* Loading indicator */}
        {isFetching && (
          <Loader2 size={18} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {/* Filtres avancés panel */}
      {showAdvancedFilters && (
        <div style={{
          background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 12,
          padding: 16, marginBottom: 16,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
        }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Secteur</label>
            <input value={filterSecteur} onChange={e => { setFilterSecteur(e.target.value); setPage(1) }}
              placeholder="Ex: Construction, BTP..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ville</label>
            <input value={filterVille} onChange={e => { setFilterVille(e.target.value); setPage(1) }}
              placeholder="Ex: Monthey, Sion..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Canton</label>
            <select value={cantonFilter} onChange={e => { setCantonFilter(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: cantonFilter ? 'var(--foreground)' : 'var(--muted)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            >
              <option value="">Tous</option>
              {Object.keys(CANTON_COLORS).sort().map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>NPA</label>
            <input value={filterNPA} onChange={e => { setFilterNPA(e.target.value); setPage(1) }}
              placeholder="Ex: 1870, 1950..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contacts</label>
            <select value={filterAvecContacts} onChange={e => { setFilterAvecContacts(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: filterAvecContacts ? 'var(--foreground)' : 'var(--muted)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            >
              <option value="">Tous</option>
              <option value="avec">Avec contacts</option>
              <option value="sans">Sans contacts</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={() => {
              setCantonFilter(''); setFilterSecteur(''); setFilterVille(''); setFilterNPA(''); setFilterAvecContacts(''); setPage(1)
            }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 38, padding: '0 16px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--secondary)',
              color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* Grid of client cards */}
      {isLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '80px 0', gap: 12,
        }}>
          <Loader2 size={24} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>Chargement des clients...</span>
        </div>
      ) : (() => {
        const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        let filteredClients = clients
        if (cantonFilter) filteredClients = filteredClients.filter(c => c.canton?.toUpperCase().trim() === cantonFilter)
        if (filterSecteur) filteredClients = filteredClients.filter(c => normalize(c.secteur || '').includes(normalize(filterSecteur)))
        if (filterVille) filteredClients = filteredClients.filter(c => normalize(c.ville || '').includes(normalize(filterVille)))
        if (filterNPA) filteredClients = filteredClients.filter(c => (c.npa || '').includes(filterNPA))
        if (filterAvecContacts === 'avec') filteredClients = filteredClients.filter(c => {
          const contacts = typeof c.contacts === 'string' ? JSON.parse(c.contacts) : (c.contacts || [])
          return contacts.length > 0
        })
        if (filterAvecContacts === 'sans') filteredClients = filteredClients.filter(c => {
          const contacts = typeof c.contacts === 'string' ? JSON.parse(c.contacts) : (c.contacts || [])
          return contacts.length === 0
        })
        return filteredClients.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--card)', borderRadius: 16, border: '2px solid var(--border)',
        }}>
          <Building2 size={48} color="var(--muted)" style={{ opacity: 0.4, marginBottom: 16 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
            Aucun client trouve
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {search ? 'Essayez avec d\'autres mots-cles' : 'Commencez par ajouter votre premier client'}
          </p>
        </div>
      ) : (
        <div style={{
          display: viewMode === 'grid' ? 'grid' : 'flex',
          gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(340px, 1fr))' : undefined,
          flexDirection: viewMode === 'list' ? 'column' : undefined,
          gap: viewMode === 'grid' ? 16 : 8,
        }}>
          {filteredClients.map(client => (
            <div
              key={client.id}
              onClick={() => router.push(`/clients/${client.id}`)}
              style={{
                background: 'var(--card)',
                border: '2px solid var(--border)',
                borderRadius: 14,
                padding: '20px 22px',
                cursor: 'pointer',
                transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.15s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'
                e.currentTarget.style.borderColor = 'var(--primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              {/* Top: Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: 'var(--ink)',
                  border: '2px solid var(--foreground)',
                }}>
                  {(client.nom_entreprise?.[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    fontSize: 16, fontWeight: 800, color: 'var(--foreground)',
                    margin: 0, lineHeight: 1.3,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {client.nom_entreprise}
                  </h3>
                  {/* Location + Canton badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {client.ville && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 12, color: 'var(--muted)', fontWeight: 500,
                      }}>
                        <MapPin size={11} />
                        {client.npa ? `${client.npa} ` : ''}{client.ville}
                      </span>
                    )}
                    {client.canton && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 6px',
                        borderRadius: 4, color: 'white', lineHeight: 1.4,
                        background: getCantonColor(client.canton),
                      }}>
                        {client.canton.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 6,
                  background: client.statut === 'actif' ? '#22C55E' : '#94A3B8',
                  border: '2px solid var(--card)',
                  boxShadow: client.statut === 'actif' ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                }} title={client.statut === 'actif' ? 'Actif' : 'Desactive'} />
              </div>

              {/* Secteur tag */}
              {client.secteur && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--primary-soft)', border: '1px solid var(--primary)',
                    fontSize: 11, fontWeight: 700, color: 'var(--foreground)',
                  }}>
                    <Briefcase size={10} />
                    {client.secteur}
                  </span>
                </div>
              )}

              {/* Contact info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {client.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                    <Mail size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.email}
                    </span>
                  </div>
                )}
                {client.telephone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                    <Phone size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                    {client.telephone}
                  </div>
                )}
                {client.site_web && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                    <Globe size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--primary)', textDecoration: 'underline' }}
                      onClick={e => {
                        e.stopPropagation()
                        let url = client.site_web || ''
                        if (!url.startsWith('http')) url = 'https://' + url
                        window.open(url, '_blank')
                      }}
                    >
                      {client.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )})()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, marginTop: 28,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 8,
              border: '2px solid var(--border)', background: 'var(--card)',
              color: page <= 1 ? 'var(--border)' : 'var(--foreground)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
            padding: '0 12px',
          }}>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 8,
              border: '2px solid var(--border)', background: 'var(--card)',
              color: page >= totalPages ? 'var(--border)' : 'var(--foreground)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Create modal */}
      <CreateClientModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={(data) => createClient.mutate(data as any)}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
