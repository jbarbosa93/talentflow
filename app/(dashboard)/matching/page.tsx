'use client'
import { detectAndFormat } from '@/lib/phone-format'
import { useState, useEffect, useRef, Suspense } from 'react'
import { Sparkles, CheckCircle, XCircle, Loader2, ArrowRight, Pause, Play, Square, History, Phone, MessageSquare, Mail, X, Smartphone, MessageCircle, Users, AlertTriangle, ChevronDown, Globe, ArrowLeft, Eye } from 'lucide-react'
import { useOffres } from '@/hooks/useOffres'
import { useMatching, type MatchResult } from '@/contexts/MatchingContext'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useCvHoverPreview, CvHoverPanel, CvHoverTrigger } from '@/components/CvHoverPreview'

// ─── Couleurs par score ───────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return { text: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', bar: '#22C55E', label: 'Fort' }
  if (score >= 50) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', bar: '#F59E0B', label: 'Moyen' }
  return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', bar: '#EF4444', label: 'Faible' }
}

// ─── Page principale ──────────────────────────────────────────────────────────

function toPhone(raw?: string | null) {
  if (!raw) return ''
  let p = raw.replace(/\s/g, '')
  if (p.startsWith('0')) p = '+41' + p.slice(1)
  return p
}

export default function MatchingPage() {
  return (
    <Suspense fallback={<div className="d-page" style={{ maxWidth: 860 }}><div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Chargement...</div></div>}>
      <MatchingPageInner />
    </Suspense>
  )
}

function MatchingPageInner() {
  const [selectedOffre, setSelectedOffre] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showContactModal, setShowContactModal] = useState(false)
  const { data: offres } = useOffres()
  const matching = useMatching()
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── Mode offre externe (arrivée depuis /offres?externe=<id>) ────────────────
  const externeId = searchParams.get('externe')
  const fromPage = searchParams.get('from')
  const [externeOffre, setExterneOffre] = useState<{ id: string; titre: string; entreprise: string | null; source: string } | null>(null)
  const externeLoaded = useRef(false)

  useEffect(() => {
    if (!externeId || externeLoaded.current) return
    externeLoaded.current = true
    const supabase = createClient()
    ;(supabase as any).from('offres_externes')
      .select('id, titre, entreprise, source')
      .eq('id', externeId)
      .single()
      .then(({ data }: any) => {
        if (data) {
          setExterneOffre(data)
          // Lancer l'analyse automatiquement
          const name = data.entreprise ? `${data.entreprise} — ${data.titre}` : data.titre
          matching.reset()
          setTimeout(() => matching.startAnalysis(data.id, name, true), 100)
        }
      })
  }, [externeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Combobox offres ──────────────────────────────────────────────────────────
  const [offreOpen, setOffreOpen] = useState(false)
  const [offreSearch, setOffreSearch] = useState('')
  const offreComboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!offreOpen) return
    function handleClick(e: MouseEvent) {
      if (offreComboRef.current && !offreComboRef.current.contains(e.target as Node)) {
        setOffreOpen(false)
        setOffreSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [offreOpen])

  const filteredOffres = (offres ?? []).filter(o => {
    if (!offreSearch) return true
    const q = offreSearch.toLowerCase()
    return (
      o.titre.toLowerCase().includes(q) ||
      (o.client_nom ?? '').toLowerCase().includes(q) ||
      (o.localisation ?? '').toLowerCase().includes(q)
    )
  })

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectedCandidats = matching.results.filter(r => selectedIds.has(r.candidat.id)).map(r => r.candidat)

  const offre = offres?.find(o => o.id === selectedOffre)

  // Hover CV preview (même pattern que CandidatsList / Pipeline)
  const cvHoverHook = useCvHoverPreview()

  // À l'arrivée sur la page : préserver les résultats terminés (retour depuis fiche candidat).
  // Restaure l'offre sélectionnée si on arrive avec une analyse 'done'.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (!externeId && matching.phase === 'done' && matching.offreId && !matching.isExterne) {
      setSelectedOffre(matching.offreId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    if (externeOffre) {
      const name = externeOffre.entreprise ? `${externeOffre.entreprise} — ${externeOffre.titre}` : externeOffre.titre
      matching.startAnalysis(externeOffre.id, name, true)
      return
    }
    if (!selectedOffre) return
    const name = offre ? (offre.client_nom ? `${offre.client_nom} — ${offre.titre}` : offre.titre) : ''
    matching.startAnalysis(selectedOffre, name)
  }

  const isRunning = matching.phase === 'running'
  const isPaused  = matching.phase === 'paused'
  const isDone    = matching.phase === 'done'
  const isIdle    = matching.phase === 'idle'
  const isActive  = isRunning || isPaused

  const ready = (!!selectedOffre || !!externeOffre) && isIdle

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>

      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          {fromPage && (
            <button
              onClick={() => router.push(`/${fromPage}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: 'inherit', padding: 0, marginBottom: 6 }}
            >
              <ArrowLeft size={13} /> Retour aux {fromPage === 'offres' ? 'commandes' : fromPage}
            </button>
          )}
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={22} color="var(--primary)" />
            Matching IA
            {externeOffre && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA', marginLeft: 4 }}>
                <Globe size={11} /> Offre externe
              </span>
            )}
          </h1>
          <p className="d-page-sub">
            {externeOffre
              ? <>{externeOffre.entreprise && <strong>{externeOffre.entreprise} — </strong>}{externeOffre.titre} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({externeOffre.source})</span></>
              : <>Selectionnez une commande — l&apos;IA pre-selectionne et classe vos candidats</>
            }
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
          {/* Combobox offres avec recherche intégrée */}
          <div ref={offreComboRef} style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Commande client
            </label>
            <button
              type="button"
              disabled={isActive}
              onClick={() => { if (!isActive) setOffreOpen(v => !v) }}
              style={{
                width: '100%', height: 44, padding: '0 12px',
                background: 'var(--secondary)', border: `1.5px solid ${offreOpen ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', cursor: isActive ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                color: (isActive ? matching.offreId : selectedOffre) ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 14, fontFamily: 'var(--font-body)', opacity: isActive ? 0.7 : 1,
                transition: 'border-color 0.15s',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(() => {
                  const activeId = isActive ? matching.offreId : selectedOffre
                  const o = offres?.find(x => x.id === activeId)
                  if (!o) return 'Choisir une commande...'
                  return o.client_nom ? `${o.client_nom} — ${o.titre}` : o.titre
                })()}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--muted)', transform: offreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {offreOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: 'var(--card)', border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                {/* Barre de recherche */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <input
                    autoFocus
                    value={offreSearch}
                    onChange={e => setOffreSearch(e.target.value)}
                    placeholder="Rechercher une commande…"
                    style={{
                      width: '100%', height: 34, padding: '0 10px', boxSizing: 'border-box',
                      background: 'var(--secondary)', border: '1.5px solid var(--border)',
                      borderRadius: 7, fontSize: 13, fontFamily: 'var(--font-body)',
                      color: 'var(--foreground)', outline: 'none',
                    }}
                  />
                </div>
                {/* Liste filtrée */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {filteredOffres.length === 0 ? (
                    <div style={{ padding: '14px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                      Aucune commande trouvée
                    </div>
                  ) : (
                    filteredOffres.map(o => (
                      <div
                        key={o.id}
                        onClick={() => { setSelectedOffre(o.id); matching.reset(); setOffreOpen(false); setOffreSearch('') }}
                        style={{
                          padding: '10px 14px', cursor: 'pointer',
                          background: o.id === selectedOffre ? 'rgba(245,167,35,0.08)' : 'transparent',
                          borderLeft: `2px solid ${o.id === selectedOffre ? 'var(--primary)' : 'transparent'}`,
                        }}
                        onMouseEnter={e => { if (o.id !== selectedOffre) (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
                        onMouseLeave={e => { if (o.id !== selectedOffre) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 3 }}>{o.titre}</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {o.client_nom && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>👤 {o.client_nom}</span>}
                          {o.localisation && <span style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {o.localisation}</span>}
                          {o.exp_requise > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>⏱ {o.exp_requise} ans exp.</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bouton principal */}
          {isIdle && (
            <button
              onClick={handleSearch}
              disabled={!ready}
              style={{
                height: 44, padding: '0 28px',
                background: ready ? 'var(--primary)' : 'var(--secondary)',
                color: ready ? 'var(--primary-foreground)' : 'var(--muted)',
                border: ready ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                borderRadius: 'var(--radius)', cursor: ready ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s', whiteSpace: 'nowrap',
                boxShadow: ready ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
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
        {offre && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(() => {
              const o = offre
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

      {/* Barre sélection flottante */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'sticky', top: 16, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--foreground)', color: 'white',
          borderRadius: 14, padding: '12px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          marginBottom: 16, gap: 16,
          animation: 'slideDown 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={14} color="#0F172A" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {selectedIds.size} candidat{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ height: 36, padding: '0 14px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)' }}
            >
              Désélectionner
            </button>
            <button
              onClick={() => setShowContactModal(true)}
              style={{ height: 36, padding: '0 20px', background: 'var(--primary)', color: 'var(--ink, #1C1A14)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Phone size={14} />Contacter
            </button>
          </div>
        </div>
      )}

      {/* Résultats (mis à jour en temps réel) */}
      {matching.results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matching.results.map((r, idx) => (
            <CandidatMatchCard
              key={r.candidat.id}
              result={r}
              rank={idx + 1}
              selected={selectedIds.has(r.candidat.id)}
              onToggle={() => toggleSelect(r.candidat.id)}
              cvHoverHook={cvHoverHook}
            />
          ))}
        </div>
      )}

      {/* Modal contact */}
      {showContactModal && (
        <ContactModal candidats={selectedCandidats} onClose={() => setShowContactModal(false)} />
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Hover CV panel portalisé */}
      <CvHoverPanel hook={cvHoverHook} />
    </div>
  )
}

// ─── Carte candidat ───────────────────────────────────────────────────────────

function CandidatMatchCard({ result, rank, selected, onToggle, cvHoverHook }: { result: MatchResult; rank: number; selected: boolean; onToggle: () => void; cvHoverHook: ReturnType<typeof useCvHoverPreview> }) {
  const [photoError, setPhotoError] = useState(false)
  const { candidat, score, score_competences, score_experience, competences_matchees, competences_manquantes, explication } = result
  const hasCv = !!candidat.cv_url
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
    <div
      onClick={onToggle}
      style={{
        background: selected ? 'rgba(245,167,35,0.06)' : (rank <= 3 ? rankStyle!.bg : 'var(--card)'),
        border: `1.5px solid ${selected ? 'var(--primary)' : (rank <= 3 ? rankStyle!.border : 'var(--border)')}`,
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        boxShadow: selected ? '0 0 0 3px rgba(245,167,35,0.15)' : 'var(--card-shadow)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      } as React.CSSProperties}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Checkbox + Rang + avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Checkbox */}
          <div style={{
            width: 20, height: 20, borderRadius: 6,
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}>
            {selected && <CheckCircle size={12} color="#0F172A" strokeWidth={3} />}
          </div>
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
            fontSize: 15, fontWeight: 800, color: 'var(--ink, #1C1A14)', overflow: 'hidden',
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

          {hasCv && (
            <CvHoverTrigger
              cvUrl={candidat.cv_url!}
              cvNomFichier={candidat.cv_nom_fichier}
              candidatId={candidat.id}
              hook={cvHoverHook}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 7,
                  border: '1px solid rgba(245,167,35,0.35)',
                  background: 'var(--primary-soft)',
                  cursor: 'default', fontSize: 12, fontWeight: 700,
                  color: 'var(--primary)', whiteSpace: 'nowrap',
                }}
                title="Survoler pour prévisualiser le CV"
              >
                <Eye size={11} /> CV
              </div>
            </CvHoverTrigger>
          )}
          <Link
            href={`/candidats/${candidat.id}?from=matching`}
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Voir profil <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Avatar avec fallback onError ─────────────────────────────────────────────
function AvatarWithFallback({ prenom, nom, photo_url }: { prenom?: string | null; nom?: string | null; photo_url?: string | null }) {
  const [err, setErr] = useState(false)
  const initiales = `${(prenom || '')[0] || ''}${(nom || '')[0] || ''}`.toUpperCase() || '?'
  const show = !!photo_url && !err
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: show ? 'transparent' : 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, color: 'var(--ink, #1C1A14)', overflow: 'hidden',
    }}>
      {show
        ? <img src={photo_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setErr(true)} />
        : initiales}
    </div>
  )
}

// ─── Modal Contact ─────────────────────────────────────────────────────────────


function ContactModal({ candidats, onClose }: { candidats: any[]; onClose: () => void }) {
  const [mode, setMode] = useState<'individuel' | 'sms'>('individuel')
  const [messageText, setMessageText] = useState('')
  const [numCopied, setNumCopied] = useState(false)

  const avecTel = candidats.filter(c => c.telephone)
  const sansTel = candidats.filter(c => !c.telephone)
  const formatted = avecTel.map(c => detectAndFormat(c.telephone).number)

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
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
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
                  <AvatarWithFallback prenom={c.prenom} nom={c.nom} photo_url={c.photo_url} />
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
                  const { number, countryCode, country } = detectAndFormat(c.telephone)
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
  if (disabled) return <div style={style} title={`${label} — numéro manquant`}><Icon size={15} /></div>
  return <a href={href} style={style} title={label} target="_blank" rel="noreferrer"><Icon size={15} /></a>
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
