'use client'
import { detectAndFormat } from '@/lib/phone-format'
import { useState, useEffect } from 'react'
import { History, ChevronDown, ChevronUp, ArrowLeft, Sparkles, Trash2, RotateCcw, ArrowRight, Phone, Smartphone, MessageCircle, Mail, X, Users, MessageSquare, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { historyLoad, type MatchHistoryItem } from '@/contexts/MatchingContext'
import { useMatching } from '@/contexts/MatchingContext'

const LS_HISTORY_KEY = 'tf_matching_history'

function scoreColor(score: number) {
  if (score >= 75) return { text: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', label: 'Fort' }
  if (score >= 50) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Moyen' }
  return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Faible' }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toPhone(raw?: string | null) {
  if (!raw) return ''
  let p = raw.replace(/\s/g, '')
  if (p.startsWith('0')) p = '+41' + p.slice(1)
  return p
}

function ScoreBadge({ score }: { score: number }) {
  const c = scoreColor(score)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 40, height: 40, borderRadius: '50%',
      background: c.bg, border: `2.5px solid ${c.border}`,
      fontSize: 14, fontWeight: 900, color: c.text, flexShrink: 0,
    }}>
      {score}
    </span>
  )
}

function Avatar({ candidat }: { candidat: MatchHistoryItem['results'][0]['candidat'] }) {
  const [err, setErr] = useState(false)
  const initiales = `${(candidat.prenom || '')[0] || ''}${(candidat.nom || '')[0] || ''}`.toUpperCase() || '?'
  const show = !!candidat.photo_url && !err
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
      background: show ? 'transparent' : 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
    }}>
      {show
        ? <img src={candidat.photo_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setErr(true)} />
        : initiales
      }
    </div>
  )
}

// ─── ModalAvatar (avec fallback onError) ─────────────────────────────────────
function ModalAvatar({ prenom, nom, photo_url }: { prenom: string | null; nom: string; photo_url: string | null }) {
  const [err, setErr] = useState(false)
  const initiales = `${(prenom || '')[0] || ''}${(nom || '')[0] || ''}`.toUpperCase() || '?'
  const show = !!photo_url && !err
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: show ? 'transparent' : 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
    }}>
      {show
        ? <img src={photo_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setErr(true)} />
        : initiales}
    </div>
  )
}

// ─── ContactBtn ──────────────────────────────────────────────────────────────
function ContactBtn({ href, icon: Icon, label, color, bg, disabled }: {
  href?: string; icon: React.ElementType; label: string; color: string; bg: string; disabled?: boolean
}) {
  const style: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1.5px solid ${disabled ? 'var(--border)' : color + '44'}`,
    background: disabled ? 'var(--secondary)' : bg,
    color: disabled ? 'var(--muted)' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', transition: 'all 0.15s',
    opacity: disabled ? 0.4 : 1,
    flexShrink: 0,
  }
  if (disabled) return <div style={style} title={`${label} — info manquante`}><Icon size={15} /></div>
  return <a href={href} style={style} title={label} target="_blank" rel="noreferrer"><Icon size={15} /></a>
}

// ─── ContactModal ────────────────────────────────────────────────────────────
type HistoryCandidат = MatchHistoryItem['results'][0]['candidat']


function ContactModal({ candidats, onClose }: { candidats: HistoryCandidат[]; onClose: () => void }) {
  const [mode, setMode] = useState<'individuel' | 'sms'>('individuel')
  const [messageText, setMessageText] = useState('')
  const [numCopied, setNumCopied] = useState(false)

  const avecTel = candidats.filter(c => c.telephone)
  const sansTel = candidats.filter(c => !c.telephone)
  const formatted = avecTel.map(c => detectAndFormat(c.telephone!).number)

  const copyNumbers = async () => {
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 2500)
  }

  const openMessages = async () => {
    if (formatted.length === 0) return
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 3000)
    const body = encodeURIComponent(messageText || '')
    window.open(`sms:${formatted.length === 1 ? formatted[0] : ''}${body ? `${formatted.length === 1 ? '?' : ''}body=${body}` : ''}`, '_self')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 20,
          width: '100%', maxWidth: 580, maxHeight: '85vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>
                Contacter {candidats.length} candidat{candidats.length > 1 ? 's' : ''}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                {mode === 'individuel' ? 'Choisissez le moyen de contact pour chaque candidat' : `${avecTel.length} candidat${avecTel.length > 1 ? 's' : ''} avec numéro de téléphone`}
              </p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <X size={15} />
            </button>
          </div>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['individuel', 'sms'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
                  background: mode === tab ? 'var(--card)' : 'transparent',
                  color: mode === tab ? 'var(--foreground)' : 'var(--muted)',
                  borderBottom: mode === tab ? '2px solid #3B82F6' : '2px solid transparent',
                  fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                }}
              >
                {tab === 'individuel' ? '👤 Par candidat' : '📱 SMS groupé'}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        {mode === 'individuel' ? (
          <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
            {candidats.map(c => {
              const phone = toPhone(c.telephone)
              const waPhone = phone.replace('+', '')
              const greet = encodeURIComponent(`Bonjour ${c.prenom || ''},\n`)
              const hasPhone = !!phone
              const hasEmail = !!c.email
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                  <ModalAvatar prenom={c.prenom} nom={c.nom} photo_url={c.photo_url ?? null} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.prenom} {c.nom}</p>
                    {c.telephone && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>{c.telephone}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ContactBtn href={hasPhone ? `tel:${phone}` : undefined} icon={Phone} label="Appeler" color="#16A34A" bg="rgba(22,163,74,0.1)" disabled={!hasPhone} />
                    <ContactBtn href={hasPhone ? `sms:${phone}?body=${greet}` : undefined} icon={Smartphone} label="SMS" color="#3B82F6" bg="rgba(59,130,246,0.1)" disabled={!hasPhone} />
                    <ContactBtn href={hasPhone ? `whatsapp://send?phone=${waPhone}&text=${greet}` : undefined} icon={MessageCircle} label="WhatsApp" color="#22C55E" bg="rgba(34,197,94,0.1)" disabled={!hasPhone} />
                    <ContactBtn href={hasEmail ? `mailto:${c.email}?subject=${encodeURIComponent(`Opportunité pour ${c.prenom || 'vous'}`)}&body=${greet}` : undefined} icon={Mail} label="E-mail" color="#6366F1" bg="rgba(99,102,241,0.1)" disabled={!hasEmail} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Numéros à coller */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Numéros à coller dans Messages</div>
              <div style={{ position: 'relative' }}>
                <textarea readOnly value={formatted.join('\n')} rows={Math.min(formatted.length, 5)}
                  style={{ width: '100%', padding: '10px 14px', paddingRight: 90, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, border: '1.5px solid var(--border)', borderRadius: 10, resize: 'none', background: '#F8F9FA', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box', lineHeight: 1.8 }}
                  onFocus={e => e.target.select()}
                />
                <button onClick={copyNumbers}
                  style={{ position: 'absolute', right: 8, top: 8, padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: '1.5px solid', borderColor: numCopied ? '#16A34A' : 'var(--border)', background: numCopied ? '#F0FDF4' : 'var(--card)', color: numCopied ? '#16A34A' : 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                  {numCopied ? '✓ Copié' : 'Copier'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                Un numéro par ligne · Ouvrez Messages → champ <strong>À :</strong> → <strong>⌘V</strong>
              </p>
            </div>
            {/* Destinataires */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Destinataires — {avecTel.length} avec numéro</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {avecTel.map(c => {
                  const { number, countryCode, country } = detectAndFormat(c.telephone!)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 6, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#64748B', flexShrink: 0 }}>
                        {((c.prenom||'')[0]||'') + ((c.nom||'')[0]||'')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{c.prenom} {c.nom}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669' }}><Phone size={10} /> {number}</div>
                      </div>
                      {countryCode && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}><span className={`fi fi-${countryCode}`} style={{ width: 18, height: 13, display: 'inline-block', backgroundSize: 'contain', borderRadius: 2 }} />{country}</span>}
                    </div>
                  )
                })}
                {sansTel.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', opacity: 0.8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>
                      {((c.prenom||'')[0]||'') + ((c.nom||'')[0]||'')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{c.prenom} {c.nom}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#D97706' }}><AlertTriangle size={10} /> Pas de numéro — sera ignoré</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Message */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Message</div>
              <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser..."
                rows={4}
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, border: '1.5px solid var(--border)', borderRadius: 10, resize: 'vertical', fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{messageText.length} caractères · Le message sera pré-rempli dans l&apos;app Messages</div>
            </div>
            {/* Boutons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={openMessages} disabled={avecTel.length === 0}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: avecTel.length === 0 ? 'var(--secondary)' : '#007AFF', color: avecTel.length === 0 ? 'var(--muted)' : 'white', fontSize: 13, fontWeight: 700, cursor: avecTel.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: avecTel.length === 0 ? 0.4 : 1 }}>
                <MessageSquare size={14} />Ouvrir Messages
              </button>
            </div>
            {avecTel.length === 0 && <p style={{ fontSize: 12, color: '#D97706', textAlign: 'center', margin: 0 }}>Aucun candidat sélectionné n&apos;a de numéro de téléphone.</p>}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--secondary)', borderRadius: '0 0 20px 20px' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            {mode === 'individuel' ? '📱 SMS / WhatsApp ouvre votre app · 📧 Mail ouvre Outlook si configuré par défaut' : '📱 Les numéros sont copiés dans le presse-papier · Collez dans le champ À : de Messages'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function MatchingHistoriquePage() {
  const [history, setHistory] = useState<MatchHistoryItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showContact, setShowContact] = useState(false)
  const matching = useMatching()
  const router = useRouter()

  useEffect(() => {
    setHistory(historyLoad())
  }, [])

  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    if (expanded === id) setExpanded(null)
    try { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated)) } catch {}
  }

  const clearAll = () => {
    setHistory([])
    setExpanded(null)
    setSelectedIds(new Set())
    try { localStorage.removeItem(LS_HISTORY_KEY) } catch {}
  }

  const relaunch = (item: MatchHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation()
    matching.startAnalysis(item.offreId, item.offreName)
    router.push('/matching')
  }

  const toggleSelect = (candidatId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(candidatId)) next.delete(candidatId)
      else next.add(candidatId)
      return next
    })
  }

  // Récupère les candidats sélectionnés depuis tout l'historique
  const allCandidats = history.flatMap(h => h.results.map(r => r.candidat))
  const selectedCandidats = allCandidats.filter((c, i, arr) =>
    selectedIds.has(c.id) && arr.findIndex(x => x.id === c.id) === i
  )

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: selectedIds.size > 0 ? 100 : 0 }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/matching"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            <ArrowLeft size={14} />Retour
          </Link>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <History size={20} color="var(--primary)" />
              Historique des recherches
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0 0' }}>
              {history.length > 0 ? `${history.length} analyse${history.length > 1 ? 's' : ''} sauvegardée${history.length > 1 ? 's' : ''}` : 'Aucune analyse sauvegardée'}
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearAll}
            style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: 'transparent', border: '1.5px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={14} />Vider l&apos;historique
          </button>
        )}
      </div>

      {/* Empty state */}
      {history.length === 0 && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon" style={{ fontSize: 40 }}>📋</div>
          <div className="neo-empty-title">Aucun historique</div>
          <div className="neo-empty-sub">
            Les analyses terminées ou arrêtées apparaîtront ici automatiquement
          </div>
          <Link href="/matching" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--foreground)', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
            <Sparkles size={16} />Lancer une analyse
          </Link>
        </div>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {history.map(item => {
          const isOpen = expanded === item.id
          return (
            <div
              key={item.id}
              style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}
            >
              {/* En-tête */}
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

                {/* Titre + meta */}
                <div
                  style={{ flex: 1, minWidth: 200, cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <Sparkles size={14} color="#6366F1" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>{item.offreName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>🗓 {formatDate(item.date)}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      📊 {item.totalAnalyzed} analysés
                      {item.totalBase > 0 && <span> / {item.totalBase} en base</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      🏆 {item.results.length} résultat{item.results.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Boutons */}
                <button
                  onClick={(e) => relaunch(item, e)}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#6366F1', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                >
                  <RotateCcw size={13} />Relancer
                </button>
                <button
                  onClick={(e) => deleteItem(item.id, e)}
                  style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.06)', color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700 }}
                >
                  <Trash2 size={13} />Supprimer
                </button>

                {/* Chevron */}
                <div
                  style={{ color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Détail déroulable */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px' }}>

                  {/* Mots-clés */}
                  {item.keywords.length > 0 && (
                    <div style={{ marginBottom: 12, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Mots-clés :</span>
                      {item.keywords.slice(0, 10).map(kw => (
                        <span key={kw} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366F1', fontWeight: 600 }}>{kw}</span>
                      ))}
                    </div>
                  )}

                  {/* Résultats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {item.results.map((r, idx) => {
                      const c = scoreColor(r.score)
                      const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                      const isSelected = selectedIds.has(r.candidat.id)
                      return (
                        <div
                          key={r.candidat.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 12px', borderRadius: 10,
                            background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--secondary)',
                            border: `1px solid ${isSelected ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                            transition: 'all 0.15s',
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.candidat.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: 16, height: 16, accentColor: '#6366F1', cursor: 'pointer', flexShrink: 0 }}
                          />

                          <span style={{ fontSize: rankEmoji ? 16 : 11, fontWeight: 700, color: 'var(--muted)', width: 26, textAlign: 'center', flexShrink: 0 }}>
                            {rankEmoji || `#${idx + 1}`}
                          </span>
                          <Avatar candidat={r.candidat} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.candidat.prenom} {r.candidat.nom}
                            </div>
                            {r.candidat.titre_poste && (
                              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.candidat.titre_poste}</div>
                            )}
                          </div>
                          <ScoreBadge score={r.score} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>
                            {c.label}
                          </span>
                          <Link
                            href={`/candidats/${r.candidat.id}?from=matching`}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            Profil <ArrowRight size={11} />
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Barre flottante sélection */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--foreground)', color: 'white',
          borderRadius: 16, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          zIndex: 100, animation: 'slideUp 0.2s ease',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {selectedIds.size} candidat{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setShowContact(true)}
            style={{
              padding: '8px 18px', borderRadius: 10,
              background: 'var(--primary)', color: '#0F172A',
              border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Phone size={14} />Contacter
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modal contact */}
      {showContact && (
        <ContactModal
          candidats={selectedCandidats}
          onClose={() => setShowContact(false)}
        />
      )}
    </div>
  )
}
