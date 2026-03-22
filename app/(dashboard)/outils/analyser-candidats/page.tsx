'use client'

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set())
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set())

  // Deep analysis state — CVs
  const [deepRunning, setDeepRunning] = useState(false)
  const [deepProgress, setDeepProgress] = useState({ scanned: 0, total: 0 })
  const [deepProblems, setDeepProblems] = useState<Array<{
    id: string; nom: string; prenom: string | null; cv_nom_fichier: string | null
    isCV: boolean; confidence: number; reason: string
  }>>([])
  const [deepDone, setDeepDone] = useState(false)

  // Deep analysis state — Photos
  const [photoRunning, setPhotoRunning] = useState(false)
  const [photoProgress, setPhotoProgress] = useState({ scanned: 0, total: 0 })
  const [photoProblems, setPhotoProblems] = useState<Array<{
    id: string; nom: string; prenom: string | null; photo_url: string; reason: string
  }>>([])
  const [photoDone, setPhotoDone] = useState(false)

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

  async function runDeepAnalysis() {
    setDeepRunning(true)
    setDeepProblems([])
    setDeepDone(false)
    setDeepProgress({ scanned: 0, total: 0 })

    let offset = 0
    const batchSize = 10
    const allProblems: typeof deepProblems = []

    try {
      while (true) {
        const res = await fetch('/api/candidats/audit/deep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: batchSize }),
        })
        const data = await res.json()
        if (!res.ok) break

        setDeepProgress({ scanned: offset + data.scanned, total: data.total })
        if (data.problems?.length) {
          allProblems.push(...data.problems)
          setDeepProblems([...allProblems])
        }

        offset += batchSize
        if (offset >= data.total) break
      }
    } catch {}

    setDeepRunning(false)
    setDeepDone(true)
  }

  async function runPhotoAnalysis() {
    setPhotoRunning(true)
    setPhotoProblems([])
    setPhotoDone(false)
    setPhotoProgress({ scanned: 0, total: 0 })

    let offset = 0
    const batchSize = 15
    const allProblems: typeof photoProblems = []

    try {
      while (true) {
        const res = await fetch('/api/candidats/audit/deep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: batchSize, mode: 'photo' }),
        })
        const data = await res.json()
        if (!res.ok) break

        setPhotoProgress({ scanned: offset + data.scanned, total: data.total })
        if (data.problems?.length) {
          allProblems.push(...data.problems)
          setPhotoProblems([...allProblems])
        }

        offset += batchSize
        if (offset >= data.total) break
      }
    } catch {}

    setPhotoRunning(false)
    setPhotoDone(true)
  }

  async function runAudit() {
    setLoading(true)
    setError(null)
    setResult(null)
    setFixedIds(new Set())
    try {
      const res = await fetch('/api/candidats/audit')
      if (!res.ok) throw new Error('Erreur serveur')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
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

  const s = result?.summary

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
          onClick={runAudit}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 800,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, var(--primary), #E8940A)',
            color: '#0F172A', fontFamily: 'inherit',
            boxShadow: '0 2px 12px rgba(245,167,35,0.3)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyse en cours...</>
          ) : (
            <><Search size={16} /> Lancer l&apos;analyse</>
          )}
        </button>
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
      {!loading && !result && !error && (
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
            Cliquez sur &laquo; Lancer l&apos;analyse &raquo; pour scanner votre base candidats et detecter les anomalies.
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 16, color: '#8B5CF6' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Analyse en cours...</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Scan de tous les candidats</div>
        </div>
      )}

      {/* Results */}
      {result && s && (
        <div style={{ animation: 'fadeInAudit 0.4s ease' }}>
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
                <div key={p.id} style={rowStyle}>
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
                <div key={c.id} style={rowStyle}>
                  <div style={avatarStyle}>
                    <FileText size={18} color="#EF4444" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameStyle}>{c.prenom} {c.nom}</div>
                    <div style={issueStyle}>
                      <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                      CV = &quot;{c.cv_nom_fichier}&quot; — type detecte : {c.suspected_type}
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

          {/* ── Analyse approfondie (contenu PDF) ── */}
          <div style={{
            borderRadius: 16, border: '1.5px solid #C4B5FD', background: 'var(--card)',
            padding: 20, marginTop: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: deepDone || deepRunning ? 16 : 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Search size={16} color="#8B5CF6" />
                  Analyse approfondie des CVs
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Vérifie le contenu réel des PDFs pour détecter les certificats/attestations classés comme CV
                </p>
              </div>
              {!deepRunning && (
                <button onClick={runDeepAnalysis} style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  border: 'none', background: '#8B5CF6', color: 'white',
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                }}>
                  {deepDone ? 'Relancer' : 'Lancer'}
                </button>
              )}
            </div>

            {/* Progress */}
            {deepRunning && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                  <span>{deepProgress.scanned} / {deepProgress.total} candidats analysés</span>
                  <span>{deepProgress.total > 0 ? Math.round((deepProgress.scanned / deepProgress.total) * 100) : 0}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${deepProgress.total > 0 ? (deepProgress.scanned / deepProgress.total) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)', borderRadius: 99, transition: 'width 0.3s',
                  }} />
                </div>
                {deepProblems.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                    🚨 {deepProblems.length} document{deepProblems.length > 1 ? 's' : ''} mal classé{deepProblems.length > 1 ? 's' : ''} trouvé{deepProblems.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Results */}
            {deepDone && deepProblems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#10B981', fontSize: 13, fontWeight: 600 }}>
                ✅ Tous les CVs sont correctement classés
              </div>
            )}
            {deepDone && deepProblems.length > 0 && (
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                  {deepProblems.length} document{deepProblems.length > 1 ? 's' : ''} mal classé{deepProblems.length > 1 ? 's' : ''} :
                </p>
                {deepProblems.map(p => (
                  <div key={p.id} style={{ ...rowStyle, borderColor: '#FECACA' }}>
                    <div style={{ ...avatarStyle, background: '#FEF2F2', borderColor: '#FECACA' }}>
                      <AlertTriangle size={18} color="#DC2626" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={nameStyle}>{p.prenom} {p.nom}</div>
                      <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>
                        {p.cv_nom_fichier}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                        {p.reason} ({p.confidence}% confiance)
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <FixButton
                        label="Corriger"
                        loading={fixingIds.has(p.id)}
                        done={fixedIds.has(p.id)}
                        color="#DC2626"
                        onClick={async () => {
                          setFixingIds(prev => new Set(prev).add(p.id))
                          try {
                            await fetch('/api/candidats/audit/fix', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ candidatId: p.id, action: 'move_cv_to_documents' }),
                            })
                            setFixedIds(prev => new Set(prev).add(p.id))
                          } catch {}
                          setFixingIds(prev => { const n = new Set(prev); n.delete(p.id); return n })
                        }}
                      />
                      <ViewButton id={p.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Analyse approfondie Photos ── */}
          <div style={{
            borderRadius: 16, border: '1.5px solid #FDE68A', background: 'var(--card)',
            padding: 20, marginTop: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: photoDone || photoRunning ? 16 : 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Image size={16} color="#F59E0B" />
                  Analyse approfondie des Photos
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Vérifie les dimensions et le ratio de chaque photo (logos, documents scannés, icônes)
                </p>
              </div>
              {!photoRunning && (
                <button onClick={runPhotoAnalysis} style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  border: 'none', background: '#F59E0B', color: '#0F172A',
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                }}>
                  {photoDone ? 'Relancer' : 'Lancer'}
                </button>
              )}
            </div>

            {photoRunning && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                  <span>{photoProgress.scanned} / {photoProgress.total} photos analysées</span>
                  <span>{photoProgress.total > 0 ? Math.round((photoProgress.scanned / photoProgress.total) * 100) : 0}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${photoProgress.total > 0 ? (photoProgress.scanned / photoProgress.total) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #F59E0B, #EAB308)', borderRadius: 99, transition: 'width 0.3s',
                  }} />
                </div>
                {photoProblems.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                    🚨 {photoProblems.length} photo{photoProblems.length > 1 ? 's' : ''} suspecte{photoProblems.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {photoDone && photoProblems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#10B981', fontSize: 13, fontWeight: 600 }}>
                ✅ Toutes les photos semblent correctes
              </div>
            )}
            {photoDone && photoProblems.length > 0 && (
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>
                  {photoProblems.length} photo{photoProblems.length > 1 ? 's' : ''} suspecte{photoProblems.length > 1 ? 's' : ''} :
                </p>
                {photoProblems.map(p => (
                  <div key={p.id} style={{ ...rowStyle, borderColor: '#FDE68A' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '2px solid #FDE68A' }}>
                      <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={nameStyle}>{p.prenom} {p.nom}</div>
                      <div style={{ fontSize: 10, color: '#D97706', marginTop: 2 }}>{p.reason}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <FixButton
                        label="Supprimer"
                        loading={fixingIds.has(p.id)}
                        done={fixedIds.has(p.id)}
                        color="#DC2626"
                        onClick={async () => {
                          setFixingIds(prev => new Set(prev).add(p.id))
                          try {
                            await fetch('/api/candidats/audit/fix', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ candidatId: p.id, action: 'remove_photo' }),
                            })
                            setFixedIds(prev => new Set(prev).add(p.id))
                          } catch {}
                          setFixingIds(prev => { const n = new Set(prev); n.delete(p.id); return n })
                        }}
                      />
                      <ViewButton id={p.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All clean */}
          {s.photos_suspectes === 0 && s.cvs_mal_classes === 0 && s.fiches_incompletes === 0 && s.sans_cv === 0 && (
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
