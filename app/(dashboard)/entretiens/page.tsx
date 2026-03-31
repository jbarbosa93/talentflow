'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Plus, Search, X, Bell, BellOff, Calendar, Building2, User,
  Briefcase, Edit3, Trash2, AlertCircle, UserCheck,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { useEntretiens, useCreateEntretien, useUpdateEntretien, useDeleteEntretien } from '@/hooks/useEntretiens'
import { useCandidats } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'

type FormData = {
  candidat_in_system: boolean
  candidat_id: string
  candidat_nom_manuel: string
  entreprise_id: string
  entreprise_nom: string
  poste: string
  date_heure: string
  notes: string
  rappel_date: string
}

const FORM_DEFAULT: FormData = {
  candidat_in_system: true,
  candidat_id: '',
  candidat_nom_manuel: '',
  entreprise_id: '',
  entreprise_nom: '',
  poste: '',
  date_heure: '',
  notes: '',
  rappel_date: '',
}

function useClients() {
  const [clients, setClients] = useState<Array<{ id: string; nom_entreprise: string }>>([])
  useEffect(() => {
    fetch('/api/clients?per_page=0')
      .then(r => r.json())
      .then(d => setClients(d.clients || []))
      .catch(() => {})
  }, [])
  return clients
}

export default function EntretiensPage() {
  const { data: rawEntretiens = [], isLoading } = useEntretiens()
  const { data: candidatsData } = useCandidats({ page: 1, per_page: 10000 })
  const candidats = candidatsData?.candidats || []
  const clients = useClients()
  const createEntretien = useCreateEntretien()
  const updateEntretien = useUpdateEntretien()
  const deleteEntretien = useDeleteEntretien()
  const queryClient = useQueryClient()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(FORM_DEFAULT)

  const [candidatSearch, setCandidatSearch] = useState('')
  const [candidatDropOpen, setCandidatDropOpen] = useState(false)
  const candidatRef = useRef<HTMLDivElement>(null)

  const [clientSearch, setClientSearch] = useState('')
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (candidatRef.current && !candidatRef.current.contains(e.target as Node)) setCandidatDropOpen(false)
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) setClientDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const entretiens = useMemo(() => {
    if (!search.trim()) return rawEntretiens
    const q = search.toLowerCase()
    return rawEntretiens.filter(e => {
      const candidatNom = e.candidats
        ? `${e.candidats.prenom || ''} ${e.candidats.nom}`.toLowerCase()
        : (e.candidat_nom_manuel || '').toLowerCase()
      const entreprise = (e.entreprise_nom || e.clients?.nom_entreprise || '').toLowerCase()
      const poste = (e.poste || '').toLowerCase()
      return candidatNom.includes(q) || entreprise.includes(q) || poste.includes(q)
    })
  }, [rawEntretiens, search])

  const rappelsActifs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return rawEntretiens.filter(e => e.rappel_date && !e.rappel_vu && e.rappel_date <= today).length
  }, [rawEntretiens])

  const getCandidatNom = (e: any) => {
    if (e.candidats) return `${e.candidats.prenom || ''} ${e.candidats.nom}`.trim()
    return e.candidat_nom_manuel || '—'
  }

  const getEntrepriseNom = (e: any) => e.entreprise_nom || e.clients?.nom_entreprise || null

  const filteredCandidats = candidats.filter(c => {
    if (!candidatSearch) return true
    return `${c.prenom || ''} ${c.nom}`.toLowerCase().includes(candidatSearch.toLowerCase())
  }).slice(0, 8)

  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true
    return c.nom_entreprise.toLowerCase().includes(clientSearch.toLowerCase())
  }).slice(0, 8)

  const openCreate = () => {
    setEditingId(null)
    setForm(FORM_DEFAULT)
    setCandidatSearch('')
    setClientSearch('')
    setDrawerOpen(true)
  }

  const openEdit = (e: any) => {
    setEditingId(e.id)
    const dt = e.date_heure ? new Date(e.date_heure).toISOString().slice(0, 16) : ''
    setForm({
      candidat_in_system: !!e.candidat_id,
      candidat_id: e.candidat_id || '',
      candidat_nom_manuel: e.candidat_nom_manuel || '',
      entreprise_id: e.entreprise_id || '',
      entreprise_nom: e.entreprise_nom || e.clients?.nom_entreprise || '',
      poste: e.poste || '',
      date_heure: dt,
      notes: e.notes || '',
      rappel_date: e.rappel_date || '',
    })
    const candidatNom = e.candidats
      ? `${e.candidats.prenom || ''} ${e.candidats.nom}`.trim()
      : (e.candidat_nom_manuel || '')
    setCandidatSearch(candidatNom)
    setClientSearch(e.entreprise_nom || e.clients?.nom_entreprise || '')
    setDrawerOpen(true)
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const payload: Record<string, any> = {
      poste: form.poste.trim() || null,
      date_heure: form.date_heure ? new Date(form.date_heure).toISOString() : null,
      notes: form.notes.trim() || null,
      rappel_date: form.rappel_date || null,
      rappel_vu: false,
    }
    if (form.candidat_in_system && form.candidat_id) {
      payload.candidat_id = form.candidat_id
      payload.candidat_nom_manuel = null
    } else {
      payload.candidat_id = null
      payload.candidat_nom_manuel = form.candidat_nom_manuel.trim() || null
    }
    if (form.entreprise_id) {
      payload.entreprise_id = form.entreprise_id
      payload.entreprise_nom = form.entreprise_nom.trim() || null
    } else {
      payload.entreprise_id = null
      payload.entreprise_nom = form.entreprise_nom.trim() || null
    }

    if (editingId) {
      await updateEntretien.mutateAsync({ id: editingId, ...payload })
    } else {
      await createEntretien.mutateAsync(payload)
    }
    queryClient.invalidateQueries({ queryKey: ['entretiens-rappels-count'] })
    setDrawerOpen(false)
  }

  const handleDelete = async (id: string) => {
    await deleteEntretien.mutateAsync(id)
    queryClient.invalidateQueries({ queryKey: ['entretiens-rappels-count'] })
    setConfirmDelete(null)
  }

  const markRappelVu = async (id: string) => {
    await updateEntretien.mutateAsync({ id, rappel_vu: true })
    queryClient.invalidateQueries({ queryKey: ['entretiens-rappels-count'] })
    toast.success('Rappel marqué comme vu')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Entretiens / Suivi Candidat
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            {rawEntretiens.length} suivi{rawEntretiens.length !== 1 ? 's' : ''}
            {rappelsActifs > 0 && (
              <span style={{ marginLeft: 8, color: '#EF4444', fontWeight: 700 }}>
                · {rappelsActifs} rappel{rappelsActifs > 1 ? 's' : ''} en attente
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'var(--primary)', color: 'var(--primary-foreground)',
            border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          }}
        >
          <Plus size={15} />
          Nouveau suivi
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '16px 24px 0' }}>
        <div style={{ position: 'relative', maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Rechercher par candidat, poste, entreprise…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px 8px 32px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={13} color="var(--muted-foreground)" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted-foreground)', fontSize: 14 }}>Chargement…</div>
        ) : entretiens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted-foreground)' }}>
            <Calendar size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Aucun entretien trouvé</div>
            {search && <div style={{ fontSize: 12, marginTop: 4 }}>Essayez une autre recherche</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AnimatePresence initial={false}>
              {entretiens.map(e => {
                const candidatNom = getCandidatNom(e)
                const entrepriseNom = getEntrepriseNom(e)
                const hasRappel = e.rappel_date && !e.rappel_vu
                const rappelPast = hasRappel && e.rappel_date <= new Date().toISOString().split('T')[0]

                return (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      background: 'var(--card)',
                      border: `1px solid ${rappelPast ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '14px 16px',
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}
                  >
                    {/* Icône candidat */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'var(--secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 2,
                    }}>
                      <User size={16} color="var(--muted-foreground)" />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                          {candidatNom}
                        </span>
                        {hasRappel && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: rappelPast ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: rappelPast ? '#EF4444' : '#F59E0B',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            <Bell size={10} />
                            Rappel {format(parseISO(e.rappel_date), 'd MMM', { locale: fr })}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                        {entrepriseNom && (
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Building2 size={11} />{entrepriseNom}
                          </span>
                        )}
                        {e.poste && (
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Briefcase size={11} />{e.poste}
                          </span>
                        )}
                        {e.date_heure && (
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={11} />
                            {format(parseISO(e.date_heure), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                          </span>
                        )}
                      </div>

                      {e.notes && (
                        <p style={{
                          fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0 0',
                          lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {e.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {rappelPast && (
                        <button onClick={() => markRappelVu(e.id)} title="Marquer rappel comme vu"
                          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', cursor: 'pointer' }}>
                          <BellOff size={13} />
                        </button>
                      )}
                      <button onClick={() => openEdit(e)} title="Modifier"
                        style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setConfirmDelete(e.id)} title="Supprimer"
                        style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)' }} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 401,
                width: 460, maxWidth: '95vw',
                background: 'var(--card)', borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                boxShadow: '-20px 0 60px rgba(0,0,0,0.15)',
              }}
            >
              {/* Drawer header */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
                  {editingId ? 'Modifier le suivi' : 'Nouveau suivi candidat'}
                </h2>
                <button onClick={() => setDrawerOpen(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--muted-foreground)' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Candidat */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>Candidat</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button type="button" onClick={() => { setForm(f => ({ ...f, candidat_in_system: true })); setCandidatSearch('') }}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, background: form.candidat_in_system ? 'var(--primary)' : 'var(--secondary)', color: form.candidat_in_system ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                        <UserCheck size={12} /> Dans le système
                      </button>
                      <button type="button" onClick={() => { setForm(f => ({ ...f, candidat_in_system: false, candidat_id: '' })); setCandidatSearch('') }}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, background: !form.candidat_in_system ? 'var(--primary)' : 'var(--secondary)', color: !form.candidat_in_system ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                        <User size={12} /> Saisie libre
                      </button>
                    </div>
                    {form.candidat_in_system ? (
                      <div ref={candidatRef} style={{ position: 'relative' }}>
                        <input type="text" placeholder="Rechercher un candidat…" value={candidatSearch}
                          onChange={e => { setCandidatSearch(e.target.value); setCandidatDropOpen(true) }}
                          onFocus={() => setCandidatDropOpen(true)}
                          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        {candidatDropOpen && filteredCandidats.length > 0 && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto' }}>
                            {filteredCandidats.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => { setForm(f => ({ ...f, candidat_id: c.id })); setCandidatSearch(`${c.prenom || ''} ${c.nom}`.trim()); setCandidatDropOpen(false) }}
                                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: form.candidat_id === c.id ? 'var(--secondary)' : 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--foreground)', display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{`${c.prenom || ''} ${c.nom}`.trim()}</span>
                                {c.titre_poste && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.titre_poste}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input type="text" placeholder="Nom du candidat…" value={form.candidat_nom_manuel}
                        onChange={e => setForm(f => ({ ...f, candidat_nom_manuel: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    )}
                  </div>

                  {/* Entreprise */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>Entreprise / Client</label>
                    <div ref={clientRef} style={{ position: 'relative' }}>
                      <input type="text" placeholder="Rechercher ou saisir une entreprise…" value={clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setForm(f => ({ ...f, entreprise_nom: e.target.value, entreprise_id: '' })); setClientDropOpen(true) }}
                        onFocus={() => setClientDropOpen(true)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      {clientDropOpen && filteredClients.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                          {filteredClients.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setForm(f => ({ ...f, entreprise_id: c.id, entreprise_nom: c.nom_entreprise })); setClientSearch(c.nom_entreprise); setClientDropOpen(false) }}
                              style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: form.entreprise_id === c.id ? 'var(--secondary)' : 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--foreground)' }}>
                              {c.nom_entreprise}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Poste */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>Poste</label>
                    <input type="text" placeholder="Ex: Responsable RH, Comptable…" value={form.poste}
                      onChange={e => setForm(f => ({ ...f, poste: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* Date */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>Date et heure</label>
                    <input type="datetime-local" value={form.date_heure}
                      onChange={e => setForm(f => ({ ...f, date_heure: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>Notes</label>
                    <textarea placeholder="Remarques, impressions, next steps…" value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      rows={4}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
                  </div>

                  {/* Rappel */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Rappel</label>
                    <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
                      Une notification apparaîtra à la date choisie à l&apos;ouverture de l&apos;app.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="date" value={form.rappel_date}
                        onChange={e => setForm(f => ({ ...f, rappel_date: e.target.value }))}
                        style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, outline: 'none' }} />
                      {form.rappel_date && (
                        <button type="button" onClick={() => setForm(f => ({ ...f, rappel_date: '' }))}
                          style={{ padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--secondary)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setDrawerOpen(false)}
                  style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button onClick={handleSubmit} disabled={createEntretien.isPending || updateEntretien.isPending}
                  style={{ flex: 2, padding: '10px 16px', border: 'none', borderRadius: 10, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (createEntretien.isPending || updateEntretien.isPending) ? 0.6 : 1 }}>
                  {editingId ? 'Enregistrer' : 'Créer le suivi'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm delete */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 501, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 24px 20px', width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <AlertCircle size={20} color="#EF4444" />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>Supprimer ce suivi ?</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>Cette action est irréversible.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmDelete(null)}
                  style={{ flex: 1, padding: '9px 0', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button onClick={() => handleDelete(confirmDelete)} disabled={deleteEntretien.isPending}
                  style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, background: '#EF4444', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleteEntretien.isPending ? 0.6 : 1 }}>
                  Supprimer
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
