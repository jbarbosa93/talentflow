'use client'
import { useState, useCallback } from 'react'
import { Copy, Loader2, CheckCircle, XCircle, Merge, Eye, ExternalLink, AlertTriangle, ArrowLeft, Users, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Candidat = {
  id: string
  nom: string
  prenom: string | null
  email: string | null
  telephone: string | null
  titre_poste: string | null
  localisation: string | null
  annees_exp: number
  competences: string[]
  cv_url: string | null
  cv_nom_fichier: string | null
  cv_texte_brut: string | null
  created_at: string
}

type DoublonResult = {
  is_doublon: boolean
  score: number
  raisons: string[]
  explication: string
}

type DoublonPair = {
  id: string
  candidat_a: Candidat
  candidat_b: Candidat
  result: DoublonResult
  status: 'pending' | 'ignored' | 'merged'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function normalizePhone(s: string) {
  return (s || '').replace(/[\s\-\.\(\)]/g, '').replace(/^00/, '+')
}

function nameKey(c: Candidat) {
  return normalize(c.nom) + '|' + normalize(c.prenom || '')
}

function scoreColor(score: number) {
  if (score >= 90) return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Certain' }
  if (score >= 70) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Probable' }
  return { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Possible' }
}

// Pre-filter: generate suspicious pairs without calling Claude
function getPairsToCheck(candidats: Candidat[]): Array<[Candidat, Candidat]> {
  const pairs: Array<[Candidat, Candidat]> = []
  const checked = new Set<string>()

  const addPair = (a: Candidat, b: Candidat) => {
    const key = [a.id, b.id].sort().join('|')
    if (!checked.has(key)) { checked.add(key); pairs.push([a, b]) }
  }

  // Group by email
  const byEmail: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (c.email) {
      const k = normalize(c.email)
      if (!byEmail[k]) byEmail[k] = []
      byEmail[k].push(c)
    }
  }
  for (const group of Object.values(byEmail)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Group by phone
  const byPhone: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (c.telephone) {
      const k = normalizePhone(c.telephone)
      if (k.length > 5) {
        if (!byPhone[k]) byPhone[k] = []
        byPhone[k].push(c)
      }
    }
  }
  for (const group of Object.values(byPhone)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Group by similar name (first 3 chars nom + first 3 chars prenom)
  const byName: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    const nom3 = normalize(c.nom).slice(0, 4)
    const prenom3 = normalize(c.prenom || '').slice(0, 4)
    if (nom3.length >= 3) {
      const k = `${nom3}|${prenom3}`
      if (!byName[k]) byName[k] = []
      byName[k].push(c)
    }
  }
  for (const group of Object.values(byName)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Limit to 60 pairs max to avoid timeout
  return pairs.slice(0, 60)
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DoublonsPage() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'analysing' | 'done'>('idle')
  const [candidats, setCandidats] = useState<Candidat[]>([])
  const [totalPairs, setTotalPairs] = useState(0)
  const [checkedPairs, setCheckedPairs] = useState(0)
  const [doublons, setDoublons] = useState<DoublonPair[]>([])
  const [confirmModal, setConfirmModal] = useState<{ pair: DoublonPair; keepId: string; deleteId: string } | null>(null)
  const [merging, setMerging] = useState(false)

  const handleLancer = useCallback(async () => {
    setPhase('loading')
    setDoublons([])
    setCheckedPairs(0)
    setTotalPairs(0)

    // 1. Charger tous les candidats
    let allCandidats: Candidat[] = []
    try {
      const res = await fetch('/api/candidats?limit=1000')
      const data = await res.json()
      allCandidats = data.candidats || []
    } catch {
      toast.error('Impossible de charger les candidats')
      setPhase('idle')
      return
    }

    setCandidats(allCandidats)

    if (allCandidats.length < 2) {
      toast.info('Pas assez de candidats pour analyser les doublons')
      setPhase('done')
      return
    }

    // 2. Pré-filtrer les paires suspectes
    const pairs = getPairsToCheck(allCandidats)
    setTotalPairs(pairs.length)
    setPhase('analysing')

    if (pairs.length === 0) {
      toast.success('Aucun doublon potentiel détecté (analyse rapide)')
      setPhase('done')
      return
    }

    // 3. Analyser chaque paire avec Claude
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i]
      try {
        const res = await fetch('/api/candidats/doublons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'compare', candidat_a: a, candidat_b: b }),
        })
        if (!res.ok) throw new Error('API error')
        const result: DoublonResult = await res.json()

        if (result.is_doublon) {
          const pair: DoublonPair = {
            id: `${a.id}|${b.id}`,
            candidat_a: a,
            candidat_b: b,
            result,
            status: 'pending',
          }
          setDoublons(prev => [...prev, pair])
        }
      } catch {
        // Ignore erreurs individuelles
      }
      setCheckedPairs(i + 1)
    }

    setPhase('done')
    toast.success('Analyse terminée !')
  }, [])

  const handleIgnorer = (pairId: string) => {
    setDoublons(prev => prev.map(p => p.id === pairId ? { ...p, status: 'ignored' } : p))
  }

  const handleFusionnerClick = (pair: DoublonPair) => {
    // Par défaut : garder le plus ancien (créé en premier)
    const keepId = pair.candidat_a.created_at <= pair.candidat_b.created_at
      ? pair.candidat_a.id : pair.candidat_b.id
    const deleteId = keepId === pair.candidat_a.id ? pair.candidat_b.id : pair.candidat_a.id
    setConfirmModal({ pair, keepId, deleteId })
  }

  const handleMergeConfirm = async () => {
    if (!confirmModal) return
    setMerging(true)
    try {
      const res = await fetch('/api/candidats/doublons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', keep_id: confirmModal.keepId, delete_id: confirmModal.deleteId }),
      })
      if (!res.ok) throw new Error('Erreur fusion')
      setDoublons(prev => prev.map(p => p.id === confirmModal.pair.id ? { ...p, status: 'merged' } : p))
      toast.success('Candidats fusionnés avec succès')
      setConfirmModal(null)
    } catch {
      toast.error('Erreur lors de la fusion')
    }
    setMerging(false)
  }

  const progress = totalPairs > 0 ? Math.round((checkedPairs / totalPairs) * 100) : 0
  const activePairs = doublons.filter(p => p.status === 'pending')
  const doneCount = doublons.filter(p => p.status !== 'pending').length

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link href="/parametres" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Paramètres
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Copy size={22} color="var(--primary)" />
          Analyser les doublons
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, margin: '6px 0 0 0' }}>
          L&apos;IA analyse tous vos CVs pour détecter les candidats en double
        </p>
      </div>

      {/* Stats + bouton lancer */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <StatBadge label="Candidats" value={candidats.length || '—'} color="var(--foreground)" />
            <StatBadge label="Paires vérifiées" value={checkedPairs > 0 ? `${checkedPairs}/${totalPairs}` : '—'} color="#2563EB" />
            <StatBadge label="Doublons trouvés" value={doublons.length || '—'} color={doublons.length > 0 ? '#DC2626' : 'var(--foreground)'} />
            <StatBadge label="Traités" value={doneCount > 0 ? doneCount : '—'} color="#16A34A" />
          </div>
          <button
            onClick={handleLancer}
            disabled={phase === 'loading' || phase === 'analysing'}
            className="neo-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 14, opacity: phase === 'loading' || phase === 'analysing' ? 0.7 : 1 }}
          >
            {phase === 'loading' || phase === 'analysing'
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Analyse en cours...</>
              : <><RefreshCw size={16} />Lancer l&apos;analyse</>
            }
          </button>
        </div>

        {/* Barre de progression */}
        {(phase === 'loading' || phase === 'analysing') && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {phase === 'loading' ? 'Chargement des candidats...' : `Analyse paire ${checkedPairs} / ${totalPairs}`}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{phase === 'loading' ? '...' : `${progress}%`}</span>
            </div>
            <div style={{ height: 8, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: phase === 'loading' ? '8%' : `${progress}%`,
                background: 'var(--primary)',
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }} />
            </div>
            {doublons.length > 0 && (
              <p style={{ fontSize: 12, color: '#D97706', marginTop: 8, fontWeight: 600 }}>
                🔍 {doublons.length} doublon{doublons.length > 1 ? 's' : ''} trouvé{doublons.length > 1 ? 's' : ''} jusqu&apos;ici
              </p>
            )}
          </div>
        )}
        {phase === 'done' && totalPairs > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: doublons.length > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${doublons.length > 0 ? '#FDE68A' : '#BBF7D0'}` }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: doublons.length > 0 ? '#92400E' : '#16A34A', margin: 0 }}>
              {doublons.length > 0
                ? `⚠️ ${doublons.length} doublon${doublons.length > 1 ? 's' : ''} détecté${doublons.length > 1 ? 's' : ''} sur ${totalPairs} paires analysées`
                : `✅ Aucun doublon détecté sur ${totalPairs} paires analysées`
              }
            </p>
          </div>
        )}
      </div>

      {/* Liste des doublons */}
      {doublons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="var(--primary)" />
            Doublons détectés ({doublons.length})
          </h2>

          {doublons.map(pair => (
            <DoublonCard
              key={pair.id}
              pair={pair}
              onIgnorer={handleIgnorer}
              onFusionner={handleFusionnerClick}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {phase === 'idle' && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Prêt à analyser</div>
          <div className="neo-empty-sub">Cliquez sur &quot;Lancer l&apos;analyse&quot; pour détecter les doublons dans votre base de candidats</div>
        </div>
      )}

      {/* Modal de confirmation fusion */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={22} color="#D97706" />
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Confirmer la fusion</h3>
            </div>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Cette action est <strong>irréversible</strong>. Le candidat en doublon sera <strong>supprimé définitivement</strong> et ses données seront fusionnées dans le profil principal.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <MiniCandidatCard
                candidat={confirmModal.keepId === confirmModal.pair.candidat_a.id ? confirmModal.pair.candidat_a : confirmModal.pair.candidat_b}
                label="✅ Profil gardé"
                color="#F0FDF4"
                border="#BBF7D0"
              />
              <MiniCandidatCard
                candidat={confirmModal.keepId === confirmModal.pair.candidat_a.id ? confirmModal.pair.candidat_b : confirmModal.pair.candidat_a}
                label="🗑 Profil supprimé"
                color="#FEF2F2"
                border="#FECACA"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmModal(null)}
                disabled={merging}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
              >
                Annuler
              </button>
              <button
                onClick={handleMergeConfirm}
                disabled={merging}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  background: '#DC2626', color: 'white', cursor: merging ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                  opacity: merging ? 0.7 : 1,
                }}
              >
                {merging ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Fusion...</> : <><Merge size={14} />Confirmer la fusion</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function DoublonCard({ pair, onIgnorer, onFusionner }: {
  pair: DoublonPair
  onIgnorer: (id: string) => void
  onFusionner: (pair: DoublonPair) => void
}) {
  const c = scoreColor(pair.result.score)
  const isIgnored = pair.status === 'ignored'
  const isMerged = pair.status === 'merged'

  return (
    <div style={{
      background: 'var(--card)', border: `1.5px solid ${isMerged ? '#BBF7D0' : isIgnored ? 'var(--border)' : c.border}`,
      borderRadius: 14, padding: 20, opacity: (isIgnored || isMerged) ? 0.6 : 1,
      boxShadow: 'var(--card-shadow)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: '4px 12px', borderRadius: 99, background: c.bg, border: `1px solid ${c.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.text }}>{pair.result.score}% {c.label}</span>
          </div>
          {pair.result.raisons.map(r => (
            <span key={r} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{r}</span>
          ))}
        </div>
        {isMerged && <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} />Fusionné</span>}
        {isIgnored && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={14} />Ignoré</span>}
      </div>

      {/* Deux candidats côte à côte */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <CandidatMiniProfile candidat={pair.candidat_a} />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', textAlign: 'center', padding: '0 4px' }}>vs</div>
        <CandidatMiniProfile candidat={pair.candidat_b} />
      </div>

      {/* Explication IA */}
      {pair.result.explication && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--foreground)' }}>Analyse IA :</strong> {pair.result.explication}
          </p>
        </div>
      )}

      {/* Actions */}
      {pair.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link href={`/candidats/${pair.candidat_a.id}`} target="_blank"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
            <Eye size={13} />Voir A
          </Link>
          <Link href={`/candidats/${pair.candidat_b.id}`} target="_blank"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
            <Eye size={13} />Voir B
          </Link>
          {pair.candidat_a.cv_url && (
            <a href={pair.candidat_a.cv_url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
              <ExternalLink size={13} />CV A
            </a>
          )}
          {pair.candidat_b.cv_url && (
            <a href={pair.candidat_b.cv_url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
              <ExternalLink size={13} />CV B
            </a>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => onIgnorer(pair.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'inherit' }}>
            <XCircle size={13} />Ignorer
          </button>
          <button onClick={() => onFusionner(pair)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            <Merge size={13} />Fusionner
          </button>
        </div>
      )}
    </div>
  )
}

function CandidatMiniProfile({ candidat }: { candidat: Candidat }) {
  const initials = `${(candidat.prenom || '')[0] || ''}${(candidat.nom || '')[0] || ''}`.toUpperCase() || '?'
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--background)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidat.prenom} {candidat.nom}
          </div>
          {candidat.titre_poste && (
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {candidat.titre_poste}
            </div>
          )}
        </div>
      </div>
      {candidat.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📧 {candidat.email}</div>}
      {candidat.telephone && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📞 {candidat.telephone}</div>}
      {candidat.localisation && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {candidat.localisation}</div>}
    </div>
  )
}

function MiniCandidatCard({ candidat, label, color, border }: { candidat: Candidat; label: string; color: string; border: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: color, border: `1px solid ${border}` }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 2px 0' }}>{candidat.prenom} {candidat.nom}</p>
      {candidat.email && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{candidat.email}</p>}
      {candidat.titre_poste && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0 0' }}>{candidat.titre_poste}</p>}
    </div>
  )
}
