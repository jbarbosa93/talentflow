'use client'
import { useState } from 'react'
import { Sparkles, CheckCircle, XCircle, Loader2, ArrowRight, Pause, Play, Square, History } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOffres } from '@/hooks/useOffres'
import { useMatching, type MatchResult } from '@/contexts/MatchingContext'
import Link from 'next/link'

// ─── Couleurs par score ───────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return { text: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', bar: '#22C55E', label: 'Fort' }
  if (score >= 50) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', bar: '#F59E0B', label: 'Moyen' }
  return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', bar: '#EF4444', label: 'Faible' }
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MatchingPage() {
  const [selectedOffre, setSelectedOffre] = useState('')
  const { data: offres } = useOffres(true)
  const matching = useMatching()

  const offre = offres?.find(o => o.id === selectedOffre)
  // When context already has a running analysis, show its offre
  const activeOffre = offres?.find(o => o.id === matching.offreId)

  const handleSearch = () => {
    if (!selectedOffre) return
    const name = offre ? (offre.client_nom ? `${offre.client_nom} — ${offre.titre}` : offre.titre) : ''
    matching.startAnalysis(selectedOffre, name)
  }

  const isRunning = matching.phase === 'running'
  const isPaused  = matching.phase === 'paused'
  const isDone    = matching.phase === 'done'
  const isIdle    = matching.phase === 'idle'
  const isActive  = isRunning || isPaused

  const ready = !!selectedOffre && isIdle

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <Sparkles size={22} color="var(--primary)" />
            Matching IA
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, margin: '6px 0 0 0' }}>
            Sélectionnez une commande — l&apos;IA pré-sélectionne et classe vos candidats
          </p>
        </div>
        <Link
          href="/matching/historique"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <History size={14} />Historique
        </Link>
      </div>

      {/* Sélection commande + boutons */}
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--card-shadow)', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Commande client
            </label>
            <Select
              value={isActive ? matching.offreId : selectedOffre}
              onValueChange={v => { if (isIdle || isDone) { setSelectedOffre(v); matching.reset() } }}
              disabled={isActive}
            >
              <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 44 }}>
                <SelectValue placeholder="Choisir une commande..." />
              </SelectTrigger>
              <SelectContent>
                {!offres?.length ? (
                  <SelectItem value="_" disabled>Aucune commande — créez-en une d&apos;abord</SelectItem>
                ) : (
                  offres.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.client_nom ? `${o.client_nom} — ` : ''}{o.titre}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Bouton principal */}
          {isIdle && (
            <button
              onClick={handleSearch}
              disabled={!ready}
              style={{
                height: 44, padding: '0 28px',
                background: ready ? 'var(--foreground)' : 'var(--secondary)',
                color: ready ? 'white' : 'var(--muted)',
                border: 'none', borderRadius: 'var(--radius)', cursor: ready ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={16} />Rechercher les meilleurs candidats
            </button>
          )}

          {/* Contrôles Pause/Resume + Stop quand analyse en cours */}
          {isActive && (
            <div style={{ display: 'flex', gap: 8 }}>
              {isRunning ? (
                <button
                  onClick={matching.pause}
                  style={{
                    height: 44, padding: '0 20px',
                    background: 'rgba(99,102,241,0.1)', color: '#6366F1',
                    border: '1.5px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius)',
                    cursor: 'pointer', fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                  }}
                >
                  <Pause size={15} />Pause
                </button>
              ) : (
                <button
                  onClick={matching.resume}
                  style={{
                    height: 44, padding: '0 20px',
                    background: 'rgba(99,102,241,0.1)', color: '#6366F1',
                    border: '1.5px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius)',
                    cursor: 'pointer', fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                  }}
                >
                  <Play size={15} />Reprendre
                </button>
              )}
              <button
                onClick={matching.stop}
                style={{
                  height: 44, padding: '0 20px',
                  background: 'rgba(220,38,38,0.08)', color: '#DC2626',
                  border: '1.5px solid rgba(220,38,38,0.25)', borderRadius: 'var(--radius)',
                  cursor: 'pointer', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                }}
              >
                <Square size={14} fill="#DC2626" />Arrêter
              </button>
            </div>
          )}

          {/* Bouton nouvelle analyse quand terminé */}
          {isDone && (
            <button
              onClick={() => { matching.reset(); setSelectedOffre('') }}
              style={{
                height: 44, padding: '0 20px',
                background: 'var(--secondary)', color: 'var(--foreground)',
                border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
              }}
            >
              Nouvelle analyse
            </button>
          )}
        </div>

        {/* Infos commande sélectionnée */}
        {(offre || activeOffre) && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(() => {
              const o = activeOffre || offre!
              return <>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{o.titre}</span>
                {o.client_nom && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>👤 {o.client_nom}</span>}
                {o.localisation && <span style={{ fontSize: 12, color: 'var(--muted)' }}>📍 {o.localisation}</span>}
                {o.nb_postes > 1 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>👥 {o.nb_postes} postes</span>}
                {o.competences?.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>🔧 {o.competences.slice(0, 4).join(', ')}{o.competences.length > 4 ? '…' : ''}</span>
                )}
              </>
            })()}
          </div>
        )}

        {/* Barre de progression */}
        {isActive && (
          <div style={{ marginTop: 16 }}>
            {/* Mots-clés pré-sélection */}
            {matching.total === 0 && (
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: '#6366F1', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pré-sélection des candidats en cours…</span>
              </div>
            )}
            {matching.total > 0 && matching.keywords.length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Mots-clés :</span>
                {matching.keywords.slice(0, 8).map(kw => (
                  <span key={kw} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366F1', fontWeight: 600 }}>{kw}</span>
                ))}
                {matching.totalBase > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                    → {matching.total} candidats pré-sélectionnés sur {matching.totalBase}
                  </span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {isRunning
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#6366F1' }} />
                  : <span style={{ fontSize: 14 }}>⏸</span>
                }
                {matching.doneCount} / {matching.total} candidats analysés par l&apos;IA
                {isPaused && <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 700 }}>— En pause</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6366F1' }}>{matching.progress}%</span>
            </div>
            <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${matching.progress}%`,
                background: isPaused
                  ? 'linear-gradient(90deg, #818CF8, #6366F1)'
                  : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                borderRadius: 99,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* Résumé final */}
        {isDone && matching.results.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#16A34A', margin: 0 }}>
              ✅ {matching.results.length} candidat{matching.results.length > 1 ? 's' : ''} analysé{matching.results.length > 1 ? 's' : ''}
              {matching.totalBase > 0 && (
                <span style={{ fontWeight: 400, color: '#166534' }}> sur {matching.totalBase} dans la base (pré-sélection IA)</span>
              )}
            </p>
            <button
              onClick={() => matching.reset()}
              style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: 'transparent', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
            >
              Vider les résultats
            </button>
          </div>
        )}
      </div>

      {/* Résultats (mis à jour en temps réel) */}
      {matching.results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matching.results.map((r, idx) => (
            <CandidatMatchCard key={r.candidat.id} result={r} rank={idx + 1} />
          ))}
        </div>
      )}

      {/* Empty states */}
      {isDone && matching.results.length === 0 && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Aucun résultat</div>
          <div className="neo-empty-sub">Importez des CVs pour lancer le matching</div>
        </div>
      )}

      {isIdle && !matching.results.length && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon" style={{ fontSize: 40 }}>✨</div>
          <div className="neo-empty-title">Prêt à matcher</div>
          <div className="neo-empty-sub">Sélectionnez une commande et cliquez sur &quot;Rechercher&quot;</div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Carte candidat ───────────────────────────────────────────────────────────

function CandidatMatchCard({ result, rank }: { result: MatchResult; rank: number }) {
  const [photoError, setPhotoError] = useState(false)
  const { candidat, score, score_competences, score_experience, competences_matchees, competences_manquantes, explication } = result
  const c = scoreColor(score)
  const initiales = `${(candidat.prenom || '')[0] || ''}${(candidat.nom || '')[0] || ''}`.toUpperCase() || '?'

  const rankStyle = rank === 1
    ? { bg: '#FFF9C4', border: '#FDE68A', icon: '🥇' }
    : rank === 2
    ? { bg: '#F1F5F9', border: '#CBD5E1', icon: '🥈' }
    : rank === 3
    ? { bg: '#FEF3E2', border: '#FDE68A', icon: '🥉' }
    : null

  const showPhoto = !!candidat.photo_url && !photoError

  return (
    <div style={{
      background: rank <= 3 ? rankStyle!.bg : 'var(--card)',
      border: `1.5px solid ${rank <= 3 ? rankStyle!.border : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      boxShadow: 'var(--card-shadow)',
    } as React.CSSProperties}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Rang + avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>
            {rank <= 3
              ? rankStyle!.icon
              : <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', width: 28, textAlign: 'center', display: 'block' }}>#{rank}</span>
            }
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: showPhoto ? 'transparent' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: '#0F172A', overflow: 'hidden',
          }}>
            {showPhoto
              ? <img
                  src={candidat.photo_url!}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setPhotoError(true)}
                />
              : initiales
            }
          </div>
        </div>

        {/* Infos candidat */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>
              {candidat.prenom} {candidat.nom}
            </span>
            {candidat.titre_poste && (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{candidat.titre_poste}</span>
            )}
            {candidat.localisation && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>📍 {candidat.localisation}</span>
            )}
          </div>

          {/* Barres compétences + expérience */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            <MiniBar label="Compétences" value={score_competences} />
            <MiniBar label="Expérience" value={score_experience} />
          </div>

          {/* Tags matchées / manquantes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {competences_matchees.slice(0, 5).map(comp => (
              <span key={comp} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: '#F0FDF4', border: '1px solid #86EFAC', color: '#16A34A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle size={10} />{comp}
              </span>
            ))}
            {competences_manquantes.slice(0, 3).map(comp => (
              <span key={comp} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <XCircle size={10} />{comp}
              </span>
            ))}
          </div>

          {explication && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{explication}</p>
          )}
        </div>

        {/* Score + bouton */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Score circulaire */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: c.bg, border: `3px solid ${c.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: c.text, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 10, color: c.text, fontWeight: 700 }}>{c.label}</span>
          </div>

          <Link
            href={`/candidats/${candidat.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Voir profil <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const c = scoreColor(value)
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', width: 140 }}>
        <div style={{ height: '100%', width: `${value}%`, background: c.bar, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}
