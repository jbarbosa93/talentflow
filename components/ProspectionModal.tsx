'use client'
// v1.9.112 — Modal de prospection email en lot depuis /clients
// 3 étapes : (1) sélection clients + contexte, (2) génération streaming, (3) résultats éditables + envoi
//
// Pattern #10 CLAUDE.md : createPortal vers document.body pour échapper aux containing blocks.

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Mail, X, Search, Send, Copy, Check, Loader2, AlertCircle, ChevronLeft, Trash2, Users, Building2 } from 'lucide-react'
import { useClients, type Client } from '@/hooks/useClients'
import { toast } from 'sonner'

const MAX_BATCH = 100

const normalize = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface GeneratedEmail {
  clientId: string
  destinataire: string
  nom_entreprise: string | null
  objet: string
  corps: string
  status: 'pending' | 'generating' | 'done' | 'error' | 'sent' | 'send-error'
  errorMsg?: string
}

type Step = 'config' | 'generate' | 'results'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ProspectionModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('config')

  // ─── Étape 1 : sélection ─────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [secteurFilter, setSecteurFilter] = useState('')
  const [cantonFilter, setCantonFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [contexte, setContexte] = useState('')

  // Charger TOUS les clients filtrés (pas de pagination — comme ClientPickerModal)
  const { data, isLoading } = useClients({ per_page: 2000 })
  const allClients: Client[] = data?.clients || []
  const clientsWithEmail = useMemo(() => allClients.filter(c => !!c.email?.trim()), [allClients])

  // Listes pour filtres
  const secteurs = useMemo(
    () => Array.from(new Set(clientsWithEmail.map(c => c.secteur).filter(Boolean))).sort((a, b) => a!.localeCompare(b!, 'fr')) as string[],
    [clientsWithEmail]
  )
  const cantons = useMemo(
    () => Array.from(new Set(clientsWithEmail.map(c => c.canton).filter(Boolean))).sort() as string[],
    [clientsWithEmail]
  )

  // Filtrage
  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    return clientsWithEmail.filter(c => {
      if (secteurFilter && c.secteur !== secteurFilter) return false
      if (cantonFilter && c.canton !== cantonFilter) return false
      if (!q) return true
      const hay = `${c.nom_entreprise || ''} ${c.secteur || ''} ${c.ville || ''} ${c.canton || ''} ${c.email || ''} ${c.notes || ''}`
      return normalize(hay).includes(q)
    })
  }, [clientsWithEmail, search, secteurFilter, cantonFilter])

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) filtered.forEach(c => next.delete(c.id))
      else filtered.forEach(c => next.add(c.id))
      return next
    })
  }
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Étape 2 : génération ────────────────────────────────────────────
  const [emails, setEmails] = useState<GeneratedEmail[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const startGeneration = async () => {
    if (selected.size === 0) {
      toast.error('Sélectionner au moins un client')
      return
    }
    if (selected.size > MAX_BATCH) {
      const ok = window.confirm(`${selected.size} clients sélectionnés (limite recommandée : ${MAX_BATCH}). Continuer quand même ?`)
      if (!ok) return
    }
    const targets = clientsWithEmail.filter(c => selected.has(c.id))
    setEmails(targets.map(c => ({
      clientId: c.id,
      destinataire: c.email!,
      nom_entreprise: c.nom_entreprise,
      objet: '',
      corps: '',
      status: 'pending',
    })))
    setStep('generate')
    cancelledRef.current = false
    abortRef.current = new AbortController()

    for (let i = 0; i < targets.length; i++) {
      if (cancelledRef.current) break
      const c = targets[i]
      setEmails(prev => prev.map(e => e.clientId === c.id ? { ...e, status: 'generating' } : e))
      try {
        const res = await fetch('/api/clients/prospection/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: c.id, contexte }),
          signal: abortRef.current!.signal,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setEmails(prev => prev.map(e => e.clientId === c.id ? {
            ...e, status: 'error', errorMsg: err.error || `HTTP ${res.status}`,
          } : e))
        } else {
          const data = await res.json()
          setEmails(prev => prev.map(e => e.clientId === c.id ? {
            ...e, status: 'done', objet: data.objet || '', corps: data.corps || '',
          } : e))
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelledRef.current) break
        setEmails(prev => prev.map(e => e.clientId === c.id ? {
          ...e, status: 'error', errorMsg: err?.message || 'Erreur inconnue',
        } : e))
      }
      // Rate-limit léger entre appels
      if (i < targets.length - 1 && !cancelledRef.current) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    if (!cancelledRef.current) setStep('results')
  }

  const cancelGeneration = () => {
    cancelledRef.current = true
    abortRef.current?.abort()
    setStep('results')
  }

  // ─── Étape 3 : résultats / envoi ─────────────────────────────────────
  const [sendingAll, setSendingAll] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const updateEmail = (id: string, patch: Partial<GeneratedEmail>) => {
    setEmails(prev => prev.map(e => e.clientId === id ? { ...e, ...patch } : e))
  }

  const removeEmail = (id: string) => {
    setEmails(prev => prev.filter(e => e.clientId !== id))
  }

  const copyOne = async (e: GeneratedEmail) => {
    const text = `À : ${e.destinataire}\nObjet : ${e.objet}\n\n${e.corps}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(e.clientId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error('Copie impossible')
    }
  }

  const copyAllCsv = async () => {
    const okEmails = emails.filter(e => e.status === 'done' || e.status === 'sent')
    if (okEmails.length === 0) {
      toast.error('Aucun email à copier')
      return
    }
    const escapeCsv = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
    const lines = ['email;objet;corps']
    for (const e of okEmails) {
      // Garder les sauts de ligne dans le corps mais escape les guillemets
      lines.push(`${escapeCsv(e.destinataire)};${escapeCsv(e.objet)};${escapeCsv(e.corps)}`)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success(`${okEmails.length} email${okEmails.length > 1 ? 's' : ''} copiés au format CSV`)
    } catch {
      toast.error('Copie impossible')
    }
  }

  const sendOne = async (e: GeneratedEmail): Promise<boolean> => {
    try {
      const res = await fetch('/api/microsoft/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinataires: [e.destinataire],
          sujet: e.objet,
          corps: e.corps,
          send_mode: 'individual',
          include_signature: true,
          client_id: e.clientId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.error || `HTTP ${res.status}`
        if (res.status === 404 && /Outlook/i.test(msg)) {
          updateEmail(e.clientId, { status: 'send-error', errorMsg: 'Outlook non connecté — voir /integrations' })
        } else {
          updateEmail(e.clientId, { status: 'send-error', errorMsg: msg })
        }
        return false
      }
      updateEmail(e.clientId, { status: 'sent' })
      return true
    } catch (err: any) {
      updateEmail(e.clientId, { status: 'send-error', errorMsg: err?.message || 'Erreur réseau' })
      return false
    }
  }

  const sendAll = async () => {
    const toSend = emails.filter(e => e.status === 'done')
    if (toSend.length === 0) {
      toast.error('Aucun email prêt à envoyer')
      return
    }
    const ok = window.confirm(`Envoyer ${toSend.length} email${toSend.length > 1 ? 's' : ''} via votre compte Outlook ?\n\nCette action est irréversible.`)
    if (!ok) return

    setSendingAll(true)
    let sent = 0, failed = 0
    for (const e of toSend) {
      const success = await sendOne(e)
      if (success) sent++; else failed++
      // 200ms entre envois pour éviter le throttling Graph
      await new Promise(r => setTimeout(r, 200))
    }
    setSendingAll(false)
    if (sent > 0) toast.success(`${sent} email${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}${failed > 0 ? ` (${failed} échec${failed > 1 ? 's' : ''})` : ''}`)
    else toast.error(`${failed} échec${failed > 1 ? 's' : ''} d'envoi`)
  }

  // ─── Reset à la fermeture ────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep('config')
      setSearch(''); setSecteurFilter(''); setCantonFilter('')
      setSelected(new Set())
      setContexte('')
      setEmails([])
      cancelledRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open])

  if (typeof window === 'undefined' || !open) return null

  // ─── Statistiques étape 2/3 ──────────────────────────────────────────
  const stats = {
    total: emails.length,
    done: emails.filter(e => e.status === 'done').length,
    sent: emails.filter(e => e.status === 'sent').length,
    error: emails.filter(e => e.status === 'error').length,
    sendError: emails.filter(e => e.status === 'send-error').length,
    progress: emails.filter(e => e.status === 'done' || e.status === 'sent' || e.status === 'error').length,
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        width: '100%', maxWidth: 920, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1.5px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {step !== 'config' && step !== 'generate' && (
              <button
                onClick={() => setStep('config')}
                style={{
                  background: 'var(--secondary)', border: '1.5px solid var(--border)',
                  borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--foreground)', fontSize: 12, fontWeight: 600,
                }}
                title="Revenir à la configuration"
              >
                <ChevronLeft size={14} /> Retour
              </button>
            )}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--primary-soft)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mail size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                Prospection email en lot
              </h2>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                {step === 'config' && 'Étape 1 / 3 — Sélection des clients'}
                {step === 'generate' && `Étape 2 / 3 — Génération ${stats.progress}/${stats.total}`}
                {step === 'results' && 'Étape 3 / 3 — Résultats'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 4, display: 'flex',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {step === 'config' && (
            <ConfigStep
              isLoading={isLoading}
              clientsWithEmail={clientsWithEmail}
              filtered={filtered}
              search={search} setSearch={setSearch}
              secteurFilter={secteurFilter} setSecteurFilter={setSecteurFilter}
              cantonFilter={cantonFilter} setCantonFilter={setCantonFilter}
              secteurs={secteurs} cantons={cantons}
              selected={selected} toggleOne={toggleOne} toggleAll={toggleAll}
              allFilteredSelected={allFilteredSelected}
              contexte={contexte} setContexte={setContexte}
            />
          )}

          {step === 'generate' && (
            <GenerateStep emails={emails} stats={stats} />
          )}

          {step === 'results' && (
            <ResultsStep
              emails={emails}
              updateEmail={updateEmail}
              removeEmail={removeEmail}
              copyOne={copyOne}
              copiedId={copiedId}
              sendOne={sendOne}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'var(--secondary)',
        }}>
          {step === 'config' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                <strong style={{ color: 'var(--foreground)' }}>{selected.size}</strong> client{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
                {selected.size > MAX_BATCH && (
                  <span style={{ color: 'var(--warning)', fontWeight: 700, marginLeft: 8 }}>
                    ⚠️ &gt; {MAX_BATCH} (limite recommandée)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={btnSecondary}>Annuler</button>
                <button
                  onClick={startGeneration}
                  disabled={selected.size === 0}
                  style={{
                    ...btnPrimary,
                    opacity: selected.size === 0 ? 0.5 : 1,
                    cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Mail size={14} /> Générer {selected.size} email{selected.size > 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {step === 'generate' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                {stats.progress}/{stats.total} — {stats.done} ok, {stats.error} erreur{stats.error > 1 ? 's' : ''}
              </div>
              <button onClick={cancelGeneration} style={{ ...btnSecondary, color: 'var(--destructive)', borderColor: 'var(--destructive)' }}>
                Annuler la génération
              </button>
            </>
          )}

          {step === 'results' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                <strong style={{ color: 'var(--foreground)' }}>{stats.done + stats.sent}</strong> email{(stats.done + stats.sent) > 1 ? 's' : ''} prêt{(stats.done + stats.sent) > 1 ? 's' : ''}
                {stats.sent > 0 && <span style={{ color: 'var(--success)', marginLeft: 8 }}>· {stats.sent} envoyé{stats.sent > 1 ? 's' : ''}</span>}
                {stats.sendError > 0 && <span style={{ color: 'var(--destructive)', marginLeft: 8 }}>· {stats.sendError} échec{stats.sendError > 1 ? 's' : ''}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={copyAllCsv} style={btnSecondary}>
                  <Copy size={14} /> Tout copier (CSV)
                </button>
                <button
                  onClick={sendAll}
                  disabled={sendingAll || stats.done === 0}
                  style={{
                    ...btnPrimary,
                    opacity: (sendingAll || stats.done === 0) ? 0.5 : 1,
                    cursor: (sendingAll || stats.done === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sendingAll ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Envoi en cours...</>
                  ) : (
                    <><Send size={14} /> Tout envoyer via Outlook</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 8, border: 'none',
  background: 'var(--primary)', color: 'var(--primary-foreground)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 8,
  border: '1.5px solid var(--border)', background: 'var(--card)',
  color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

function ConfigStep({
  isLoading, clientsWithEmail, filtered,
  search, setSearch, secteurFilter, setSecteurFilter, cantonFilter, setCantonFilter,
  secteurs, cantons,
  selected, toggleOne, toggleAll, allFilteredSelected,
  contexte, setContexte,
}: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats top */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', background: 'var(--info-soft)',
        border: '1.5px solid var(--info)', borderRadius: 8,
      }}>
        <Building2 size={18} color="var(--info)" />
        <div style={{ fontSize: 13, color: 'var(--foreground)' }}>
          <strong>{clientsWithEmail.length}</strong> client{clientsWithEmail.length > 1 ? 's' : ''} avec email — <strong>{filtered.length}</strong> visible{filtered.length > 1 ? 's' : ''} avec les filtres actuels
        </div>
      </div>

      {/* Recherche + filtres */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 120px', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (nom, secteur, ville...)"
            style={{
              width: '100%', height: 38, padding: '0 32px 0 36px',
              border: '1.5px solid var(--border)', borderRadius: 8,
              background: 'var(--secondary)', color: 'var(--foreground)',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 2, display: 'flex',
            }}><X size={14} /></button>
          )}
        </div>
        <select
          value={secteurFilter}
          onChange={e => setSecteurFilter(e.target.value)}
          style={{
            height: 38, padding: '0 10px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--secondary)',
            color: secteurFilter ? 'var(--foreground)' : 'var(--muted)',
            fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Tous secteurs</option>
          {secteurs.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={cantonFilter}
          onChange={e => setCantonFilter(e.target.value)}
          style={{
            height: 38, padding: '0 10px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--secondary)',
            color: cantonFilter ? 'var(--foreground)' : 'var(--muted)',
            fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Cantons</option>
          {cantons.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Liste clients */}
      <div style={{
        border: '1.5px solid var(--border)', borderRadius: 8,
        maxHeight: 280, overflowY: 'auto',
        background: 'var(--card)',
      }}>
        {/* Toggle all */}
        <div style={{
          padding: '8px 12px', borderBottom: '1.5px solid var(--border)',
          background: 'var(--secondary)',
          display: 'flex', alignItems: 'center', gap: 10,
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            disabled={filtered.length === 0}
            style={{ cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', width: 15, height: 15 }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
            {allFilteredSelected ? 'Tout désélectionner' : 'Sélectionner les visibles'}
            <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, marginLeft: 6 }}>({filtered.length})</span>
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 13, marginTop: 8 }}>Chargement des clients...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <Users size={24} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 13, marginTop: 8 }}>Aucun client avec ces filtres</p>
          </div>
        ) : (
          filtered.map((c: Client) => (
            <label
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected.has(c.id) ? 'var(--primary-soft)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggleOne(c.id)}
                style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.nom_entreprise}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.email} · {[c.ville, c.canton].filter(Boolean).join(', ') || '—'}
                  {c.secteur && ` · ${c.secteur}`}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      {/* Contexte */}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
          Contexte additionnel <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>(optionnel)</span>
        </label>
        <textarea
          value={contexte}
          onChange={e => setContexte(e.target.value)}
          placeholder="Ex : « On a actuellement des maçons disponibles en Valais »"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1.5px solid var(--border)', background: 'var(--secondary)',
            color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
          Injecté dans le prompt IA pour personnaliser tous les emails du batch.
        </p>
      </div>
    </div>
  )
}

function GenerateStep({ emails, stats }: { emails: GeneratedEmail[]; stats: any }) {
  const pct = stats.total > 0 ? Math.round((stats.progress / stats.total) * 100) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barre de progression */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
            {stats.progress} / {stats.total} emails générés
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>{pct}%</span>
        </div>
        <div style={{
          width: '100%', height: 8, borderRadius: 4,
          background: 'var(--secondary)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: 'var(--primary)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Liste statuts */}
      <div style={{
        border: '1.5px solid var(--border)', borderRadius: 8,
        maxHeight: 360, overflowY: 'auto',
      }}>
        {emails.map((e, idx) => (
          <div
            key={e.clientId}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderBottom: idx < emails.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 12,
            }}
          >
            <div style={{ width: 18, flexShrink: 0 }}>
              {e.status === 'pending' && <span style={{ color: 'var(--muted)' }}>·</span>}
              {e.status === 'generating' && <Loader2 size={14} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
              {e.status === 'done' && <Check size={14} color="var(--success)" />}
              {e.status === 'error' && <AlertCircle size={14} color="var(--destructive)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {e.nom_entreprise || e.destinataire}
              </div>
              {e.status === 'done' && (
                <div style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.objet}
                </div>
              )}
              {e.status === 'error' && (
                <div style={{ color: 'var(--destructive)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.errorMsg}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultsStep({
  emails, updateEmail, removeEmail, copyOne, copiedId, sendOne,
}: {
  emails: GeneratedEmail[]
  updateEmail: (id: string, patch: Partial<GeneratedEmail>) => void
  removeEmail: (id: string) => void
  copyOne: (e: GeneratedEmail) => void
  copiedId: string | null
  sendOne: (e: GeneratedEmail) => Promise<boolean>
}) {
  if (emails.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 14 }}>Aucun email généré</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {emails.map((e) => {
        const isError = e.status === 'error'
        const isSent = e.status === 'sent'
        const isSendError = e.status === 'send-error'
        return (
          <div
            key={e.clientId}
            style={{
              border: `1.5px solid ${isError ? 'var(--destructive)' : isSent ? 'var(--success)' : isSendError ? 'var(--warning)' : 'var(--border)'}`,
              borderRadius: 10,
              background: isSent ? 'var(--success-soft)' : isError ? 'var(--destructive-soft)' : isSendError ? 'var(--warning-soft)' : 'var(--card)',
              padding: 14,
            }}
          >
            {/* Header carte */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.nom_entreprise || '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  À : {e.destinataire}
                  {isSent && <span style={{ color: 'var(--success)', fontWeight: 700, marginLeft: 8 }}>✓ Envoyé</span>}
                  {isSendError && <span style={{ color: 'var(--warning)', fontWeight: 700, marginLeft: 8 }}>⚠ {e.errorMsg}</span>}
                  {isError && <span style={{ color: 'var(--destructive)', fontWeight: 700, marginLeft: 8 }}>✗ {e.errorMsg}</span>}
                </div>
              </div>
              {!isError && (
                <>
                  <button onClick={() => copyOne(e)} style={iconBtn} title="Copier">
                    {copiedId === e.clientId ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                  {!isSent && (
                    <button
                      onClick={() => sendOne(e)}
                      style={{ ...iconBtn, color: 'var(--primary)' }}
                      title="Envoyer cet email"
                    >
                      <Send size={14} />
                    </button>
                  )}
                </>
              )}
              <button onClick={() => removeEmail(e.clientId)} style={{ ...iconBtn, color: 'var(--destructive)' }} title="Retirer">
                <Trash2 size={14} />
              </button>
            </div>

            {!isError && (
              <>
                {/* Objet */}
                <input
                  value={e.objet}
                  onChange={ev => updateEmail(e.clientId, { objet: ev.target.value })}
                  placeholder="Objet"
                  disabled={isSent}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6,
                    border: '1.5px solid var(--border)', background: isSent ? 'var(--secondary)' : 'var(--background)',
                    color: 'var(--foreground)', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', outline: 'none', marginBottom: 8, boxSizing: 'border-box',
                  }}
                />
                {/* Corps */}
                <textarea
                  value={e.corps}
                  onChange={ev => updateEmail(e.clientId, { corps: ev.target.value })}
                  placeholder="Corps du mail"
                  disabled={isSent}
                  rows={6}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 6,
                    border: '1.5px solid var(--border)', background: isSent ? 'var(--secondary)' : 'var(--background)',
                    color: 'var(--foreground)', fontSize: 13, lineHeight: 1.5,
                    fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 6,
  border: '1.5px solid var(--border)', background: 'var(--card)',
  color: 'var(--foreground)', cursor: 'pointer', flexShrink: 0,
  fontFamily: 'inherit',
}
