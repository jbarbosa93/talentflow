'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Building2, Search, Plus, MapPin, Phone, Mail, Globe,
  ChevronLeft, ChevronRight, Loader2, X, Filter,
  Briefcase, LayoutGrid, List, SlidersHorizontal, Users, RotateCcw, Sparkles,
  ShieldCheck, ExternalLink, Check, AlertCircle, Map as MapIcon, Columns,
} from 'lucide-react'
import { useClients, useCreateClient, useSecteursStats, type Client } from '@/hooks/useClients'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import AIClientSearch from '@/components/AIClientSearch'
import ProspectionModal from '@/components/ProspectionModal'
import ClientLogo from '@/components/ClientLogo'
import ZefixSearchPanel, { type ZefixItem } from '@/components/ZefixSearchPanel'

// v1.9.118 — Carte Leaflet en lazy load (Leaflet ne supporte pas SSR)
const ClientsMap = dynamic(() => import('@/components/ClientsMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 12,
      color: 'var(--muted)', fontSize: 13,
    }}>
      <Loader2 size={20} className="animate-spin" /> &nbsp;Chargement de la carte…
    </div>
  ),
})
import { SECTEURS_ACTIVITE, SECTEUR_REPRESENTATIVE_METIER } from '@/lib/secteurs-extractor'

// v1.9.114 — Couleur d'un secteur depuis les catégories métiers définies
// dans /parametres/metiers (mapping secteur → métier représentatif → catégorie).
function makeSecteurColors(getColorForMetier: (m: string) => string | undefined) {
  return (secteur: string) => {
    const metier = SECTEUR_REPRESENTATIVE_METIER[secteur as keyof typeof SECTEUR_REPRESENTATIVE_METIER]
    const hex = metier ? getColorForMetier(metier) : undefined
    if (!hex) {
      return {
        bg: 'var(--primary-soft)',
        border: 'var(--primary)',
        text: 'var(--primary)',
      }
    }
    // hex+'1A' = alpha 10% (lisible en light + dark mode)
    return {
      bg: `${hex}1A`,
      border: hex,
      text: hex,
    }
  }
}

const LAST_SEEN_KEY = 'talentflow_last_seen'
function getClientLastSeen(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const data = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || '{}')
    return data.clients || null
  } catch { return null }
}

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
function CreateClientModal({ open, onClose, onCreate, onClientAdded }: {
  open: boolean
  onClose: () => void
  onCreate: (data: Partial<Client>) => void
  onClientAdded?: () => void
}) {
  const { getColorForMetier } = useMetierCategories()
  const getSecteurColor = makeSecteurColors(getColorForMetier)
  const [form, setForm] = useState<{
    nom_entreprise: string; adresse: string; npa: string; ville: string; canton: string;
    telephone: string; email: string; secteur: string; site_web: string; notes: string;
    secteurs_activite: string[];
    contacts: Array<{ prenom: string; nom: string; fonction: string; email: string; telephone: string }>;
  }>({
    nom_entreprise: '', adresse: '', npa: '', ville: '', canton: '',
    telephone: '', email: '', secteur: '', site_web: '', notes: '',
    secteurs_activite: [],
    contacts: [],
  })
  const [activeTab, setActiveTab] = useState<'ia' | 'manual' | 'zefix'>('zefix')
  const router = useRouter()

  if (!open) return null

  // v1.9.48 — createPortal pour garantir position:fixed centré (pattern #10 CLAUDE.md)
  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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

        {/* Tabs: IA / Manuel */}
        <div style={{
          display: 'flex', gap: 0, marginBottom: 20,
          border: '2px solid var(--border)', borderRadius: 10, overflow: 'hidden',
          background: 'var(--secondary)',
        }}>
          <button
            onClick={() => setActiveTab('zefix')}
            style={{
              flex: 1, height: 40, border: 'none',
              background: activeTab === 'zefix' ? '#F7C948' : 'transparent',
              color: activeTab === 'zefix' ? 'var(--ink, #1C1A14)' : 'var(--foreground)',
              fontSize: 13, fontWeight: activeTab === 'zefix' ? 700 : 500,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRight: '1px solid var(--border)',
            }}
            title="Recherche au registre du commerce suisse — gratuit, instantané, officiel"
          >
            <ShieldCheck size={14} /> Zefix RC
          </button>
          <button
            onClick={() => setActiveTab('ia')}
            style={{
              flex: 1, height: 40, border: 'none',
              background: activeTab === 'ia' ? '#F7C948' : 'transparent',
              color: activeTab === 'ia' ? 'var(--ink, #1C1A14)' : 'var(--foreground)',
              fontSize: 13, fontWeight: activeTab === 'ia' ? 700 : 500,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRight: '1px solid var(--border)',
            }}
            title="Recherche IA + web search (récupère adresse complète, téléphone, site web)"
          >
            <Sparkles size={14} /> Recherche IA
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1, height: 40, border: 'none',
              background: activeTab === 'manual' ? '#F7C948' : 'transparent',
              color: activeTab === 'manual' ? 'var(--ink, #1C1A14)' : 'var(--foreground)',
              fontSize: 13, fontWeight: activeTab === 'manual' ? 700 : 500,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Saisie manuelle
          </button>
        </div>

        {activeTab === 'ia' ? (
          <AIClientSearch
            compact
            onClientAdded={() => { onClientAdded?.(); onClose() }}
          />
        ) : activeTab === 'zefix' ? (
          <ZefixSearchPanel
            onImport={async (item: ZefixItem) => {
              try {
                const res = await fetch('/api/clients', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nom_entreprise: item.name,
                    ville: item.legalSeat,
                    statut: 'actif',
                    zefix_uid: item.uid,
                    zefix_status: item.status,
                    zefix_name: item.name,
                    zefix_verified_at: new Date().toISOString(),
                  }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json?.error || 'Erreur création')
                onClientAdded?.()
                onClose()
                router.push(`/clients/${json.client.id}`)
              } catch (e: any) {
                alert(e?.message || 'Erreur lors de l\'import')
              }
            }}
          />
        ) : (
          <div>

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

          {/* v1.9.114 — Secteurs d'activité (multi-select optionnel à la création) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6, display: 'block' }}>
              Secteurs d&apos;activité <span style={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>(facultatif — auto-extrait depuis les notes sinon)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SECTEURS_ACTIVITE.map(s => {
                const active = form.secteurs_activite.includes(s)
                const c = getSecteurColor(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      secteurs_activite: active
                        ? f.secteurs_activite.filter(x => x !== s)
                        : [...f.secteurs_activite, s],
                    }))}
                    style={{
                      padding: '4px 10px', borderRadius: 6,
                      border: `1.5px solid ${active ? c.border : 'var(--border)'}`,
                      background: active ? c.bg : 'var(--card)',
                      color: active ? c.text : 'var(--muted-foreground)',
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* v1.9.114 — Contacts (optionnel à la création) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block' }}>
                Personnes de contact <span style={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>(facultatif)</span>
              </label>
              <button
                type="button"
                onClick={() => setForm(f => ({
                  ...f,
                  contacts: [...f.contacts, { prenom: '', nom: '', fonction: '', email: '', telephone: '' }],
                }))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 26, padding: '0 10px', borderRadius: 6,
                  border: '1.5px solid var(--primary)', background: 'var(--primary-soft)',
                  color: 'var(--primary)', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                <Plus size={11} /> Ajouter
              </button>
            </div>
            {form.contacts.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, fontStyle: 'italic' }}>
                Aucun contact — clique sur « Ajouter » pour en créer un.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.contacts.map((c, idx) => (
                  <div key={idx} style={{
                    background: 'var(--secondary)', border: '1.5px solid var(--border)',
                    borderRadius: 8, padding: 10, position: 'relative',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }))}
                      title="Supprimer"
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 22, height: 22, borderRadius: 4,
                        border: 'none', background: 'transparent',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X size={12} />
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingRight: 24 }}>
                      <input
                        type="text" placeholder="Prénom"
                        value={c.prenom}
                        onChange={e => setForm(f => {
                          const next = [...f.contacts]
                          next[idx] = { ...next[idx], prenom: e.target.value }
                          return { ...f, contacts: next }
                        })}
                        style={{ width: '100%', padding: '6px 9px', borderRadius: 5, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <input
                        type="text" placeholder="Nom"
                        value={c.nom}
                        onChange={e => setForm(f => {
                          const next = [...f.contacts]
                          next[idx] = { ...next[idx], nom: e.target.value }
                          return { ...f, contacts: next }
                        })}
                        style={{ width: '100%', padding: '6px 9px', borderRadius: 5, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <input
                      type="text" placeholder="Fonction"
                      value={c.fonction}
                      onChange={e => setForm(f => {
                        const next = [...f.contacts]
                        next[idx] = { ...next[idx], fonction: e.target.value }
                        return { ...f, contacts: next }
                      })}
                      style={{ width: '100%', padding: '6px 9px', borderRadius: 5, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <input
                        type="email" placeholder="Email"
                        value={c.email}
                        onChange={e => setForm(f => {
                          const next = [...f.contacts]
                          next[idx] = { ...next[idx], email: e.target.value }
                          return { ...f, contacts: next }
                        })}
                        style={{ width: '100%', padding: '6px 9px', borderRadius: 5, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <input
                        type="tel" placeholder="Téléphone"
                        value={c.telephone}
                        onChange={e => setForm(f => {
                          const next = [...f.contacts]
                          next[idx] = { ...next[idx], telephone: e.target.value }
                          return { ...f, contacts: next }
                        })}
                        style={{ width: '100%', padding: '6px 9px', borderRadius: 5, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              // Filtre les contacts vides avant envoi (au moins un champ rempli)
              const cleanedContacts = form.contacts.filter(c =>
                c.prenom.trim() || c.nom.trim() || c.email.trim() || c.telephone.trim() || c.fonction.trim()
              )
              onCreate({ ...form, contacts: cleanedContacts.length > 0 ? cleanedContacts as any : null })
              setForm({ nom_entreprise: '', adresse: '', npa: '', ville: '', canton: '', telephone: '', email: '', secteur: '', site_web: '', notes: '', secteurs_activite: [], contacts: [] })
              onClose()
            }}
            disabled={!form.nom_entreprise.trim()}
            className="neo-btn-yellow"
            style={{
              height: 40,
              cursor: form.nom_entreprise.trim() ? 'pointer' : 'not-allowed',
              opacity: form.nom_entreprise.trim() ? 1 : 0.5,
            }}
          >
            Creer le client
          </button>
        </div>
        </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function ClientsPage() {
  const router = useRouter()

  // Restore state from sessionStorage on mount
  const [search, setSearch] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('clients_search') || ''
    return ''
  })
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [statutFilter, setStatutFilter] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('clients_statut') || 'all'
    return 'all'
  })
  const [page, setPage] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(sessionStorage.getItem('clients_page') || '1')
    return 1
  })
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map' | 'split'>(() => {
    if (typeof window !== 'undefined') return (sessionStorage.getItem('clients_view') as any) || 'grid'
    return 'grid'
  })
  const [cantonFilter, setCantonFilter] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('clients_canton') || ''
    return ''
  })
  const [sortOrder, setSortOrder] = useState<'recent' | 'az' | 'za'>('recent')
  // v1.9.119 — Mode split : id du client mis en focus sur la carte (zoom + popup)
  const [focusedClientId, setFocusedClientId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showProspectionModal, setShowProspectionModal] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const clientsLastSeen = getClientLastSeen()
  const [filterVille, setFilterVille] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('clients_ville') || ''
    return ''
  })
  const [filterNPA, setFilterNPA] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('clients_npa') || ''
    return ''
  })
  const [filterAvecContacts, setFilterAvecContacts] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('clients_contacts') || ''
  })
  // v1.9.114 — Filtre date d'ajout (range)
  const [filterCreatedAfter, setFilterCreatedAfter] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('clients_created_after') || ''
  })
  const [filterCreatedBefore, setFilterCreatedBefore] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('clients_created_before') || ''
  })
  // v1.9.114 — Dropdown secteurs ouvert/fermé
  const [secteursDropdownOpen, setSecteursDropdownOpen] = useState(false)
  // v1.9.114 — perPage configurable (20 / 50 / 100 / 1000 / Tous=0)
  const [perPage, setPerPage] = useState<number>(() => {
    if (typeof window === 'undefined') return 20
    return parseInt(sessionStorage.getItem('clients_per_page') || '20')
  })
  // v1.9.114 — Filtre secteurs (multi-select avec persistance sessionStorage)
  const [filterSecteurs, setFilterSecteurs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = sessionStorage.getItem('clients_secteurs_filter')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  // Persist all filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('clients_search', search)
    sessionStorage.setItem('clients_statut', statutFilter)
    sessionStorage.setItem('clients_page', String(page))
    sessionStorage.setItem('clients_view', viewMode)
    sessionStorage.setItem('clients_canton', cantonFilter)
    sessionStorage.setItem('clients_ville', filterVille)
    sessionStorage.setItem('clients_npa', filterNPA)
    sessionStorage.setItem('clients_secteurs_filter', JSON.stringify(filterSecteurs))
    sessionStorage.setItem('clients_contacts', filterAvecContacts)
    sessionStorage.setItem('clients_created_after', filterCreatedAfter)
    sessionStorage.setItem('clients_created_before', filterCreatedBefore)
    sessionStorage.setItem('clients_per_page', String(perPage))
  }, [search, statutFilter, page, viewMode, cantonFilter, filterVille, filterNPA, filterSecteurs, filterAvecContacts, filterCreatedAfter, filterCreatedBefore, perPage])

  // Debounce search — v1.9.116 : ne reset PAS la page au premier mount,
  // sinon la page restaurée depuis sessionStorage est écrasée à 1 (perte de paging au retour fiche).
  const isFirstSearchRun = useRef(true)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (isFirstSearchRun.current) {
        isFirstSearchRun.current = false
        return
      }
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Restaurer position scroll au retour (depuis fiche client OU autre page)
  useEffect(() => {
    const saved = sessionStorage.getItem('clients_scroll')
    if (!saved) return
    const y = parseInt(saved, 10)
    setTimeout(() => {
      const container = document.querySelector('.d-content') as HTMLElement | null
      if (container) container.scrollTop = y
      else window.scrollTo(0, y)
    }, 100)
  }, [])

  // Sauvegarde continue de la position scroll (debounced)
  useEffect(() => {
    const container = document.querySelector('.d-content') as HTMLElement | null
    if (!container) return
    let t: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        sessionStorage.setItem('clients_scroll', String(container.scrollTop))
      }, 150)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (t) clearTimeout(t)
      container.removeEventListener('scroll', onScroll)
    }
  }, [])

  const { data, isLoading, isFetching } = useClients({
    search: debouncedSearch,
    statut: statutFilter,
    canton: cantonFilter,
    secteurs: filterSecteurs,
    ville: filterVille,
    npa: filterNPA,
    contacts: filterAvecContacts as 'avec' | 'sans' | '',
    created_after: filterCreatedAfter,
    created_before: filterCreatedBefore,
    page,
    per_page: perPage,
  })

  // v1.9.118 — Fetch dédié pour la carte (sans pagination, mêmes filtres)
  const showMap = viewMode === 'map' || viewMode === 'split'
  const { data: mapData } = useClients({
    search: debouncedSearch,
    statut: statutFilter,
    canton: cantonFilter,
    secteurs: filterSecteurs,
    ville: filterVille,
    npa: filterNPA,
    contacts: filterAvecContacts as 'avec' | 'sans' | '',
    created_after: filterCreatedAfter,
    created_before: filterCreatedBefore,
    page: 1,
    per_page: 5000,
  }, { enabled: showMap })

  const createClient = useCreateClient()
  const { data: secteursStats } = useSecteursStats()
  const { getColorForMetier } = useMetierCategories()
  const getSecteurColor = makeSecteurColors(getColorForMetier)

  // v1.9.114 — Ordre canonique (groupé par catégorie métier), pas par fréquence.
  // Le count en stats reste affiché à côté de chaque entrée du dropdown.
  const secteursOrdered = [...SECTEURS_ACTIVITE]
  const secteursCountMap = new Map<string, number>((secteursStats || []).map(s => [s.secteur, s.count]))

  const clients = data?.clients || []
  const total = data?.total || 0
  const totalPages = data?.total_pages || 1

  return (
    <div className="d-page" style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={22} color="var(--primary)" />Clients
          </h1>
          <p className="d-page-sub">
            {total.toLocaleString('fr-CH')} entreprise{total !== 1 ? 's' : ''} trouvée{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setShowProspectionModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 40, padding: '0 16px', borderRadius: 10,
              border: '2px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
            title="Générer des emails de prospection en lot via IA"
          >
            <Mail size={15} color="var(--primary)" /> Prospection email
          </button>
          <button onClick={() => setShowCreateModal(true)} className="neo-btn-yellow">
            <Plus size={15} /> Ajouter un client
          </button>
        </div>
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
          {(cantonFilter || filterVille || filterNPA || filterAvecContacts || filterCreatedAfter || filterCreatedBefore || filterSecteurs.length > 0) && (
            <span style={{ background: '#EF4444', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
              {[cantonFilter, filterVille, filterNPA, filterAvecContacts, filterCreatedAfter, filterCreatedBefore].filter(Boolean).length + (filterSecteurs.length > 0 ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as any)}
          style={{
            height: 40, padding: '0 12px', borderRadius: 10,
            border: '2px solid var(--border)', background: 'var(--card)',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          <option value="recent">Plus récents</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </select>

        {/* v1.9.114 — Pagination header : perPage + total + numéros pages */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
          fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-body)',
        }}>
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
            style={{
              fontSize: 13, padding: '8px 10px', borderRadius: 8,
              border: '2px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontWeight: 600,
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={1000}>1000</option>
            <option value={0}>Tous</option>
          </select>
          <span style={{ fontWeight: 500 }}>/ {total.toLocaleString('fr-CH')}</span>
          {totalPages > 1 && (
            <span style={{ fontWeight: 600, marginLeft: 6, color: 'var(--foreground)' }}>
              · Page {page} / {totalPages}
            </span>
          )}
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex', gap: 0, border: '2px solid var(--border)',
          borderRadius: 10, overflow: 'hidden', background: 'var(--card)',
        }}>
          <button onClick={() => setViewMode('grid')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'grid' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'grid' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer', borderRight: '1px solid var(--border)',
          }} title="Vue grille"><LayoutGrid size={16} /></button>
          <button onClick={() => setViewMode('list')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'list' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer', borderRight: '1px solid var(--border)',
          }} title="Vue liste"><List size={16} /></button>
          <button onClick={() => setViewMode('map')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'map' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'map' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer', borderRight: '1px solid var(--border)',
          }} title="Vue carte"><MapIcon size={16} /></button>
          <button onClick={() => setViewMode('split')} style={{
            width: 40, height: 40, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: viewMode === 'split' ? 'var(--primary)' : 'transparent',
            color: viewMode === 'split' ? 'var(--ink)' : 'var(--muted)',
            cursor: 'pointer',
          }} title="Vue partagée (liste + carte)"><Columns size={16} /></button>
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
          {/* v1.9.114 — Secteur (multi-select dropdown style /candidats) */}
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Secteur</label>
            <button
              type="button"
              onClick={() => setSecteursDropdownOpen(v => !v)}
              style={{
                width: '100%', padding: '8px 30px 8px 10px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--secondary)',
                fontSize: 13, color: filterSecteurs.length > 0 ? 'var(--foreground)' : 'var(--muted)',
                fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                textAlign: 'left', cursor: 'pointer', position: 'relative',
                fontWeight: filterSecteurs.length > 0 ? 600 : 500,
              }}
            >
              {filterSecteurs.length === 0
                ? 'Tous'
                : filterSecteurs.length === 1
                  ? filterSecteurs[0]
                  : `${filterSecteurs.length} secteurs`}
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--muted)', fontSize: 10, pointerEvents: 'none',
              }}>▼</span>
            </button>
            {secteursDropdownOpen && (
              <>
                <div
                  onClick={() => setSecteursDropdownOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
                  background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  maxHeight: 320, overflowY: 'auto', padding: '6px 0',
                  minWidth: 240,
                }}>
                  {filterSecteurs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setFilterSecteurs([]); setPage(1) }}
                      style={{
                        width: '100%', padding: '6px 12px', textAlign: 'left',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: 'var(--destructive)', fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        borderBottom: '1px solid var(--border)', marginBottom: 4,
                      }}
                    >
                      ✕ Effacer la sélection ({filterSecteurs.length})
                    </button>
                  )}
                  {secteursOrdered.map(s => {
                    const active = filterSecteurs.includes(s)
                    const count = secteursCountMap.get(s) || 0
                    const c = getSecteurColor(s)
                    return (
                      <label
                        key={s}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 12px', cursor: 'pointer',
                          fontSize: 13, color: active ? c.text : 'var(--muted-foreground)',
                          fontWeight: active ? 700 : 500,
                          fontFamily: 'var(--font-body)',
                          background: active ? c.bg : 'transparent',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => {
                            setFilterSecteurs(prev => active ? prev.filter(x => x !== s) : [...prev, s])
                            setPage(1)
                          }}
                          style={{ accentColor: c.border, cursor: 'pointer' }}
                        />
                        {/* Pastille couleur catégorie */}
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: c.border, flexShrink: 0,
                        }} />
                        <span style={{ flex: 1 }}>{s}</span>
                        {count > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                            background: 'var(--secondary)', padding: '1px 7px', borderRadius: 99,
                          }}>{count}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </>
            )}
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
          {/* v1.9.114 — Date d'ajout (range) */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ajouté après</label>
            <input
              type="date"
              value={filterCreatedAfter}
              onChange={e => { setFilterCreatedAfter(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ajouté avant</label>
            <input
              type="date"
              value={filterCreatedBefore}
              onChange={e => { setFilterCreatedBefore(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={() => {
              setCantonFilter(''); setFilterVille(''); setFilterNPA(''); setFilterAvecContacts(''); setFilterCreatedAfter(''); setFilterCreatedBefore(''); setFilterSecteurs([]); setPage(1)
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

      {/* v1.9.118 — Vue carte / split / liste-grille */}
      {viewMode === 'map' ? (
        <ClientsMap
          clients={(mapData?.clients || []) as any}
          height="calc(100vh - 280px)"
        />
      ) : (
      <div style={{
        display: viewMode === 'split' ? 'grid' : 'block',
        gridTemplateColumns: viewMode === 'split' ? '40% 1fr' : undefined,
        gap: viewMode === 'split' ? 16 : 0,
        alignItems: 'start',
      }}>
      <div>
      {/* Grid of client cards */}
      {isLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '80px 0', gap: 12,
        }}>
          <Loader2 size={24} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>Chargement des clients...</span>
        </div>
      ) : clients.length === 0 ? (
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
          flexDirection: (viewMode === 'list' || viewMode === 'split') ? 'column' : undefined,
          gap: viewMode === 'grid' ? 16 : 8,
        }}>
          {[...clients].sort((a, b) => {
            if (sortOrder === 'az') return (a.nom_entreprise || '').localeCompare(b.nom_entreprise || '', 'fr')
            if (sortOrder === 'za') return (b.nom_entreprise || '').localeCompare(a.nom_entreprise || '', 'fr')
            // v1.9.114 — Recherche active : on respecte l'ORDER BY relevance du RPC
            // (sinon le tri 'recent' par created_at écraserait le score → succursales mal ordonnées).
            if (debouncedSearch && debouncedSearch.trim()) return 0
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          }).map(client => {
            const isNew = clientsLastSeen && client.created_at ? new Date(client.created_at) > new Date(clientsLastSeen) : false
            return (
            <div
              key={client.id}
              onClick={() => {
                // v1.9.119 — En mode split : click card recentre la carte sur le marker
                // (au lieu d'ouvrir la fiche). Ouverture fiche via bouton "Voir fiche" dédié.
                if (viewMode === 'split') {
                  setFocusedClientId(client.id)
                } else {
                  router.push(`/clients/${client.id}`)
                }
              }}
              style={{
                background: 'var(--card)',
                border: focusedClientId === client.id && viewMode === 'split'
                  ? '2px solid var(--primary)'
                  : '2px solid var(--border)',
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
                if (!(focusedClientId === client.id && viewMode === 'split')) {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.borderColor = focusedClientId === client.id && viewMode === 'split'
                  ? 'var(--primary)'
                  : 'var(--border)'
              }}
            >
              {/* Badge "nouveau" */}
              {isNew && (
                <span style={{
                  position: 'absolute', top: 8, left: 8,
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#EF4444', border: '2px solid var(--card)',
                  boxShadow: '0 0 6px rgba(239,68,68,0.5)',
                  animation: 'pulse 2s infinite',
                  zIndex: 2,
                }} />
              )}
              {/* Top: Logo + Name (v1.9.115 — logo auto via logo.dev/Google Favicons) */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10 }}>
                <ClientLogo nom_entreprise={client.nom_entreprise} site_web={client.site_web} size="sm" />
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
              </div>

              {/* v1.9.114 — Status badge "Actif/Désactivé" + secteurs (max 2 + "+X") — TOUS uniformes */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                <span style={{
                  padding: '3px 9px', borderRadius: 6,
                  background: client.statut === 'actif' ? 'rgba(34,197,94,0.15)' : 'var(--secondary)',
                  border: `1px solid ${client.statut === 'actif' ? '#22C55E' : 'var(--border)'}`,
                  fontSize: 11, fontWeight: 700,
                  color: client.statut === 'actif' ? '#15803D' : 'var(--muted-foreground)',
                  lineHeight: 1.4,
                }}>
                  {client.statut === 'actif' ? 'Actif' : 'Désactivé'}
                </span>
                {client.secteurs_activite && client.secteurs_activite.length > 0 && (
                  <>
                    {client.secteurs_activite.slice(0, 2).map(s => {
                      const c = getSecteurColor(s)
                      return (
                        <span key={s} style={{
                          padding: '3px 9px', borderRadius: 6,
                          background: c.bg, border: `1px solid ${c.border}`,
                          fontSize: 11, fontWeight: 700, color: c.text,
                          lineHeight: 1.4,
                        }}>
                          {s}
                        </span>
                      )
                    })}
                    {client.secteurs_activite.length > 2 && (
                      <span style={{
                        padding: '3px 9px', borderRadius: 6,
                        background: 'var(--secondary)', border: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
                        lineHeight: 1.4,
                      }}>
                        +{client.secteurs_activite.length - 2}
                      </span>
                    )}
                  </>
                )}
              </div>

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

              {/* v1.9.119 — Bouton "Voir fiche" en mode split (click card recentre la carte) */}
              {viewMode === 'split' && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    router.push(`/clients/${client.id}`)
                  }}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1.5px solid var(--border)',
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--primary)'
                    e.currentTarget.style.color = 'var(--ink)'
                    e.currentTarget.style.borderColor = 'var(--primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--secondary)'
                    e.currentTarget.style.color = 'var(--foreground)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  Voir la fiche →
                </button>
              )}
            </div>
          )})}
        </div>
      )}

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
      </div>
      {viewMode === 'split' && (
        <div style={{ position: 'sticky', top: 16, height: 'calc(100vh - 240px)' }}>
          <ClientsMap
            clients={(mapData?.clients || []) as any}
            height="100%"
            focusedClientId={focusedClientId}
          />
        </div>
      )}
      </div>
      )}

      {/* Create modal */}
      <CreateClientModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={(data) => createClient.mutate(data as any)}
        onClientAdded={() => createClient.reset()}
      />

      {/* Prospection email en lot (v1.9.112) */}
      <ProspectionModal
        open={showProspectionModal}
        onClose={() => setShowProspectionModal(false)}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
