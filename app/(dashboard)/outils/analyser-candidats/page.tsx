'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Search, Loader2, Image, FileText,
  ClipboardList, Paperclip, ExternalLink, ChevronDown,
  ChevronUp, Wrench, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PhotoSuspecte {
  id: string; nom: string; prenom: string | null; photo_url: string; reason: string
}
interface CvMalClasse {
  id: string; nom: string; prenom: string | null; cv_url: string; cv_nom_fichier: string; suspected_type: string
}
interface FicheIncomplete {
  id: string; nom: string; prenom: string | null; missing_fields: string[]
}
interface SansCv {
  id: string; nom: string; prenom: string | null; has_documents: boolean
}

interface AuditResult {
  summary: {
    total_candidats: number
    photos_suspectes: number
    cvs_mal_classes: number
    fiches_incompletes: number
    sans_cv: number
    score_sante: number
  }
  photos_suspectes: PhotoSuspecte[]
  cvs_mal_classes: CvMalClasse[]
  fiches_incompletes: FicheIncomplete[]
  sans_cv: SansCv[]
}

type AnalysisPhase = 'idle' | 'scanning' | 'analysing_cvs' | 'analysing_photos' | 'done'

interface OverallProgress {
  current: number
  total: number
  phase: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function healthColor(score: number): string {
  if (score >= 80) return '#10B981'
  if (score >= 50) return '#F59E0B'
  return '#EF4444'
}

function healthLabel(score: number): string {
  if (score >= 80) return 'Bonne'
  if (score >= 50) return 'Moyenne'
  return 'Critique'
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AnalyserCandidatsPage() {
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set())
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set())

  // Unified analysis state
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle')
  const [overallProgress, setOverallProgress] = useState<OverallProgress>({ current: 0, total: 0, phase: '' })

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    photos: true,
    cvs: true,
    fiches: true,
    sans_cv: true,
  })

  function toggleSection(key: string) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function runFullAnalysis() {
    cancelRef.current = false
    setError(null)
    setResult(null)
    setFixedIds(new Set())

    // ── Step 1: Quick scan ──
    setAnalysisPhase('scanning')
    setOverallProgress({ current: 0, total: 1, phase: 'Etape 1/2 : Scan rapide...' })

    let auditData: AuditResult | null = null
    try {
      const res = await fetch('/api/candidats/audit')
      if (!res.ok) throw new Error('Erreur serveur')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      auditData = data as AuditResult
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setAnalysisPhase('idle')
      return
    }

    // Show quick scan results immediately (will be enriched)
    setResult({ ...auditData })
    setOverallProgress({ current: 1, total: 1, phase: 'Etape 1/2 : Scan rapide...' })

    // ── Step 2: Deep CV analysis ──
    setAnalysisPhase('analysing_cvs')
    const deepCvProblems: CvMalClasse[] = []
    let cvOffset = 0
    const cvBatchSize = 10

    try {
      // First call to get total
      const firstRes = await fetch('/api/candidats/audit/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: 0, limit: cvBatchSize, mode: 'cv' }),
      })
      const firstData = await firstRes.json()
      if (firstRes.ok) {
        const cvTotal = firstData.total || 0
        setOverallProgress({ current: firstData.scanned, total: cvTotal, phase: `Etape 2/2 : Analyse des CVs... (${firstData.scanned}/${cvTotal})` })

        if (firstData.problems?.length) {
          for (const p of firstData.problems) {
            deepCvProblems.push({
              id: p.id,
              nom: p.nom,
              prenom: p.prenom,
              cv_url: '',
              cv_nom_fichier: p.cv_nom_fichier || '',
              suspected_type: p.reason,
            })
          }
        }

        cvOffset = cvBatchSize
        while (cvOffset < cvTotal && !cancelRef.current) {
          const res = await fetch('/api/candidats/audit/deep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offset: cvOffset, limit: cvBatchSize, mode: 'cv' }),
          })
          const data = await res.json()
          if (!res.ok) break

          const scannedSoFar = cvOffset + data.scanned
          setOverallProgress({ current: scannedSoFar, total: cvTotal, phase: `Etape 2/2 : Analyse des CVs... (${scannedSoFar}/${cvTotal})` })

          if (data.problems?.length) {
            for (const p of data.problems) {
              deepCvProblems.push({
                id: p.id,
                nom: p.nom,
                prenom: p.prenom,
                cv_url: '',
                cv_nom_fichier: p.cv_nom_fichier || '',
                suspected_type: p.reason,
              })
            }
            // Mise à jour progressive des résultats
            const existIds = new Set(auditData.cvs_mal_classes.map(c => c.id))
            const newProbs = deepCvProblems.filter(p => !existIds.has(p.id))
            const merged = [...auditData.cvs_mal_classes, ...newProbs]
            setResult(prev => prev ? {
              ...prev,
              cvs_mal_classes: merged,
              summary: { ...prev.summary, cvs_mal_classes: merged.length },
            } : prev)
          }

          cvOffset += cvBatchSize
        }
      }
    } catch {
      // Continue with what we have
    }

    // Merge deep CV problems into audit result (avoid duplicates by id)
    const existingCvIds = new Set(auditData.cvs_mal_classes.map(c => c.id))
    const newCvProblems = deepCvProblems.filter(p => !existingCvIds.has(p.id))
    const mergedCvs = [...auditData.cvs_mal_classes, ...newCvProblems]

    const updatedAfterCv: AuditResult = {
      ...auditData,
      cvs_mal_classes: mergedCvs,
      summary: {
        ...auditData.summary,
        cvs_mal_classes: mergedCvs.length,
      },
    }
    setResult({ ...updatedAfterCv })

    // Recompute health score with merged CV results
    const allIssueIds = new Set([
      ...updatedAfterCv.photos_suspectes.map(p => p.id),
      ...mergedCvs.map(c => c.id),
      ...updatedAfterCv.fiches_incompletes.map(f => f.id),
      ...updatedAfterCv.sans_cv.map(sc => sc.id),
    ])
    const totalCandidats = updatedAfterCv.summary.total_candidats
    const healthyCount = totalCandidats - allIssueIds.size
    const scoreSante = totalCandidats > 0 ? Math.round((healthyCount / totalCandidats) * 100) : 100

    const finalResult: AuditResult = {
      ...updatedAfterCv,
      summary: {
        ...updatedAfterCv.summary,
        cvs_mal_classes: mergedCvs.length,
        score_sante: scoreSante,
      },
    }
    setResult(finalResult)
    setAnalysisPhase('done')
  }

  async function fixCandidat(candidatId: string, action: 'move_cv_to_documents' | 'remove_photo') {
    setFixingIds(prev => new Set(prev).add(candidatId))
    try {
      const res = await fetch('/api/candidats/audit/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidatId, action }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      if (data.success) {
        setFixedIds(prev => new Set(prev).add(candidatId))
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setFixingIds(prev => {
        const next = new Set(prev)
        next.delete(candidatId)
        return next
      })
    }
  }

  const isRunning = analysisPhase !== 'idle' && analysisPhase !== 'done'
  const s = result?.summary
  const progressPct = overallProgress.total > 0 ? Math.round((overallProgress.current / overallProgress.total) * 100) : 0

  return (
    <div className="d-page" style={{ maxWidth: 920, paddingBottom: 60 }}>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/outils"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
        >
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(139,92,246,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Search size={22} style={{ color: '#8B5CF6' }} />
          </div>
          <div>
            <h1 className="d-page-title" style={{ margin: 0 }}>Analyser les candidats</h1>
            <p className="d-page-sub" style={{ margin: 0 }}>Audit qualite de votre base candidats</p>
          </div>
        </div>

        <button
          onClick={runFullAnalysis}
          disabled={isRunning}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', borderRadius: 12, fontSize: 15, fontWeight: 800,
            border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, var(--primary), #E8940A)',
            color: '#0F172A', fontFamily: 'inherit',
            boxShadow: '0 2px 12px rgba(245,167,35,0.3)',
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyse en cours...</>
          ) : (
            <><Search size={16} /> Lancer l&apos;analyse complete</>
          )}
        </button>
        {isRunning && (
          <button onClick={() => { cancelRef.current = true; setAnalysisPhase('done') }}
            style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Arrêter
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '16px 20px', borderRadius: 12, marginBottom: 20,
          background: '#FEF2F2', border: '1.5px solid #FECACA',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 600, color: '#DC2626',
        }}>
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Empty state */}
      {analysisPhase === 'idle' && !result && !error && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          color: 'var(--muted)',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'rgba(139,92,246,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Search size={36} style={{ color: '#8B5CF6', opacity: 0.5 }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Pret pour l&apos;audit</div>
          <div style={{ fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            Cliquez sur &laquo; Lancer l&apos;analyse complete &raquo; pour scanner votre base candidats et detecter les anomalies.
          </div>
        </div>
      )}

      {/* Progress bar during analysis */}
      {isRunning && (
        <div style={{
          borderRadius: 16, border: '1.5px solid #C4B5FD', background: 'var(--card)',
          padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#8B5CF6' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
              {overallProgress.phase}
            </span>
          </div>
          {analysisPhase !== 'scanning' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                <span>{overallProgress.current} / {overallProgress.total}</span>
                <span>{progressPct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #8B5CF6, #F59E0B)', borderRadius: 99, transition: 'width 0.3s',
                }} />
              </div>
            </>
          )}
          {analysisPhase === 'scanning' && (
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: '100%',
                background: 'linear-gradient(90deg, #8B5CF6, #F59E0B, #8B5CF6)',
                backgroundSize: '200% 100%',
                borderRadius: 99,
                animation: 'shimmer 1.5s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && s && (
        <div style={{ animation: analysisPhase === 'done' ? 'fadeInAudit 0.4s ease' : 'none' }}>
          {/* Health score */}
          <div className="neo-card-soft" style={{
            padding: 32, marginBottom: 24, textAlign: 'center',
          }}>
            <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 16px' }}>
              <svg viewBox="0 0 120 120" width="140" height="140">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={healthColor(s.score_sante)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(s.score_sante / 100) * 327} 327`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 32, fontWeight: 900, color: healthColor(s.score_sante),
                  fontFamily: 'var(--font-heading)', lineHeight: 1,
                }}>
                  {s.score_sante}%
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                  Sante
                </div>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: healthColor(s.score_sante) }}>
              {healthLabel(s.score_sante)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {s.total_candidats} candidats analyses
              {analysisPhase !== 'done' && analysisPhase !== 'idle' && (
                <span style={{ marginLeft: 6, color: '#8B5CF6', fontWeight: 600 }}>(analyse en cours...)</span>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            <KpiCard icon={<Image size={20} />} label="Photos suspectes" value={s.photos_suspectes} color="#F59E0B" />
            <KpiCard icon={<FileText size={20} />} label="CVs mal classes" value={s.cvs_mal_classes} color="#EF4444" />
            <KpiCard icon={<ClipboardList size={20} />} label="Fiches incompletes" value={s.fiches_incompletes} color="#3B82F6" />
            <KpiCard icon={<Paperclip size={20} />} label="Sans CV" value={s.sans_cv} color="#64748B" />
          </div>

          {/* Detail sections */}

          {/* Photos suspectes */}
          {result.photos_suspectes.length > 0 && (
            <AuditSection
              title="Photos suspectes"
              icon={<Image size={16} />}
              count={result.photos_suspectes.length}
              color="#F59E0B"
              isOpen={openSections.photos}
              onToggle={() => toggleSection('photos')}
            >
              {result.photos_suspectes.map(p => (
                <div key={`photo-${p.id}-${p.reason}`} style={rowStyle}>
                  <img
                    src={p.photo_url}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameStyle}>{p.prenom} {p.nom}</div>
                    <div style={issueStyle}>
                      <AlertTriangle size={11} style={{ flexShrink: 0 }} /> {p.reason}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <FixButton
                      label="Supprimer"
                      loading={fixingIds.has(p.id)}
                      done={fixedIds.has(p.id)}
                      onClick={() => fixCandidat(p.id, 'remove_photo')}
                      color="#EF4444"
                    />
                    <ViewButton id={p.id} />
                  </div>
                </div>
              ))}
            </AuditSection>
          )}

          {/* CVs mal classes */}
          {result.cvs_mal_classes.length > 0 && (
            <AuditSection
              title="CVs mal classes"
              icon={<FileText size={16} />}
              count={result.cvs_mal_classes.length}
              color="#EF4444"
              isOpen={openSections.cvs}
              onToggle={() => toggleSection('cvs')}
            >
              {result.cvs_mal_classes.map(c => (
                <div key={`cv-${c.id}-${c.suspected_type}`} style={rowStyle}>
                  <div style={avatarStyle}>
                    <FileText size={18} color="#EF4444" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameStyle}>{c.prenom} {c.nom}</div>
                    <div style={issueStyle}>
                      <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                      CV = &quot;{c.cv_nom_fichier}&quot; — {c.suspected_type}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <FixButton
                      label="Corriger"
                      loading={fixingIds.has(c.id)}
                      done={fixedIds.has(c.id)}
                      onClick={() => fixCandidat(c.id, 'move_cv_to_documents')}
                      color="#3B82F6"
                    />
                    <ViewButton id={c.id} />
                  </div>
                </div>
              ))}
            </AuditSection>
          )}

          {/* Fiches incompletes */}
          {result.fiches_incompletes.length > 0 && (
            <AuditSection
              title="Fiches incompletes"
              icon={<ClipboardList size={16} />}
              count={result.fiches_incompletes.length}
              color="#3B82F6"
              isOpen={openSections.fiches}
              onToggle={() => toggleSection('fiches')}
            >
              {result.fiches_incompletes.map(f => (
                <div key={f.id} style={rowStyle}>
                  <div style={avatarStyle}>
                    <ClipboardList size={18} color="#3B82F6" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameStyle}>{f.prenom} {f.nom}</div>
                    <div style={issueStyle}>
                      Champs manquants : {f.missing_fields.join(', ')}
                    </div>
                  </div>
                  <ViewButton id={f.id} />
                </div>
              ))}
            </AuditSection>
          )}

          {/* Sans CV */}
          {result.sans_cv.length > 0 && (
            <AuditSection
              title="Sans CV"
              icon={<Paperclip size={16} />}
              count={result.sans_cv.length}
              color="#64748B"
              isOpen={openSections.sans_cv}
              onToggle={() => toggleSection('sans_cv')}
            >
              {result.sans_cv.map(sc => (
                <div key={sc.id} style={rowStyle}>
                  <div style={avatarStyle}>
                    <Paperclip size={18} color="#64748B" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameStyle}>{sc.prenom} {sc.nom}</div>
                    <div style={issueStyle}>
                      {sc.has_documents ? 'Pas de CV mais des documents sont presents' : 'Aucun CV ni document'}
                    </div>
                  </div>
                  <ViewButton id={sc.id} />
                </div>
              ))}
            </AuditSection>
          )}

          {/* All clean */}
          {analysisPhase === 'done' && s.photos_suspectes === 0 && s.cvs_mal_classes === 0 && s.fiches_incompletes === 0 && s.sans_cv === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              borderRadius: 16, background: '#F0FDF4', border: '1.5px solid #BBF7D0',
            }}>
              <CheckCircle size={32} style={{ color: '#10B981', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16A34A' }}>Base parfaite !</div>
              <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>Aucune anomalie detectee.</div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeInAudit { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="neo-kpi" style={{
      padding: '20px 16px 16px', borderRadius: 16, textAlign: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: color, borderRadius: '16px 16px 0 0', opacity: 0.7,
      }} />
      <div style={{ color, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{
        fontSize: 28, fontWeight: 900, color, lineHeight: 1,
        fontFamily: 'var(--font-heading)',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginTop: 6,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
    </div>
  )
}

function AuditSection({
  title, icon, count, color, isOpen, onToggle, children,
}: {
  title: string; icon: React.ReactNode; count: number; color: string
  isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="neo-card-soft" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '14px 20px', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
        }}
      >
        <div style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', flex: 1, textAlign: 'left' }}>
          {title}
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 99, background: `${color}18`, color,
          }}>
            {count}
          </span>
        </span>
        {isOpen ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </button>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 20px 16px', maxHeight: 500, overflowY: 'auto' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ViewButton({ id }: { id: string }) {
  return (
    <a
      href={`/candidats/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        border: '1.5px solid var(--border)', background: 'var(--secondary)',
        color: 'var(--foreground)', textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      <ExternalLink size={11} /> Voir
    </a>
  )
}

function FixButton({
  label, loading, done, onClick, color,
}: {
  label: string; loading: boolean; done: boolean; onClick: () => void; color: string
}) {
  if (done) {
    return (
      <span style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        background: '#F0FDF4', border: '1.5px solid #BBF7D0', color: '#16A34A',
        whiteSpace: 'nowrap',
      }}>
        <CheckCircle size={11} /> OK
      </span>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        border: `1.5px solid ${color}40`, background: `${color}10`,
        color, cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Wrench size={11} />}
      {label}
    </button>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 0', borderBottom: '1px solid var(--border)',
}

const avatarStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10,
  background: 'var(--secondary)', border: '1.5px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

const nameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2,
}

const issueStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', marginTop: 2,
  display: 'flex', alignItems: 'center', gap: 4,
}
