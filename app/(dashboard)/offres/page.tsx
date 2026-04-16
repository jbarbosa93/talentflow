'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MapPin, Pencil, Trash2, ChevronDown, Check, Send, Sparkles, ExternalLink, Info, Users, Calendar, Clock, Building2, FileText, Briefcase, Upload, Loader2, CheckCircle2, AlertCircle, Languages, Wrench, Search, Globe, Eye, Filter, ArrowUpRight, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOffres, useCreateOffre, useUpdateOffre } from '@/hooks/useOffres'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Offre, OffreStatut } from '@/types/database'
import FranceTravailComposer from '@/components/FranceTravailComposer'
import { useOffresExternes, useOffresATraiterCount, useUpdateOffreExterneStatut, type OffreExterne, type OffreExterneStatut } from '@/hooks/useOffresExternes'

const supabase = createClient()

const STATUT_BADGE: Record<OffreStatut, string> = {
  active:   'neo-badge neo-badge-green',
  pourvue:  'neo-badge neo-badge-blue',
  archivee: 'neo-badge neo-badge-gray',
}
const STATUT_LABELS: Record<OffreStatut, string> = {
  active: 'Active', pourvue: 'Pourvue', archivee: 'Archivée',
}
const STATUTS: OffreStatut[] = ['active', 'pourvue', 'archivee']

function useDeleteOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Commande supprimée')
    },
    onError: () => toast.error('Erreur suppression'),
  })
}

export default function OffresPage() {
  const [activeTab, setActiveTab] = useState<'offres' | 'analyse' | 'facebook' | 'france-travail' | 'externes'>('offres')
  const [showCreate, setShowCreate] = useState(false)
  const [editOffre, setEditOffre] = useState<Offre | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { data: offres, isLoading } = useOffres(true)
  const updateOffre = useUpdateOffre()
  const deleteOffre = useDeleteOffre()

  const handleStatusChange = (id: string, statut: OffreStatut) => {
    updateOffre.mutate({ id, statut })
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', borderRadius: 8, fontFamily: 'inherit',
    color: active ? 'var(--foreground)' : 'var(--muted)',
    background: active ? 'var(--surface)' : 'transparent',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  } as React.CSSProperties)

  // Formater la date d'affichage
  const formatDate = (d: string | null) => {
    if (!d) return null
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 16, scale: 0.98 },
    show: (i: number) => ({
      opacity: 1, y: 0, scale: 1,
      transition: { delay: i * 0.06, type: 'spring' as const, stiffness: 300, damping: 26 },
    }),
  }

  return (
    <div className="d-page">
      <motion.div
        className="d-page-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Briefcase size={22} color="var(--primary)" />Commandes</h1>
          <p className="d-page-sub">{offres?.length || 0} commande{(offres?.length || 0) > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--secondary)', borderRadius: 10, padding: 4, gap: 2 }}>
            <button style={tabStyle(activeTab === 'offres')} onClick={() => setActiveTab('offres')}>
              Commandes
            </button>
            <button style={tabStyle(activeTab === 'analyse')} onClick={() => setActiveTab('analyse')}>
              <Sparkles size={13} />
              Analyser CDC
            </button>
            <button style={tabStyle(activeTab === 'facebook')} onClick={() => setActiveTab('facebook')}>
              <span style={{ fontSize: 13 }}>🌐</span>
              job-room.ch
            </button>
            <button style={tabStyle(activeTab === 'france-travail')} onClick={() => setActiveTab('france-travail')}>
              <span style={{ fontSize: 13 }}>🇫🇷</span>
              France Travail
            </button>
            <button style={tabStyle(activeTab === 'externes')} onClick={() => setActiveTab('externes')}>
              <Globe size={13} />
              Veille offres
            </button>
          </div>
          {activeTab === 'offres' && (
            <button onClick={() => setShowCreate(true)} className="neo-btn-yellow">
              <Plus style={{ width: 15, height: 15 }} />
              Nouvelle commande
            </button>
          )}
        </div>
      </motion.div>

      {activeTab === 'facebook' && <JobRoomComposer offres={offres || []} />}
      {activeTab === 'analyse' && <AnalyseCDC onCommandeCreated={() => setActiveTab('offres')} />}
      {activeTab === 'france-travail' && <FranceTravailComposer />}
      {activeTab === 'externes' && <OffresExternesTab />}
      {activeTab === 'offres' && (<>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 0.5, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              style={{ height: 240, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}
            />
          ))}
        </div>
      ) : offres?.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">📋</div>
          <div className="neo-empty-title">Aucune commande</div>
          <div className="neo-empty-sub">Créez votre première commande via le bouton en haut à droite</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {offres?.map((offre, i) => (
            <motion.div
              key={offre.id}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="show"
              whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="neo-card-soft"
              style={{ padding: 0, position: 'relative' }}
            >
              {/* Top color bar — borderRadius pour ne pas avoir besoin de overflow:hidden */}
              <div style={{
                height: 4,
                borderRadius: '14px 14px 0 0',
                background: offre.statut === 'active' ? 'linear-gradient(90deg, #10B981, #059669)'
                  : offre.statut === 'pourvue' ? 'linear-gradient(90deg, #3B82F6, #2563EB)'
                  : 'linear-gradient(90deg, #94A3B8, #64748B)',
              }} />

              <div style={{ padding: '18px 20px 20px' }}>
                {/* Actions top-right */}
                <div style={{ position: 'absolute', top: 18, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <StatusDropdown
                    current={offre.statut}
                    onSelect={(s) => handleStatusChange(offre.id, s)}
                  />
                  <button
                    onClick={() => setEditOffre(offre)}
                    title="Modifier"
                    className="d-icon-btn"
                    style={{ width: 28, height: 28, borderRadius: 7 }}
                  >
                    <Pencil size={12} />
                  </button>
                  {confirmDelete === offre.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => { deleteOffre.mutate(offre.id); setConfirmDelete(null) }}
                        style={{ fontSize: 10, fontWeight: 700, background: '#DC2626', color: 'white', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                      >Oui</button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{ fontSize: 10, fontWeight: 700, background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                      >Non</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(offre.id)}
                      title="Supprimer"
                      className="d-icon-btn"
                      style={{ width: 28, height: 28, borderRadius: 7 }}
                      onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).removeAttribute('style') }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Client name */}
                {offre.client_nom && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Building2 size={12} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {offre.client_nom}
                    </span>
                  </div>
                )}

                {/* Title */}
                <div style={{ marginBottom: 14, paddingRight: 100 }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>
                    {offre.titre}
                  </h3>
                </div>

                {/* Key info grid */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  {(offre.nb_postes || 0) > 0 && (
                    <span className="neo-badge neo-badge-green" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                      <Users size={12} />
                      {offre.nb_postes} poste{(offre.nb_postes || 0) > 1 ? 's' : ''}
                    </span>
                  )}
                  {offre.date_debut && (
                    <span className="neo-badge neo-badge-blue" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                      <Calendar size={12} />
                      {formatDate(offre.date_debut)}
                    </span>
                  )}
                  {offre.duree_mission && (
                    <span className="neo-badge neo-badge-yellow" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                      <Clock size={12} />
                      {offre.duree_mission}
                    </span>
                  )}
                </div>

                {/* Competences */}
                {offre.competences.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {offre.competences.slice(0, 4).map(c => (
                      <span key={c} className="neo-tag" style={{ fontSize: 10, padding: '3px 10px' }}>{c}</span>
                    ))}
                    {offre.competences.length > 4 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 0' }}>+{offre.competences.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Location + Notes */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  {offre.localisation && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin style={{ width: 11, height: 11 }} />{offre.localisation}
                    </span>
                  )}
                </div>

                {/* Notes preview */}
                {offre.notes && (
                  <div style={{
                    marginTop: 12, padding: '8px 12px',
                    background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <FileText size={10} style={{ color: 'var(--muted)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {offre.notes}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
      </>)}
      {/* end offres tab */}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Nouvelle commande</DialogTitle>
          </DialogHeader>
          <CommandeForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editOffre} onOpenChange={v => { if (!v) setEditOffre(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Modifier la commande</DialogTitle>
          </DialogHeader>
          {editOffre && (
            <CommandeForm
              initial={editOffre}
              onSuccess={() => setEditOffre(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Onglet Offres Externes (Veille) ────────────────────────────────────────

const CANTONS_CH = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU',
  'NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH',
]

const SOURCE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'jobs.ch':    { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  'jobup.ch':   { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  'indeed.ch':  { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
}

const STATUT_TABS: { key: OffreExterneStatut; label: string }[] = [
  { key: 'a_traiter', label: 'A traiter' },
  { key: 'ouverte', label: 'Ouvertes' },
  { key: 'ignoree', label: 'Ignorees' },
]

function OffresExternesTab() {
  const router = useRouter()
  const [statutTab, setStatutTab] = useState<OffreExterneStatut>('a_traiter')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [canton, setCanton] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: aTraiterCount } = useOffresATraiterCount()
  const updateStatut = useUpdateOffreExterneStatut()

  const { data: offres, isLoading } = useOffresExternes({
    statut: statutTab,
    source: source || undefined,
    canton: canton || undefined,
    search: search || undefined,
    hideAgences: true,
  })

  const handleStatutChange = (id: string, newStatut: OffreExterneStatut) => {
    updateStatut.mutate({ id, statut: newStatut }, {
      onSuccess: () => {
        toast.success(newStatut === 'ouverte' ? 'Offre ouverte' : 'Offre ignoree')
      },
    })
  }

  const formatDate = (d: string | null) => {
    if (!d) return null
    try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) } catch { return d }
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
    fontSize: 12, fontWeight: 600, color: 'var(--foreground)', background: 'var(--surface)',
    fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
  }

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: 'none', borderRadius: 7, fontFamily: 'inherit',
    color: active ? 'var(--foreground)' : 'var(--muted)',
    background: active ? 'var(--surface)' : 'transparent',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
    display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
  })

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Sous-onglets statut */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, background: 'var(--secondary)', borderRadius: 9, padding: 3, width: 'fit-content' }}>
        {STATUT_TABS.map(tab => (
          <button key={tab.key} style={subTabStyle(statutTab === tab.key)} onClick={() => setStatutTab(tab.key)}>
            {tab.label}
            {tab.key === 'a_traiter' && typeof aTraiterCount === 'number' && aTraiterCount > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 99, padding: '0 5px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: 1,
              }}>
                {aTraiterCount > 99 ? '99+' : aTraiterCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un poste..."
            style={{
              width: '100%', padding: '7px 12px 7px 32px', border: '1.5px solid var(--border)',
              borderRadius: 8, fontSize: 12, fontFamily: 'inherit', color: 'var(--foreground)',
              background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
          <option value="">Toutes les sources</option>
          <option value="jobs.ch">jobs.ch</option>
          <option value="jobup.ch">jobup.ch</option>
          <option value="indeed.ch">indeed.ch</option>
        </select>
        <select value={canton} onChange={e => setCanton(e.target.value)} style={selectStyle}>
          <option value="">Tous les cantons</option>
          {CANTONS_CH.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {offres && (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto' }}>
            {offres.length} offre{offres.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 0.4, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ height: 180, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}
            />
          ))}
        </div>
      ) : !offres?.length ? (
        <div className="neo-empty">
          <div className="neo-empty-icon"><Globe size={32} /></div>
          <div className="neo-empty-title">
            {statutTab === 'a_traiter' ? 'Aucune offre a traiter' : statutTab === 'ouverte' ? 'Aucune offre ouverte' : 'Aucune offre ignoree'}
          </div>
          <div className="neo-empty-sub">
            {statutTab === 'a_traiter'
              ? 'Les nouvelles offres apparaitront ici apres la prochaine synchronisation.'
              : statutTab === 'ouverte'
              ? 'Ouvrez des offres depuis l\'onglet "A traiter" pour les rendre disponibles au matching.'
              : 'Les offres ignorees ne sont pas proposees au matching.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          <AnimatePresence mode="popLayout">
            {offres.map((offre, i) => {
              const srcColor = SOURCE_COLORS[offre.source] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }
              const isExpanded = expandedId === offre.id
              return (
                <motion.div
                  key={offre.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.03, type: 'spring', stiffness: 300, damping: 26 } }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                  className="neo-card-soft"
                  style={{ padding: 0, cursor: 'pointer', position: 'relative' }}
                  onClick={() => setExpandedId(isExpanded ? null : offre.id)}
                >
                  {/* Color bar par source */}
                  <div style={{
                    height: 3, borderRadius: '14px 14px 0 0',
                    background: offre.source === 'jobs.ch' ? '#3B82F6'
                      : offre.source === 'jobup.ch' ? '#16A34A' : '#EA580C',
                  }} />

                  <div style={{ padding: '14px 16px 16px' }}>
                    {/* Header: source badge + agence + date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: srcColor.bg, color: srcColor.color, border: `1px solid ${srcColor.border}`,
                        letterSpacing: '0.03em',
                      }}>
                        {offre.source}
                      </span>
                      {offre.canton && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                          background: 'var(--secondary)', color: 'var(--muted)', border: '1px solid var(--border)',
                        }}>
                          {offre.canton}
                        </span>
                      )}
                      {offre.date_publication && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                          {formatDate(offre.date_publication)}
                        </span>
                      )}
                    </div>

                    {/* Titre */}
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3, marginBottom: 6 }}>
                      {offre.titre}
                    </h3>

                    {/* Entreprise + lieu */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
                      {offre.entreprise && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={11} />{offre.entreprise}
                        </span>
                      )}
                      {offre.lieu && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={11} />{offre.lieu}
                        </span>
                      )}
                    </div>

                    {/* Taux + salaire + contrat */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {offre.taux_occupation && (
                        <span className="neo-tag" style={{ fontSize: 10, padding: '2px 8px' }}>{offre.taux_occupation}</span>
                      )}
                      {offre.type_contrat && (
                        <span className="neo-tag" style={{ fontSize: 10, padding: '2px 8px' }}>{offre.type_contrat}</span>
                      )}
                      {offre.salaire && (
                        <span className="neo-tag" style={{ fontSize: 10, padding: '2px 8px' }}>{offre.salaire}</span>
                      )}
                    </div>

                    {/* Competences */}
                    {offre.competences?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {offre.competences.slice(0, 4).map(c => (
                          <span key={c} className="neo-tag" style={{ fontSize: 9, padding: '2px 7px', background: 'var(--background)' }}>{c}</span>
                        ))}
                        {offre.competences.length > 4 && (
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{offre.competences.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Description expanded */}
                    <AnimatePresence>
                      {isExpanded && offre.description && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            marginTop: 8, padding: '10px 12px',
                            background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)',
                            fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
                            maxHeight: 200, overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {offre.description.slice(0, 1000)}
                            {offre.description.length > 1000 && '...'}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <a
                        href={offre.url_source}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 700, color: srcColor.color,
                          textDecoration: 'none',
                        }}
                      >
                        Voir l&apos;offre <ArrowUpRight size={12} />
                      </a>
                      <span style={{ flex: 1 }} />
                      {/* Boutons moderation */}
                      {statutTab === 'a_traiter' && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); handleStatutChange(offre.id, 'ouverte') }}
                            disabled={updateStatut.isPending}
                            style={{
                              background: '#10B981', color: '#fff', border: 'none', borderRadius: 6,
                              padding: '5px 12px', fontSize: 11, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <Check size={12} /> Confirmer
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleStatutChange(offre.id, 'ignoree') }}
                            disabled={updateStatut.isPending}
                            style={{
                              background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6,
                              padding: '5px 12px', fontSize: 11, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <X size={12} /> Ignorer
                          </button>
                        </>
                      )}
                      {statutTab === 'ouverte' && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); router.push(`/matching?externe=${offre.id}&from=offres`) }}
                            style={{
                              background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#fff', border: 'none', borderRadius: 6,
                              padding: '5px 12px', fontSize: 11, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                              boxShadow: '0 1px 3px rgba(217,119,6,0.3)',
                            }}
                          >
                            <Zap size={11} /> Matcher
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleStatutChange(offre.id, 'ignoree') }}
                            disabled={updateStatut.isPending}
                            style={{
                              background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6,
                              padding: '4px 10px', fontSize: 10, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <X size={11} /> Ignorer
                          </button>
                        </>
                      )}
                      {statutTab === 'ignoree' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleStatutChange(offre.id, 'ouverte') }}
                          disabled={updateStatut.isPending}
                          style={{
                            background: 'none', color: '#10B981', border: '1px solid #BBF7D0', borderRadius: 6,
                            padding: '4px 10px', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <Check size={11} /> Rouvrir
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : offre.id) }}
                        style={{
                          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                          padding: '4px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                          cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Eye size={11} /> {isExpanded ? 'Reduire' : 'Details'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ─── Analyser Cahier des Charges ─────────────────────────────────────────────

type CDCResult = {
  client_nom: string
  titre: string
  nb_postes: number
  localisation: string
  exp_requise: number
  date_debut: string
  duree_mission: string
  competences: string[]
  formation: string
  langues: string[]
  permis: boolean
  taux_activite: string
  description: string
  notes: string
}

function AnalyseCDC({ onCommandeCreated }: { onCommandeCreated: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CDCResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Editable fields after analysis
  const [edited, setEdited] = useState<CDCResult | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const createOffre = useCreateOffre()

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    color: 'var(--foreground)', background: 'var(--surface)', outline: 'none',
    boxSizing: 'border-box' as const,
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  const handleFile = (f: File) => {
    const name = f.name.toLowerCase()
    const ok = f.type.includes('pdf') || f.type.includes('image') || f.type.includes('wordprocessingml') || f.type.includes('msword') || name.endsWith('.pdf') || name.endsWith('.docx')
    if (!ok) { setError('Format non supporté — utilisez PDF, DOCX ou image (JPG, PNG)'); return }
    setFile(f)
    setResult(null)
    setEdited(null)
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleAnalyse = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/commandes/analyse-cdc', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur analyse')
      setResult(data.commande)
      setEdited(data.commande)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'analyse')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    if (!edited) return
    setSaving(true)
    createOffre.mutate({
      titre: edited.titre,
      type_contrat: edited.duree_mission || 'Mission',
      client_nom: edited.client_nom || undefined,
      nb_postes: edited.nb_postes || 1,
      date_debut: edited.date_debut || undefined,
      duree_mission: edited.duree_mission || undefined,
      description: edited.description || undefined,
      competences: edited.competences,
      localisation: edited.localisation || undefined,
      notes: [
        edited.notes,
        edited.formation ? `Formation requise : ${edited.formation}` : '',
        edited.langues?.length ? `Langues : ${edited.langues.join(', ')}` : '',
        edited.permis ? 'Permis de conduire requis' : '',
        edited.taux_activite ? `Taux d\'activité : ${edited.taux_activite}` : '',
      ].filter(Boolean).join('\n') || undefined,
      exp_requise: edited.exp_requise || 0,
    }, {
      onSuccess: () => { setSaving(false); toast.success('Commande créée avec succès !'); onCommandeCreated() },
      onError: () => { setSaving(false); toast.error('Erreur lors de la création') },
    })
  }

  const set = (k: keyof CDCResult, v: any) => setEdited(prev => prev ? { ...prev, [k]: v } : prev)

  if (result && edited) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #10B981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>Analyse terminée — vérifiez les informations</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {file?.name} · Corrigez si nécessaire puis créez la commande
            </div>
          </div>
          <button onClick={() => { setResult(null); setEdited(null); setFile(null) }}
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Nouvelle analyse
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 780 }}>
          <div>
            <label style={labelStyle}><Building2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nom du client</label>
            <input style={inputStyle} value={edited.client_nom} onChange={e => set('client_nom', e.target.value)} placeholder="Entreprise cliente" />
          </div>
          <div>
            <label style={labelStyle}>Poste recherché *</label>
            <input style={inputStyle} value={edited.titre} onChange={e => set('titre', e.target.value)} placeholder="Intitulé du poste" />
          </div>
          <div>
            <label style={labelStyle}><MapPin size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Localisation</label>
            <input style={inputStyle} value={edited.localisation} onChange={e => set('localisation', e.target.value)} placeholder="Ville, Canton" />
          </div>
          <div>
            <label style={labelStyle}><Users size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nb de postes</label>
            <input style={inputStyle} type="number" min={1} value={edited.nb_postes} onChange={e => set('nb_postes', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label style={labelStyle}><Calendar size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Date de début</label>
            <input style={inputStyle} type="date" value={edited.date_debut} onChange={e => set('date_debut', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}><Clock size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Durée / Type contrat</label>
            <input style={inputStyle} value={edited.duree_mission} onChange={e => set('duree_mission', e.target.value)} placeholder="CDI, Temporaire, 3 mois..." />
          </div>
          <div>
            <label style={labelStyle}>Expérience requise (ans)</label>
            <input style={inputStyle} type="number" min={0} value={edited.exp_requise} onChange={e => set('exp_requise', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label style={labelStyle}>Taux d&apos;activité</label>
            <input style={inputStyle} value={edited.taux_activite} onChange={e => set('taux_activite', e.target.value)} placeholder="100%" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}><Wrench size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Compétences requises (séparées par virgule)</label>
            <input style={inputStyle} value={edited.competences.join(', ')} onChange={e => set('competences', e.target.value.split(',').map(c => c.trim()).filter(Boolean))} placeholder="CFC maçon, Coffrage, Banche..." />
          </div>
          <div>
            <label style={labelStyle}>Formation requise</label>
            <input style={inputStyle} value={edited.formation} onChange={e => set('formation', e.target.value)} placeholder="CFC, Bachelor, Master..." />
          </div>
          <div>
            <label style={labelStyle}><Languages size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Langues (séparées par virgule)</label>
            <input style={inputStyle} value={edited.langues.join(', ')} onChange={e => set('langues', e.target.value.split(',').map(l => l.trim()).filter(Boolean))} placeholder="Français, Allemand..." />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description du poste</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={edited.description} onChange={e => set('description', e.target.value)} placeholder="Description des missions..." />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}><FileText size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Notes internes</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={edited.notes} onChange={e => set('notes', e.target.value)} placeholder="Conditions, contact client, salaire..." />
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button
            onClick={handleCreate}
            disabled={!edited.titre || saving}
            className="neo-btn-yellow"
          >
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Création...</> : <><Plus size={14} /> Créer la commande</>}
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Analyser un Cahier des Charges</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Importez un PDF ou une image de cahier des charges, description de poste ou appel d&apos;offres.
          Claude IA extrait automatiquement toutes les informations pour créer une commande.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#10B981' : file ? '#10B981' : 'var(--border)'}`,
          borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
          background: isDragging ? 'rgba(16,185,129,0.04)' : file ? 'rgba(16,185,129,0.02)' : 'var(--surface)',
          transition: 'all 0.2s',
        }}
      >
        <input ref={fileRef} type="file" accept=".pdf,.docx,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {file ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={24} color="#10B981" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>{file.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(file.size / 1024).toFixed(0)} KB · Cliquez pour changer</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={24} style={{ color: 'var(--muted)' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>Glissez un fichier ici ou cliquez pour choisir</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>PDF, DOCX, JPG, PNG · Cahier des charges, description de poste, appel d&apos;offres</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {file && !loading && (
        <button onClick={handleAnalyse} className="neo-btn-yellow" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
          <Sparkles size={15} />
          Analyser avec Claude IA
        </button>
      )}

      {loading && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--muted)' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          Claude analyse le document... cela prend quelques secondes.
        </div>
      )}
    </motion.div>
  )
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({ current, onSelect }: { current: OffreStatut; onSelect: (s: OffreStatut) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={STATUT_BADGE[current] || 'neo-badge neo-badge-gray'}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, border: 'none', fontFamily: 'inherit' }}
      >
        {STATUT_LABELS[current]}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 50,
          background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 110, overflow: 'hidden',
        }}>
          {STATUTS.map(s => (
            <button
              key={s}
              onClick={() => { onSelect(s); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit',
                borderBottom: s !== 'archivee' ? '1px solid var(--border)' : 'none',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--background)'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
            >
              {STATUT_LABELS[s]}
              {current === s && <Check size={12} color="#7A7060" />}
            </button>
          ))}
        </div>
      )}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />}
    </div>
  )
}

// ─── Create / Edit Commande Form ─────────────────────────────────────────────

function CommandeForm({ initial, onSuccess }: { initial?: Offre; onSuccess: () => void }) {
  const [clientNom, setClientNom]       = useState(initial?.client_nom || '')
  const [titre, setTitre]               = useState(initial?.titre || '')
  const [nbPostes, setNbPostes]         = useState(initial?.nb_postes || 1)
  const [dateDebut, setDateDebut]       = useState(initial?.date_debut || '')
  const [dureeMission, setDureeMission] = useState(initial?.duree_mission || '')
  const [competences, setCompetences]   = useState(initial?.competences?.join(', ') || '')
  const [localisation, setLocalisation] = useState(initial?.localisation || '')
  const [notes, setNotes]               = useState(initial?.notes || '')
  const [description, setDescription]   = useState(initial?.description || '')

  const createOffre = useCreateOffre()
  const updateOffre = useUpdateOffre()

  const isEdit = !!initial
  const isPending = createOffre.isPending || updateOffre.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      titre,
      type_contrat: 'Mission',
      statut: 'active' as const,
      client_nom: clientNom || undefined,
      nb_postes: nbPostes || 1,
      date_debut: dateDebut || undefined,
      duree_mission: dureeMission || undefined,
      description: description || undefined,
      competences: competences.split(',').map(c => c.trim()).filter(Boolean),
      localisation: localisation || undefined,
      notes: notes || undefined,
      exp_requise: 0,
    }

    if (isEdit) {
      updateOffre.mutate({ id: initial.id, ...payload }, { onSuccess })
    } else {
      createOffre.mutate(payload, { onSuccess })
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)',
    color: 'var(--foreground)', background: 'var(--surface)', outline: 'none',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)',
    marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}><Building2 size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nom du client</label>
        <input style={inputStyle} value={clientNom} onChange={e => setClientNom(e.target.value)} placeholder="ex: Bouygues Construction" />
      </div>
      <div>
        <label style={labelStyle}>Poste recherché *</label>
        <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Maçon CFC, Électricien..." required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}><Users size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nombre de postes</label>
          <input style={inputStyle} type="number" min={1} value={nbPostes} onChange={e => setNbPostes(parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label style={labelStyle}><Calendar size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Date de début</label>
          <input style={inputStyle} type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}><Clock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Durée de la mission</label>
          <input style={inputStyle} value={dureeMission} onChange={e => setDureeMission(e.target.value)} placeholder="ex: 3 mois, 6 semaines, CDI..." />
        </div>
        <div>
          <label style={labelStyle}><MapPin size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Localisation</label>
          <input style={inputStyle} value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder="Genève, Lausanne..." />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Compétences requises (séparées par virgule)</label>
        <input style={inputStyle} value={competences} onChange={e => setCompetences(e.target.value)} placeholder="Maçonnerie, Coffrage, CFC..." />
      </div>
      <div>
        <label style={labelStyle}>Description du poste</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description détaillée du poste..." />
      </div>
      <div>
        <label style={labelStyle}><FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Notes internes</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes pour les consultants (tarif horaire, contact client, etc.)..." />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="submit" disabled={!titre || isPending} className="neo-btn-yellow">
          {isPending ? 'Sauvegarde...' : isEdit ? 'Enregistrer les modifications' : 'Créer la commande'}
        </button>
      </div>
    </form>
  )
}

// ─── Job-Room Composer ────────────────────────────────────────────────────────

function JobRoomComposer({ offres }: { offres: Offre[] }) {
  const today = new Date().toISOString().split('T')[0]
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const [publishing, setPublishing] = useState(false)
  const [selectedOffre, setSelectedOffre] = useState<string>('')

  // Contact administratif
  const [contactLang, setContactLang] = useState('fr')
  const [contactSal, setContactSal] = useState('MR')
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [contactPhone, setContactPhone] = useState('+41')
  const [contactEmail, setContactEmail] = useState('')

  // Description poste
  const [jobLang, setJobLang] = useState('fr')
  const [jobTitle, setJobTitle] = useState('')
  const [jobDesc, setJobDesc] = useState('')

  // Lieu de travail
  const [locPostal, setLocPostal] = useState('')
  const [locCity, setLocCity] = useState('')

  // Emploi
  const [workMin, setWorkMin] = useState('100')
  const [workMax, setWorkMax] = useState('100')
  const [startDate, setStartDate] = useState('')
  const [immediately, setImmediately] = useState(true)
  const [permanent, setPermanent] = useState(true)

  // Profession (AVAM)
  const [avamCode, setAvamCode] = useState('')
  const [avamQuery, setAvamQuery] = useState('')       // texte saisi par l'utilisateur
  const [avamLabel, setAvamLabel] = useState('')       // label affiché après sélection
  const [avamResults, setAvamResults] = useState<{ code: string; label: string }[]>([])
  const [avamOpen, setAvamOpen] = useState(false)
  const [workExp, setWorkExp] = useState('MORE_THAN_1_YEAR')
  const [eduCode, setEduCode] = useState('132')

  // Autocomplete AVAM — recherche dès 2 caractères
  useEffect(() => {
    if (avamQuery.length < 2) { setAvamResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/avam/search?q=${encodeURIComponent(avamQuery)}`)
        if (res.ok) setAvamResults(await res.json())
      } catch { /* silencieux */ }
    }, 200)
    return () => clearTimeout(t)
  }, [avamQuery])

  // Entreprise mandante (client)
  const [employerName, setEmployerName] = useState('')
  const [employerPostal, setEmployerPostal] = useState('')
  const [employerCity, setEmployerCity] = useState('')
  const [showEmployer, setShowEmployer] = useState(false)

  // Canal de candidature
  const [applyEmail, setApplyEmail] = useState('')
  const [applyPhone, setApplyPhone] = useState('')
  const [applyForm, setApplyForm] = useState('')

  // Publication
  const [pubStart, setPubStart] = useState(today)
  const [pubEnd, setPubEnd] = useState(in60)
  const [eures, setEures] = useState(false)
  const [publicDisplay, setPublicDisplay] = useState(true)
  const [reportToAvam, setReportToAvam] = useState(false)

  // Informations générales
  const [numberOfJobs, setNumberOfJobs] = useState('1')
  const [externalReference, setExternalReference] = useState('')
  const [externalUrl, setExternalUrl] = useState('')

  // Conditions d'emploi complémentaires
  const [shortEmployment, setShortEmployment] = useState(false)

  // Lieu — remarques
  const [locationRemarks, setLocationRemarks] = useState('')

  // Langues requises (max 5)
  const [languageSkills, setLanguageSkills] = useState<{ languageIsoCode: string; spokenLevel: string; writtenLevel: string }[]>([])

  // Contact concernant le poste (publicContact — publié sur Job-Room)
  const [pubContactSal, setPubContactSal] = useState('MR')
  const [pubContactFirst, setPubContactFirst] = useState('')
  const [pubContactLast, setPubContactLast] = useState('')
  const [pubContactPhone, setPubContactPhone] = useState('')
  const [pubContactEmail, setPubContactEmail] = useState('')

  const fillFromOffre = () => {
    const o = offres.find(x => x.id === selectedOffre)
    if (!o) return
    setJobTitle(o.titre || '')
    const desc = [
      o.description || '',
      o.competences?.length ? `## Compétences requises\n${o.competences.map(c => `- ${c}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')
    setJobDesc(desc)
    if (o.localisation) {
      const parts = o.localisation.split(',')
      setLocCity(parts[0].trim())
    }
  }

  const iStyle = {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8,
    fontSize: 13, color: 'var(--foreground)', background: 'var(--surface)', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box' as const,
  }
  const lStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
  const sStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }
  const sTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  const handleSubmit = async () => {
    if (!jobTitle || !jobDesc || !locPostal || !locCity || !avamCode || !contactFirst || !contactLast || !contactEmail || !contactPhone) {
      toast.error('Veuillez remplir tous les champs obligatoires (*)'); return
    }
    if (!applyEmail && !applyPhone && !applyForm) {
      toast.error('Au moins un canal de candidature requis'); return
    }
    setPublishing(true)
    const body = {
      reportToAvam,
      numberOfJobs: parseInt(numberOfJobs) || 1,
      ...(externalReference ? { externalReference } : {}),
      ...(externalUrl ? { externalUrl } : {}),
      contact: { languageIsoCode: contactLang, salutation: contactSal, firstName: contactFirst, lastName: contactLast, phone: contactPhone, email: contactEmail },
      jobDescriptions: [{ languageIsoCode: jobLang, title: jobTitle, description: jobDesc }],
      company: { name: 'L-Agence SA', street: 'Rue du Bourg', houseNumber: '4', postalCode: '1870', city: 'Monthey', countryIsoCode: 'CH', surrogate: showEmployer },
      ...(showEmployer && employerName ? { employer: { name: employerName, postalCode: employerPostal, city: employerCity, countryIsoCode: 'CH' } } : {}),
      employment: { immediately, permanent, shortEmployment, workloadPercentageMin: parseInt(workMin), workloadPercentageMax: parseInt(workMax), ...(startDate && !immediately ? { startDate } : {}), workForms: [] },
      location: { postalCode: locPostal, city: locCity, countryIsoCode: 'CH', remarks: locationRemarks || null },
      occupation: { avamOccupationCode: avamCode, workExperience: workExp, educationCode: eduCode },
      ...(languageSkills.length > 0 ? { languageSkills } : {}),
      applyChannel: { emailAddress: applyEmail || null, phoneNumber: applyPhone || null, formUrl: applyForm || null },
      ...(pubContactFirst && pubContactLast ? { publicContact: { salutation: pubContactSal, firstName: pubContactFirst, lastName: pubContactLast, phone: pubContactPhone || null, email: pubContactEmail || null } } : {}),
      publication: { startDate: pubStart, endDate: pubEnd, euresDisplay: eures, publicDisplay },
    }
    try {
      const res = await fetch('/api/jobroom/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Offre publiée sur job-room.ch !')
    } catch (e: any) {
      toast.error(e.message || 'Erreur de publication')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        {/* Auto-fill */}
        {offres.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select value={selectedOffre} onChange={e => setSelectedOffre(e.target.value)} style={{ ...iStyle, flex: 1 }}>
              <option value="">Importer depuis une commande TalentFlow...</option>
              {offres.map(o => <option key={o.id} value={o.id}>{o.titre}</option>)}
            </select>
            <button onClick={fillFromOffre} disabled={!selectedOffre} className="neo-btn-yellow" style={{ gap: 6, opacity: selectedOffre ? 1 : 0.5 }}>
              <Sparkles size={13} /> Importer
            </button>
          </div>
        )}

        {/* Informations générales */}
        <div style={sStyle}>
          <p style={sTitle}>ℹ️ Informations générales</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Nombre de postes</label>
              <input style={iStyle} type="number" min={1} max={999} value={numberOfJobs} onChange={e => setNumberOfJobs(e.target.value)} placeholder="1" />
            </div>
            <div>
              <label style={lStyle}>Référence interne</label>
              <input style={iStyle} value={externalReference} onChange={e => setExternalReference(e.target.value)} placeholder="ex: 111217.1297" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lStyle}>Lien web de l&apos;annonce</label>
            <input style={iStyle} type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        {/* Description du poste */}
        <div style={sStyle}>
          <p style={sTitle}>📋 Description du poste</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Langue *</label>
              <select value={jobLang} onChange={e => setJobLang(e.target.value)} style={iStyle}>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Titre du poste *</label>
              <input style={iStyle} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="ex: Électricien CFC" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lStyle}>Description (Markdown) *</label>
            <textarea rows={6} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder={'## Missions\n- ...\n\n## Profil\n- ...'} />
          </div>
        </div>

        {/* Lieu de travail */}
        <div style={sStyle}>
          <p style={sTitle}>📍 Lieu de travail</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>NPA *</label>
              <input style={iStyle} value={locPostal} onChange={e => setLocPostal(e.target.value)} placeholder="1870" maxLength={10} />
            </div>
            <div>
              <label style={lStyle}>Ville *</label>
              <input style={iStyle} value={locCity} onChange={e => setLocCity(e.target.value)} placeholder="Monthey" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lStyle}>Détails sur le lieu de travail</label>
            <input style={iStyle} value={locationRemarks} onChange={e => setLocationRemarks(e.target.value)} placeholder="ex: Zone industrielle, bâtiment B, accès par..." />
          </div>
        </div>

        {/* Conditions d'emploi */}
        <div style={sStyle}>
          <p style={sTitle}>⚙️ Conditions d&apos;emploi</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Taux min % *</label>
              <input style={iStyle} type="number" min={10} max={100} value={workMin} onChange={e => setWorkMin(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Taux max % *</label>
              <input style={iStyle} type="number" min={10} max={100} value={workMax} onChange={e => setWorkMax(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={immediately} onChange={e => { setImmediately(e.target.checked); if (e.target.checked) setStartDate('') }} />
              Entrée immédiate
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={permanent} onChange={e => setPermanent(e.target.checked)} />
              CDI (permanent)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={shortEmployment} onChange={e => setShortEmployment(e.target.checked)} />
              Emploi court terme (&le; 14 jours)
            </label>
          </div>
          {!immediately && (
            <div style={{ marginTop: 10 }}>
              <label style={lStyle}>Date d&apos;entrée</label>
              <input style={iStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          )}
        </div>

        {/* Profession */}
        <div style={sStyle}>
          <p style={sTitle}>🎓 Profession (AVAM)</p>
          <div style={{ position: 'relative' }}>
            <label style={lStyle}>Profession * <span style={{ fontWeight: 400, color: 'var(--muted)', textTransform: 'none' }}>— tapez pour rechercher</span></label>
            <input
              style={iStyle}
              value={avamLabel || avamQuery}
              onChange={e => {
                setAvamQuery(e.target.value)
                setAvamLabel('')
                setAvamCode('')
                setAvamOpen(true)
              }}
              onFocus={() => { if (avamQuery.length >= 2) setAvamOpen(true) }}
              onBlur={() => setTimeout(() => setAvamOpen(false), 150)}
              placeholder="ex: Électricien, Maçon, Aide-soignant…"
            />
            {avamCode && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%) translateY(10px)', fontSize: 10, color: 'var(--muted)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                {avamCode}
              </span>
            )}
            {avamOpen && avamResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto',
              }}>
                {avamResults.map(item => (
                  <div
                    key={item.code}
                    onMouseDown={() => {
                      setAvamCode(item.code)
                      setAvamLabel(item.label)
                      setAvamQuery('')
                      setAvamOpen(false)
                    }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: 'var(--foreground)' }}>{item.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{item.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Expérience requise</label>
              <select value={workExp} onChange={e => setWorkExp(e.target.value)} style={iStyle}>
                <option value="LESS_THAN_1_YEAR">Moins d&apos;1 an</option>
                <option value="MORE_THAN_1_YEAR">Plus d&apos;1 an</option>
                <option value="MORE_THAN_3_YEARS">Plus de 3 ans</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Formation</label>
              <select value={eduCode} onChange={e => setEduCode(e.target.value)} style={iStyle}>
                <option value="130">Scolarité obligatoire</option>
                <option value="131">CFC</option>
                <option value="132">Brevet fédéral</option>
                <option value="134">Maturité professionnelle</option>
                <option value="150">Diplôme ES</option>
                <option value="170">Bachelor HES</option>
                <option value="171">Bachelor Université</option>
                <option value="173">Master Université</option>
                <option value="180">Doctorat</option>
              </select>
            </div>
          </div>
        </div>

        {/* Langues requises */}
        <div style={sStyle}>
          <p style={sTitle}>🌐 Langues requises <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', color: 'var(--muted)' }}>— optionnel, max 5</span></p>
          {languageSkills.map((ls, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div>
                {i === 0 && <label style={lStyle}>Langue</label>}
                <select value={ls.languageIsoCode} onChange={e => setLanguageSkills(prev => prev.map((x, j) => j === i ? { ...x, languageIsoCode: e.target.value } : x))} style={iStyle}>
                  <option value="fr">Français</option>
                  <option value="de">Allemand</option>
                  <option value="it">Italien</option>
                  <option value="en">Anglais</option>
                  <option value="es">Espagnol</option>
                  <option value="pt">Portugais</option>
                  <option value="ar">Arabe</option>
                  <option value="zh">Chinois</option>
                  <option value="nl">Néerlandais</option>
                  <option value="pl">Polonais</option>
                </select>
              </div>
              <div>
                {i === 0 && <label style={lStyle}>Niveau oral</label>}
                <select value={ls.spokenLevel} onChange={e => setLanguageSkills(prev => prev.map((x, j) => j === i ? { ...x, spokenLevel: e.target.value } : x))} style={iStyle}>
                  <option value="NONE">Aucun</option>
                  <option value="BASIC">Élémentaire</option>
                  <option value="INTERMEDIATE">Intermédiaire</option>
                  <option value="PROFICIENT">Courant</option>
                </select>
              </div>
              <div>
                {i === 0 && <label style={lStyle}>Niveau écrit</label>}
                <select value={ls.writtenLevel} onChange={e => setLanguageSkills(prev => prev.map((x, j) => j === i ? { ...x, writtenLevel: e.target.value } : x))} style={iStyle}>
                  <option value="NONE">Aucun</option>
                  <option value="BASIC">Élémentaire</option>
                  <option value="INTERMEDIATE">Intermédiaire</option>
                  <option value="PROFICIENT">Courant</option>
                </select>
              </div>
              <button onClick={() => setLanguageSkills(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--muted)', padding: '6px 8px', fontSize: 13 }}>✕</button>
            </div>
          ))}
          {languageSkills.length < 5 && (
            <button onClick={() => setLanguageSkills(prev => [...prev, { languageIsoCode: 'fr', spokenLevel: 'PROFICIENT', writtenLevel: 'INTERMEDIATE' }])} style={{ fontSize: 12, color: 'var(--primary-text, #1C1A14)', background: 'var(--primary)', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 700 }}>
              + Ajouter une langue
            </button>
          )}
        </div>

        {/* Entreprise mandante */}
        <div style={sStyle}>
          <p style={{ ...sTitle, marginBottom: 10 }}>🏢 Entreprise mandante (client)</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: showEmployer ? 12 : 0 }}>
            <input type="checkbox" checked={showEmployer} onChange={e => setShowEmployer(e.target.checked)} />
            Publier au nom d&apos;un client (agence de placement)
          </label>
          {showEmployer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={lStyle}>Nom de l&apos;entreprise *</label>
                <input style={iStyle} value={employerName} onChange={e => setEmployerName(e.target.value)} placeholder="Nom du client" />
              </div>
              <div style={grid2}>
                <div>
                  <label style={lStyle}>NPA *</label>
                  <input style={iStyle} value={employerPostal} onChange={e => setEmployerPostal(e.target.value)} placeholder="1200" />
                </div>
                <div>
                  <label style={lStyle}>Ville *</label>
                  <input style={iStyle} value={employerCity} onChange={e => setEmployerCity(e.target.value)} placeholder="Genève" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contact administratif */}
        <div style={sStyle}>
          <p style={sTitle}>👤 Contact administratif (notifications SECO)</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Prénom *</label>
              <input style={iStyle} value={contactFirst} onChange={e => setContactFirst(e.target.value)} placeholder="João" />
            </div>
            <div>
              <label style={lStyle}>Nom *</label>
              <input style={iStyle} value={contactLast} onChange={e => setContactLast(e.target.value)} placeholder="Barbosa" />
            </div>
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Téléphone * (+41...)</label>
              <input style={iStyle} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+41791234567" />
            </div>
            <div>
              <label style={lStyle}>Email *</label>
              <input style={iStyle} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contact@lagence.ch" />
            </div>
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Civilité</label>
              <select value={contactSal} onChange={e => setContactSal(e.target.value)} style={iStyle}>
                <option value="MR">M.</option>
                <option value="MS">Mme</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Langue communication</label>
              <select value={contactLang} onChange={e => setContactLang(e.target.value)} style={iStyle}>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact concernant le poste */}
        <div style={sStyle}>
          <p style={sTitle}>👤 Contact concernant le poste <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', color: 'var(--muted)' }}>— publié sur job-room.ch</span></p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Prénom</label>
              <input style={iStyle} value={pubContactFirst} onChange={e => setPubContactFirst(e.target.value)} placeholder="João" />
            </div>
            <div>
              <label style={lStyle}>Nom</label>
              <input style={iStyle} value={pubContactLast} onChange={e => setPubContactLast(e.target.value)} placeholder="Barbosa" />
            </div>
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Téléphone</label>
              <input style={iStyle} value={pubContactPhone} onChange={e => setPubContactPhone(e.target.value)} placeholder="+41791234567" />
            </div>
            <div>
              <label style={lStyle}>Email</label>
              <input style={iStyle} type="email" value={pubContactEmail} onChange={e => setPubContactEmail(e.target.value)} placeholder="contact@lagence.ch" />
            </div>
          </div>
          <div style={{ marginTop: 10, maxWidth: 200 }}>
            <label style={lStyle}>Civilité</label>
            <select value={pubContactSal} onChange={e => setPubContactSal(e.target.value)} style={iStyle}>
              <option value="MR">M.</option>
              <option value="MS">Mme</option>
            </select>
          </div>
        </div>

        {/* Canal de candidature */}
        <div style={sStyle}>
          <p style={sTitle}>📩 Canal de candidature (min. 1 requis)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={lStyle}>Email</label>
              <input style={iStyle} type="email" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} placeholder="candidatures@lagence.ch" />
            </div>
            <div>
              <label style={lStyle}>Téléphone</label>
              <input style={iStyle} value={applyPhone} onChange={e => setApplyPhone(e.target.value)} placeholder="+41791234567" />
            </div>
            <div>
              <label style={lStyle}>Formulaire en ligne (URL)</label>
              <input style={iStyle} value={applyForm} onChange={e => setApplyForm(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Publication */}
        <div style={sStyle}>
          <p style={sTitle}>📅 Publication</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Date début *</label>
              <input style={iStyle} type="date" value={pubStart} onChange={e => setPubStart(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Date fin (max 60j)</label>
              <input style={iStyle} type="date" value={pubEnd} onChange={e => setPubEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={publicDisplay} onChange={e => setPublicDisplay(e.target.checked)} />
              Visible publiquement
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={eures} onChange={e => setEures(e.target.checked)} />
              Publier sur EURES (Europe)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={reportToAvam} onChange={e => setReportToAvam(e.target.checked)} />
              Obligation de déclarer (AVAM)
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 8 }}>
          <button onClick={handleSubmit} disabled={publishing} className="neo-btn-yellow" style={{ gap: 8, padding: '10px 24px', fontSize: 14 }}>
            <Send size={14} />
            {publishing ? 'Publication en cours...' : 'Publier sur job-room.ch'}
          </button>
        </div>
      </div>

      {/* Sidebar info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={13} /> job-room.ch
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
            Portail officiel de la Confédération (SECO). Gratuit. Satisfait l&apos;obligation légale de déclaration des postes.
          </p>
          <a href="https://www.job-room.ch" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
            Voir job-room.ch <ExternalLink size={10} />
          </a>
        </div>

        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(245,167,35,0.35)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', margin: '0 0 8px' }}>⚙️ Accès API requis</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
            Envoyez un email à :<br/>
            <strong style={{ color: 'var(--foreground)' }}>jobroom-api@seco.admin.ch</strong><br/>
            Objet : &quot;Job-Room API access&quot;<br/>
            Contenu : nom entreprise, adresse, contact technique, volume mensuel estimé.
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
            Puis ajoutez dans <code style={{ background: 'var(--background)', padding: '0 4px', borderRadius: 4 }}>.env.local</code> :<br/>
            <code style={{ fontSize: 10, color: 'var(--primary)' }}>JOBROOM_USERNAME=...</code><br/>
            <code style={{ fontSize: 10, color: 'var(--primary)' }}>JOBROOM_PASSWORD=...</code>
          </p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1.5px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', margin: '0 0 8px' }}>📌 Statuts de publication</p>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.9 }}>
            <div><span style={{ fontWeight: 700, color: '#818CF8' }}>INSPECTING</span> — En validation AVAM</div>
            <div><span style={{ fontWeight: 700, color: '#818CF8' }}>PUBLISHED_RESTRICTED</span> — 5j réservé aux inscrits</div>
            <div><span style={{ fontWeight: 700, color: '#818CF8' }}>PUBLISHED_PUBLIC</span> — Visible publiquement</div>
          </div>
        </div>
      </div>
    </div>
  )
}
