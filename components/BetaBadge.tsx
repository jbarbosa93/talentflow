'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { APP_VERSION, APP_ENV, CHANGELOG } from '@/lib/version'
import { X, Bug } from 'lucide-react'
import { toast } from 'sonner'

const SEEN_VERSION_KEY = 'talentflow_seen_version'

function getSeenVersion(): string | null {
  try { return localStorage.getItem(SEEN_VERSION_KEY) } catch { return null }
}

function markVersionSeen() {
  try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION) } catch {}
}

export default function BetaBadge({ inline }: { inline?: boolean }) {
  const [showChangelog, setShowChangelog] = useState(false)
  const [showBugReport, setShowBugReport] = useState(false)
  const [bugText, setBugText] = useState('')
  const [bugSending, setBugSending] = useState(false)
  const [hasNewVersion, setHasNewVersion] = useState(false)

  // Vérifier si l'utilisateur a vu la version actuelle
  useEffect(() => {
    const seen = getSeenVersion()
    if (seen !== APP_VERSION) {
      setHasNewVersion(true)
      // Auto-ouvrir le changelog à la première visite après une MAJ
      setShowChangelog(true)
    }
  }, [])

  // Quand l'utilisateur ferme le changelog, marquer comme vu
  const handleCloseChangelog = () => {
    setShowChangelog(false)
    if (hasNewVersion) {
      markVersionSeen()
      setHasNewVersion(false)
    }
  }

  const handleBugSubmit = async () => {
    if (!bugText.trim()) return
    setBugSending(true)
    try {
      // Envoyer le bug par email
      const bugData = {
        text: bugText.trim(),
        date: new Date().toISOString(),
        version: APP_VERSION,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
      }
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bugData),
      })
      if (!res.ok) throw new Error('Erreur envoi')
      // Aussi sauvegarder en local
      const bugs = JSON.parse(localStorage.getItem('talentflow_bugs') || '[]')
      bugs.push({ id: Date.now(), ...bugData })
      localStorage.setItem('talentflow_bugs', JSON.stringify(bugs))
      toast.success('Bug signalé — email envoyé !')
      setBugText('')
      setShowBugReport(false)
    } catch {
      toast.error('Erreur lors de l\'envoi')
    } finally {
      setBugSending(false)
    }
  }

  const envBadge = (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 8,
      background: APP_ENV === 'beta' ? 'rgba(245,167,35,0.25)' : 'rgba(16,185,129,0.25)',
      color: APP_ENV === 'beta' ? '#F5A723' : '#10B981',
      fontSize: 9,
      fontWeight: 800,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
    }}>
      {APP_ENV}
    </span>
  )

  return (
    <>
      {inline ? (<>
        {/* ── Sidebar inline version (v1.9.127 — couleurs v2 ink translucide) ── */}
        <button
          onClick={() => setShowChangelog(true)}
          style={{
            margin: '6px 10px 0',
            padding: '6px 10px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-3, rgba(28,26,20,0.5))',
            fontSize: 10.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: 'calc(100% - 20px)',
            transition: 'all 0.15s',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={e => {
            // v1.9.128 — hover jaune brand soft (au lieu du gris moche)
            e.currentTarget.style.background = 'rgba(245,166,35,0.10)'
            e.currentTarget.style.color = 'var(--primary, #F5A623)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-3, rgba(28,26,20,0.5))'
          }}
        >
          {envBadge}
          <span style={{ flex: 1 }}>{APP_VERSION}</span>
          {hasNewVersion && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--destructive)', flexShrink: 0,
              animation: 'pulse 2s infinite',
            }} />
          )}
        </button>
        {/* v1.9.127 — bouton "Signaler un bug" supprimé (sert à rien selon João) */}
      </>) : (
        /* ── Floating fixed version (legacy, not used) ── */
        <button
          onClick={() => setShowChangelog(true)}
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 20,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.9)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.95)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
          }}
        >
          {envBadge}
          {APP_VERSION}
        </button>
      )}

      {/* v1.9.127 — Changelog modal V2 (refonte complète : Instrument Serif + Jakarta + tokens dark-aware) */}
      {showChangelog && typeof document !== 'undefined' && createPortal(
        <div
          onClick={handleCloseChangelog}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 720, maxHeight: '88vh',
              background: 'var(--surface, var(--card))',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header V2 — Instrument Serif */}
            <div style={{
              padding: '20px 26px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  fontFamily: 'var(--font-instrument-serif), Georgia, serif',
                  fontSize: 26, fontWeight: 400, color: 'var(--foreground)',
                  margin: 0, lineHeight: 1.15, letterSpacing: '-0.01em',
                }}>
                  Changelog
                </h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
                  Historique des mises à jour TalentFlow
                </p>
              </div>
              <button
                onClick={handleCloseChangelog}
                title="Fermer (Esc)"
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted)',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Content — Timeline V2 (cards par version, dot bordure surface dynamique) */}
            <div style={{ overflowY: 'auto', padding: '18px 26px 24px' }}>
              {CHANGELOG.map((entry, idx) => {
                const isCurrent = idx === 0
                const isLast = idx === CHANGELOG.length - 1
                return (
                  <div key={entry.version} style={{
                    position: 'relative',
                    paddingLeft: 26,
                    paddingBottom: !isLast ? 22 : 0,
                  }}>
                    {/* Timeline ligne verticale (entre les dots) */}
                    {!isLast && (
                      <div style={{
                        position: 'absolute', left: 5, top: 14, bottom: 0,
                        width: 1, background: 'var(--border)',
                      }} />
                    )}
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute', left: 0, top: 4,
                      width: 12, height: 12, borderRadius: '50%',
                      background: isCurrent ? '#F5A623' : 'var(--muted)',
                      border: '2px solid var(--surface, var(--card))',
                      boxShadow: isCurrent ? '0 0 0 3px rgba(245,166,35,0.20)' : 'none',
                    }} />

                    {/* Card version */}
                    <div style={{
                      background: isCurrent ? 'rgba(245,166,35,0.06)' : 'transparent',
                      border: isCurrent ? '1px solid rgba(245,166,35,0.30)' : '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '12px 14px',
                    }}>
                      {/* Header version : numéro + label + badge actuel + date */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{
                          fontFamily: 'var(--font-jetbrains-mono, ui-monospace), monospace',
                          fontSize: 12, fontWeight: 600,
                          color: isCurrent ? '#F5A623' : 'var(--muted)',
                          letterSpacing: '0.02em',
                        }}>
                          v{entry.version}
                        </span>
                        {entry.label && (
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: 'var(--foreground)',
                            flex: 1, minWidth: 0,
                          }}>
                            {entry.label}
                          </span>
                        )}
                        {isCurrent && hasNewVersion && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 600,
                            padding: '3px 8px', borderRadius: 99,
                            background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)',
                            border: '1px solid rgba(239,68,68,0.30)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            animation: 'pulse 2s infinite',
                          }}>
                            Nouveau
                          </span>
                        )}
                        {isCurrent && !hasNewVersion && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 600,
                            padding: '3px 8px', borderRadius: 99,
                            background: 'rgba(16,185,129,0.12)', color: '#10B981',
                            border: '1px solid rgba(16,185,129,0.30)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>
                            Actuel
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Features list */}
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {entry.features.map((f, fi) => (
                          <li key={fi} style={{
                            fontSize: 12.5, color: 'var(--foreground)',
                            lineHeight: 1.6,
                            position: 'relative', paddingLeft: 14,
                            marginBottom: fi < entry.features.length - 1 ? 4 : 0,
                          }}>
                            <span style={{
                              position: 'absolute', left: 0, top: 8,
                              width: 4, height: 4, borderRadius: '50%',
                              background: isCurrent ? '#F5A623' : 'var(--muted)',
                              opacity: 0.7,
                            }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Bug report modal */}
      {showBugReport && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowBugReport(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: 'var(--surface, var(--card))',
              borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bug size={16} color="#DC2626" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Signaler un bug</h3>
              </div>
              <button onClick={() => setShowBugReport(false)} style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid #E2E8F0',
                background: 'var(--surface, var(--card))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={14} color="#64748B" />
              </button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-foreground)' }}>
                Décrivez le problème rencontré. La page et la version sont enregistrées automatiquement.
              </p>
              <textarea
                value={bugText}
                onChange={e => setBugText(e.target.value)}
                placeholder="Exemple : Quand je clique sur zoom +, le CV se décale à droite..."
                autoFocus
                style={{
                  width: '100%', minHeight: 120, padding: 12, borderRadius: 10,
                  border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none', lineHeight: 1.5,
                }}
                onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#3B82F6' }}
                onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', flex: 1 }}>
                  📍 {typeof window !== 'undefined' ? window.location.pathname : ''} · {APP_VERSION}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setShowBugReport(false)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--foreground)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleBugSubmit}
                  disabled={bugSending || !bugText.trim()}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: 'none', background: bugText.trim() ? '#DC2626' : '#E5E7EB',
                    color: 'white', cursor: bugText.trim() ? 'pointer' : 'default',
                    fontFamily: 'inherit', opacity: bugSending ? 0.5 : 1,
                  }}
                >
                  {bugSending ? 'Envoi...' : '🐛 Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
