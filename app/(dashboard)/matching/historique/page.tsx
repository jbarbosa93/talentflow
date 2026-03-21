'use client'
import { useState, useEffect } from 'react'
import { History, ChevronDown, ChevronUp, ArrowRight, Sparkles, Trash2, RotateCcw } from 'lucide-react'
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

function ScoreBadge({ score }: { score: number }) {
  const c = scoreColor(score)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 44, height: 44, borderRadius: '50%',
      background: c.bg, border: `2.5px solid ${c.border}`,
      fontSize: 15, fontWeight: 900, color: c.text, flexShrink: 0,
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
      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
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

export default function MatchingHistoriquePage() {
  const [history, setHistory] = useState<MatchHistoryItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const matching = useMatching()
  const router = useRouter()

  useEffect(() => {
    setHistory(historyLoad())
  }, [])

  const deleteItem = (id: string) => {
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    try { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated)) } catch {}
  }

  const clearAll = () => {
    setHistory([])
    try { localStorage.removeItem(LS_HISTORY_KEY) } catch {}
  }

  const relaunch = (item: MatchHistoryItem) => {
    matching.startAnalysis(item.offreId, item.offreName)
    router.push('/matching')
  }

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <History size={22} color="var(--primary)" />
            Historique des recherches
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, margin: '6px 0 0 0' }}>
            Vos dernières analyses de matching IA
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {history.length > 0 && (
            <button
              onClick={clearAll}
              style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: 'transparent', border: '1.5px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} />Vider l&apos;historique
            </button>
          )}
          <Link
            href="/matching"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} />Nouvelle analyse
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {history.length === 0 && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon" style={{ fontSize: 40 }}>📋</div>
          <div className="neo-empty-title">Aucun historique</div>
          <div className="neo-empty-sub">Lancez une analyse de matching pour la retrouver ici</div>
          <Link href="/matching" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--foreground)', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
            <Sparkles size={16} />Lancer une analyse
          </Link>
        </div>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {history.map(item => {
          const isOpen = expanded === item.id
          const top3 = item.results.slice(0, 3)
          return (
            <div
              key={item.id}
              style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}
            >
              {/* En-tête cliquable */}
              <div
                onClick={() => setExpanded(isOpen ? null : item.id)}
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
              >
                {/* Icône + titre */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Sparkles size={15} color="#6366F1" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>{item.offreName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>🗓 {formatDate(item.date)}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      📊 {item.totalAnalyzed} analysés
                      {item.totalBase > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {item.totalBase} en base</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>🏆 {item.results.length} résultats</span>
                  </div>
                </div>

                {/* Aperçu top 3 avatars */}
                <div style={{ display: 'flex', gap: -6 }}>
                  {top3.map((r, i) => (
                    <div key={r.candidat.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i, position: 'relative' }}>
                      <Avatar candidat={r.candidat} />
                    </div>
                  ))}
                </div>

                {/* Boutons relancer + supprimer */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => relaunch(item)}
                    title="Relancer cette analyse"
                    style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                  >
                    <RotateCcw size={12} />Relancer
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    title="Supprimer"
                    style={{ padding: '6px 8px', borderRadius: 7, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.06)', color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Chevron */}
                <div style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Détail déroulable */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>

                  {/* Mots-clés */}
                  {item.keywords.length > 0 && (
                    <div style={{ marginBottom: 14, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Mots-clés :</span>
                      {item.keywords.slice(0, 10).map(kw => (
                        <span key={kw} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366F1', fontWeight: 600 }}>{kw}</span>
                      ))}
                    </div>
                  )}

                  {/* Résultats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {item.results.map((r, idx) => {
                      const c = scoreColor(r.score)
                      const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                      return (
                        <div key={r.candidat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--secondary)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: idx < 3 ? 16 : 12, fontWeight: 700, color: 'var(--muted)', width: 28, textAlign: 'center', flexShrink: 0 }}>{rankEmoji}</span>
                          <Avatar candidat={r.candidat} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                              {r.candidat.prenom} {r.candidat.nom}
                            </div>
                            {r.candidat.titre_poste && (
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.candidat.titre_poste}</div>
                            )}
                          </div>
                          <ScoreBadge score={r.score} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 99, padding: '2px 9px', flexShrink: 0 }}>
                            {c.label}
                          </span>
                          <Link
                            href={`/candidats/${r.candidat.id}`}
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
    </div>
  )
}
