'use client'
// components/MatchingContactModal.tsx — v1.9.82
// Modal "Contacter N candidat(s)" partagé entre /matching et /matching/historique.
// 3 onglets : "Par candidat" / "iMessage groupé" / "WhatsApp groupé".
// Comportement aligné sur CandidatsList.tsx bulk SMS + bulk WhatsApp :
//   - Sélecteur de template (SMS + iMessage + WhatsApp) avec badge canal
//   - Substitution {prenom}/{nom}/{metier}/{civilite} + aliases legacy {candidat_*}
//   - WhatsApp = séquentiel user-driven (1 clic = 1 chat, anti-popup-blocker)
//   - Log fire-and-forget /api/messages/log au 1er clic "Ouvrir" dans les tabs bulk
//   - iMessage bulk : copie des numéros dans le presse-papier
//
// Contrainte : les candidats passés peuvent venir de /matching (plain result) ou
// /matching/historique (HistoryCandidat simplifié) — on accepte un shape minimal.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Phone, Smartphone, MessageCircle, Mail, MessageSquare, ChevronDown } from 'lucide-react'
import { detectAndFormat, toWaPhone } from '@/lib/phone-format'

type ContactCandidat = {
  id: string
  prenom?: string | null
  nom?: string | null
  telephone?: string | null
  email?: string | null
  titre_poste?: string | null
  photo_url?: string | null
}

type Template = {
  id: string
  nom: string
  corps: string
  type?: string // 'sms' | 'imessage' | 'whatsapp'
}

const CANAL_LABEL: Record<string, string> = {
  sms: 'SMS', imessage: 'iMessage', whatsapp: 'WhatsApp',
}
const CANAL_COLOR: Record<string, string> = {
  sms: 'var(--info)', imessage: '#007AFF', whatsapp: '#25D366',
}

function personalize(tpl: string, c: ContactCandidat): string {
  return (tpl || '')
    .replace(/\{prenom\}/gi, c.prenom || '')
    .replace(/\{nom\}/gi, c.nom || '')
    .replace(/\{metier\}/gi, c.titre_poste || '')
    .replace(/\{candidat_prenom\}/gi, c.prenom || '')
    .replace(/\{candidat_nom\}/gi, c.nom || '')
    .replace(/\{candidat_metier\}/gi, c.titre_poste || '')
    .replace(/\{candidat_titre\}/gi, c.titre_poste || '')
}

function newCampagneId(): string {
  return ((globalThis as any).crypto?.randomUUID?.() as string | undefined)
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function MatchingContactModal({
  candidats,
  onClose,
}: {
  candidats: ContactCandidat[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<'individuel' | 'sms' | 'whatsapp'>('individuel')
  const [templates, setTemplates] = useState<Template[]>([])
  const [tplId, setTplId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [showTplDropdown, setShowTplDropdown] = useState(false)
  const [numCopied, setNumCopied] = useState(false)
  const [waOpenedIds, setWaOpenedIds] = useState<Set<string>>(new Set())
  const [logged, setLogged] = useState<Set<string>>(new Set()) // campagne_id déjà logguées
  const [campagneId] = useState<string>(newCampagneId())

  const avecTel = useMemo(() => candidats.filter(c => c.telephone), [candidats])
  const sansTel = useMemo(() => candidats.filter(c => !c.telephone), [candidats])
  const formatted = useMemo(() => avecTel.map(c => detectAndFormat(c.telephone!).number), [avecTel])

  // Charger les 3 types de templates en parallèle
  useEffect(() => {
    let alive = true
    Promise.all(
      ['sms', 'imessage', 'whatsapp'].map(type =>
        fetch(`/api/email-templates?type=${type}`)
          .then(r => r.ok ? r.json() : { templates: [] })
          .catch(() => ({ templates: [] }))
      )
    ).then(results => {
      if (!alive) return
      const all: Template[] = []
      const types = ['sms', 'imessage', 'whatsapp']
      results.forEach((r, i) => {
        for (const t of (r.templates || [])) all.push({ ...t, type: types[i] })
      })
      setTemplates(all)
    })
    return () => { alive = false }
  }, [])

  const selectedTpl = templates.find(t => t.id === tplId) || null

  const applyTemplate = (id: string) => {
    const t = templates.find(x => x.id === id)
    if (!t) return
    setTplId(id)
    setMessageText(t.corps || '')
    setShowTplDropdown(false)
  }

  const clearTemplate = () => {
    setTplId(null)
    setMessageText('')
    setShowTplDropdown(false)
  }

  // Log fire-and-forget, 1 seul appel par canal+campagne
  const logAttempt = (canal: 'imessage' | 'whatsapp' | 'sms', targetCandidats: ContactCandidat[], body: string) => {
    if (logged.has(canal)) return
    if (targetCandidats.length === 0 || !body.trim()) return
    const candidatIds = targetCandidats.map(c => c.id)
    const destinataires = canal === 'whatsapp'
      ? targetCandidats.map(c => toWaPhone(c.telephone || ''))
      : targetCandidats.map(c => detectAndFormat(c.telephone || '').number).filter(Boolean)
    fetch('/api/messages/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        candidat_ids: candidatIds,
        destinataires,
        canal,
        corps: body,
        campagne_id: campagneId,
      }),
    }).catch(() => { /* silent */ })
    setLogged(prev => new Set(prev).add(canal))
  }

  // ─── Onglet "Par candidat" : actions individuelles ────────────────────────
  const openForCandidat = (c: ContactCandidat, canal: 'sms' | 'whatsapp' | 'mail' | 'tel') => {
    const phone = detectAndFormat(c.telephone || '').number || c.telephone || ''
    const waPhone = toWaPhone(c.telephone || '')
    const body = messageText ? personalize(messageText, c) : `Bonjour ${c.prenom || ''},`
    const encBody = encodeURIComponent(body)
    if (canal === 'tel' && phone) {
      window.open(`tel:${phone}`, '_self')
    } else if (canal === 'sms' && phone) {
      logAttempt('imessage', [c], body)
      window.open(`sms:${phone}?body=${encBody}`, '_self')
    } else if (canal === 'whatsapp' && waPhone) {
      logAttempt('whatsapp', [c], body)
      window.open(`whatsapp://send?phone=${waPhone}&text=${encBody}`, '_blank')
    } else if (canal === 'mail' && c.email) {
      const subject = encodeURIComponent(`Opportunité pour ${c.prenom || 'vous'}`)
      window.open(`mailto:${c.email}?subject=${subject}&body=${encBody}`, '_self')
    }
  }

  // ─── Onglet "iMessage groupé" ─────────────────────────────────────────────
  const copyNumbers = async () => {
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 2500)
  }

  const openBulkMessages = async () => {
    if (formatted.length === 0) return
    // Log AVANT ouverture (pattern v1.9.66 — fire-and-forget)
    logAttempt('imessage', avecTel, messageText || '')
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 3000)
    const body = encodeURIComponent(messageText || '')
    window.open(
      `sms:${formatted.length === 1 ? formatted[0] : ''}${body ? `?body=${body}` : ''}`,
      '_self',
    )
  }

  // ─── Onglet "WhatsApp groupé" : séquentiel user-driven ────────────────────
  const nextCandidat = avecTel.find(c => !waOpenedIds.has(c.id))
  const previewCandidat = nextCandidat || avecTel[0]
  const previewMsg = previewCandidat && messageText ? personalize(messageText, previewCandidat) : ''

  const openWhatsApp = (c: ContactCandidat) => {
    const msg = messageText ? personalize(messageText, c) : `Bonjour ${c.prenom || ''},`
    const phone = toWaPhone(c.telephone || '')
    if (!phone) return
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`
    logAttempt('whatsapp', avecTel, messageText || msg)
    window.open(url, '_blank')
    setWaOpenedIds(prev => new Set(prev).add(c.id))
  }

  const openNextWa = () => { if (nextCandidat) openWhatsApp(nextCandidat) }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (typeof window === 'undefined') return null

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 20,
          width: '100%', maxWidth: 640, maxHeight: '90vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>
                Contacter {candidats.length} candidat{candidats.length > 1 ? 's' : ''}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                {tab === 'individuel'
                  ? 'Choisissez le moyen de contact pour chaque candidat'
                  : `${avecTel.length} candidat${avecTel.length > 1 ? 's' : ''} avec numéro de téléphone`}
              </p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <X size={15} />
            </button>
          </div>

          {/* Sélecteur de template — affecte les 3 onglets */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Template (optionnel)
            </div>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowTplDropdown(v => !v)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid var(--border)', background: 'var(--card)',
                  color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selectedTpl ? (
                    <>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                        background: CANAL_COLOR[selectedTpl.type || 'sms'] + '22',
                        color: CANAL_COLOR[selectedTpl.type || 'sms'],
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {CANAL_LABEL[selectedTpl.type || 'sms'] || selectedTpl.type}
                      </span>
                      <span style={{ fontWeight: 600 }}>{selectedTpl.nom}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>Choisir un template…</span>
                  )}
                </span>
                <ChevronDown size={14} color="var(--muted)" />
              </button>
              {showTplDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  maxHeight: 280, overflowY: 'auto', zIndex: 20,
                }}>
                  {templates.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      Aucun template disponible. Créez-en dans Envois → Templates.
                    </div>
                  ) : (
                    <>
                      {tplId && (
                        <button
                          type="button"
                          onClick={clearTemplate}
                          style={{
                            width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                            border: 'none', background: 'transparent', color: 'var(--destructive)',
                            fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--border)',
                            fontFamily: 'inherit',
                          }}
                        >
                          ✕ Retirer le template
                        </button>
                      )}
                      {templates.map(t => {
                        const color = CANAL_COLOR[t.type || 'sms']
                        const label = CANAL_LABEL[t.type || 'sms'] || t.type
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyTemplate(t.id)}
                            style={{
                              width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                              border: 'none', background: tplId === t.id ? 'var(--secondary)' : 'transparent',
                              color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}
                            onMouseEnter={e => { if (tplId !== t.id) e.currentTarget.style.background = 'var(--secondary)' }}
                            onMouseLeave={e => { if (tplId !== t.id) e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{
                              fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                              background: color + '22', color,
                              textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                            }}>
                              {label}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.nom}
                            </span>
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { id: 'individuel' as const, label: 'Par candidat' },
              { id: 'sms' as const, label: 'iMessage groupé' },
              { id: 'whatsapp' as const, label: 'WhatsApp groupé' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
                  background: tab === t.id ? 'var(--card)' : 'transparent',
                  color: tab === t.id ? 'var(--foreground)' : 'var(--muted)',
                  borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        {tab === 'individuel' ? (
          <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, padding: '0 4px' }}>
              {selectedTpl
                ? `Le message du template "${selectedTpl.nom}" sera pré-rempli dans l'app (substitution {prenom}/{nom}/{metier}).`
                : 'Aucun template sélectionné — les apps ouvriront avec un message vide.'}
            </div>
            {candidats.map(c => {
              const phone = detectAndFormat(c.telephone || '').number || c.telephone || ''
              const hasPhone = !!phone
              const hasEmail = !!c.email
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>
                    {((c.prenom || '')[0] || '') + ((c.nom || '')[0] || '')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.prenom} {c.nom}
                    </p>
                    {c.telephone && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>{c.telephone}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ActionBtn icon={Phone} label="Appeler" color="#16A34A" disabled={!hasPhone} onClick={() => openForCandidat(c, 'tel')} />
                    <ActionBtn icon={Smartphone} label="iMessage" color="#007AFF" disabled={!hasPhone} onClick={() => openForCandidat(c, 'sms')} />
                    <ActionBtn icon={MessageCircle} label="WhatsApp" color="#25D366" disabled={!hasPhone} onClick={() => openForCandidat(c, 'whatsapp')} />
                    <ActionBtn icon={Mail} label="E-mail" color="#6366F1" disabled={!hasEmail} onClick={() => openForCandidat(c, 'mail')} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : tab === 'sms' ? (
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Numéros à coller */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Numéros à coller dans Messages
              </div>
              <div style={{ position: 'relative' }}>
                <textarea
                  readOnly
                  value={formatted.join('\n')}
                  rows={Math.min(Math.max(formatted.length, 1), 5)}
                  style={{
                    width: '100%', padding: '10px 90px 10px 14px', fontSize: 13, fontFamily: 'monospace',
                    fontWeight: 600, border: '1.5px solid var(--border)', borderRadius: 10, resize: 'none',
                    background: 'var(--secondary)', color: 'var(--foreground)', outline: 'none',
                    boxSizing: 'border-box', lineHeight: 1.6,
                  }}
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={copyNumbers}
                  style={{
                    position: 'absolute', right: 6, top: 6, padding: '5px 12px', borderRadius: 7,
                    fontSize: 12, fontWeight: 700, border: '1.5px solid',
                    borderColor: numCopied ? 'var(--success)' : 'var(--border)',
                    background: numCopied ? 'var(--success-soft)' : 'var(--card)',
                    color: numCopied ? 'var(--success)' : 'var(--foreground)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {numCopied ? '✓ Copié' : 'Copier'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                Un numéro par ligne · Ouvrez Messages → champ <strong>À :</strong> → <strong>⌘V</strong>
              </p>
            </div>

            {/* Destinataires */}
            {(avecTel.length > 0 || sansTel.length > 0) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Destinataires — {avecTel.length} avec numéro
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
                  {avecTel.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>{c.prenom} {c.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>{detectAndFormat(c.telephone || '').number}</div>
                    </div>
                  ))}
                  {sansTel.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', flex: 1 }}>{c.prenom} {c.nom}</div>
                      <div style={{ fontSize: 10, color: 'var(--warning)' }}>Pas de numéro — ignoré</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Message
              </div>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser…"
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  border: '1.5px solid var(--border)', borderRadius: 10, resize: 'vertical',
                  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {messageText.length} caractères · Le message sera pré-rempli dans Messages
              </div>
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1.5px solid var(--border)', background: 'var(--secondary)',
                  color: 'var(--foreground)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Annuler
              </button>
              <button
                onClick={openBulkMessages}
                disabled={avecTel.length === 0}
                style={{
                  flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                  background: avecTel.length === 0 ? 'var(--secondary)' : '#007AFF',
                  color: avecTel.length === 0 ? 'var(--muted)' : 'white',
                  fontSize: 13, fontWeight: 700,
                  cursor: avecTel.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, opacity: avecTel.length === 0 ? 0.4 : 1,
                }}
              >
                <MessageSquare size={14} /> Ouvrir Messages
              </button>
            </div>
          </div>
        ) : (
          // WhatsApp groupé — séquentiel
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Progression */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--success-soft)', border: '1px solid var(--success)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                {waOpenedIds.size} / {avecTel.length} ouverts
              </div>
              <div style={{ flex: 1, height: 6, background: 'var(--card)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${avecTel.length > 0 ? (waOpenedIds.size / avecTel.length) * 100 : 0}%`,
                  background: '#25D366', transition: 'width 0.25s ease',
                }} />
              </div>
              <button
                onClick={openNextWa}
                disabled={!nextCandidat || !messageText.trim()}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: (!nextCandidat || !messageText.trim()) ? 'var(--secondary)' : '#25D366',
                  color: (!nextCandidat || !messageText.trim()) ? 'var(--muted)' : 'white',
                  fontSize: 12, fontWeight: 700,
                  cursor: (!nextCandidat || !messageText.trim()) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {nextCandidat ? `Suivant (${nextCandidat.prenom || ''} ${nextCandidat.nom || ''})` : '✓ Tous ouverts'}
              </button>
            </div>

            {/* Message */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Message (variables {'{prenom}'} / {'{nom}'} / {'{metier}'} substituées par candidat)
              </div>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="Bonjour {prenom}, nous avons une opportunité…"
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  border: '1.5px solid var(--border)', borderRadius: 10, resize: 'vertical',
                  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {previewMsg && (
                <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--primary-soft)', fontSize: 12, color: 'var(--foreground)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', marginBottom: 3 }}>
                    APERÇU pour {previewCandidat?.prenom} {previewCandidat?.nom}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{previewMsg}</div>
                </div>
              )}
            </div>

            {/* Liste destinataires avec bouton "Ouvrir" par ligne */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Destinataires — {avecTel.length} avec numéro
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                {avecTel.map(c => {
                  const isOpened = waOpenedIds.has(c.id)
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: isOpened ? 'var(--success-soft)' : 'var(--card)',
                        border: `1px solid ${isOpened ? 'var(--success)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
                        {c.prenom} {c.nom}
                        {isOpened && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--success)' }}>✓ Ouvert</span>}
                      </div>
                      <button
                        onClick={() => openWhatsApp(c)}
                        disabled={!messageText.trim()}
                        style={{
                          padding: '5px 12px', borderRadius: 7, border: 'none',
                          background: !messageText.trim() ? 'var(--secondary)' : '#25D366',
                          color: !messageText.trim() ? 'var(--muted)' : 'white',
                          fontSize: 11, fontWeight: 700,
                          cursor: !messageText.trim() ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {isOpened ? 'Rouvrir' : 'Ouvrir'}
                      </button>
                    </div>
                  )
                })}
                {sansTel.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--destructive-soft)', border: '1px solid var(--destructive)', borderRadius: 8, padding: '6px 12px', opacity: 0.7 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', flex: 1 }}>{c.prenom} {c.nom}</div>
                    <div style={{ fontSize: 10, color: 'var(--destructive)' }}>Pas de numéro</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--secondary)' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            {tab === 'individuel'
              ? '📱 SMS/WhatsApp ouvre votre app · 📧 Mail ouvre Outlook si configuré'
              : tab === 'sms'
              ? '📱 Numéros copiés dans presse-papier · Collez dans le champ À : de Messages'
              : '💬 WhatsApp ouvre 1 chat à la fois (anti-blocage navigateur)'}
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function ActionBtn({
  icon: Icon,
  label,
  color,
  disabled,
  onClick,
}: {
  icon: React.ElementType
  label: string
  color: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        width: 34, height: 34, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${disabled ? 'var(--border)' : color + '44'}`,
        background: disabled ? 'var(--secondary)' : color + '12',
        color: disabled ? 'var(--muted)' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon size={15} />
    </button>
  )
}
