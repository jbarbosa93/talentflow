'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_VERSION, APP_ENV, CHANGELOG } from '@/lib/version'
import { X } from 'lucide-react'

export default function BetaBadge({ inline }: { inline?: boolean }) {
  const [showChangelog, setShowChangelog] = useState(false)

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
      {inline ? (
        /* ── Sidebar inline version ── */
        <button
          onClick={() => setShowChangelog(true)}
          style={{
            margin: '6px 10px 0',
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 'calc(100% - 20px)',
            transition: 'all 0.15s',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
          }}
        >
          {envBadge}
          {APP_VERSION}
        </button>
      ) : (
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

      {/* Changelog modal — portail pour sortir du stacking context sidebar */}
      {showChangelog && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowChangelog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 680,
              maxHeight: '85vh',
              background: 'white',
              borderRadius: 16,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Changelog
                </h2>
                <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>
                  Historique des mises a jour TalentFlow
                </p>
              </div>
              <button
                onClick={() => setShowChangelog(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid #E2E8F0', background: 'white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} color="#64748B" />
              </button>
            </div>

            {/* Content */}
            <div style={{ overflowY: 'auto', padding: '16px 24px 24px' }}>
              {CHANGELOG.map((entry, idx) => {
                const isCurrent = idx === 0
                return (
                  <div key={entry.version} style={{
                    position: 'relative',
                    paddingLeft: 24,
                    paddingBottom: idx < CHANGELOG.length - 1 ? 24 : 0,
                    borderLeft: idx < CHANGELOG.length - 1 ? '2px solid #E2E8F0' : 'none',
                    marginLeft: 6,
                  }}>
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute',
                      left: -6,
                      top: 2,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: isCurrent ? '#F5A723' : '#CBD5E1',
                      border: isCurrent ? '2px solid #FDE68A' : '2px solid white',
                    }} />

                    {/* Version header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 800,
                        color: isCurrent ? '#0F172A' : '#475569',
                      }}>
                        {entry.version}
                      </span>
                      {entry.label && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 12,
                          background: isCurrent ? 'rgba(245,167,35,0.15)' : '#F1F5F9',
                          color: isCurrent ? '#B45309' : '#64748B',
                        }}>
                          {entry.label}
                        </span>
                      )}
                      {isCurrent && (
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          padding: '2px 6px', borderRadius: 8,
                          background: '#10B981', color: 'white',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                          Actuel
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                        {new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Features list */}
                    <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
                      {entry.features.map((f, fi) => (
                        <li key={fi} style={{
                          fontSize: 12, color: '#475569', lineHeight: 1.6,
                          position: 'relative', paddingLeft: 4,
                        }}>
                          <span style={{
                            position: 'absolute', left: -12, top: 6,
                            width: 4, height: 4, borderRadius: '50%',
                            background: isCurrent ? '#F5A723' : '#CBD5E1',
                          }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
