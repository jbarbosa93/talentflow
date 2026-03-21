'use client'
import { useState } from 'react'
import { Sparkles, CheckCircle, XCircle, Zap, Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCandidats } from '@/hooks/useCandidats'
import { useOffres } from '@/hooks/useOffres'
import { useCalculerScore } from '@/hooks/usePipeline'

function scoreColor(score: number) {
  if (score >= 75) return { text: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', bar: '#22C55E', label: 'Fort' }
  if (score >= 50) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', bar: '#F59E0B', label: 'Moyen' }
  return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', bar: '#EF4444', label: 'Faible' }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const c = scoreColor(value)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: c.bar, borderRadius: 99, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  )
}

export default function MatchingPage() {
  const [selectedOffre, setSelectedOffre] = useState('')
  const [selectedCandidat, setSelectedCandidat] = useState('')
  const [result, setResult] = useState<any>(null)

  const { data: offres } = useOffres(true)
  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const calculerScore = useCalculerScore()

  const handleMatch = () => {
    if (!selectedOffre || !selectedCandidat) return
    setResult(null)
    calculerScore.mutate(
      { candidat_id: selectedCandidat, offre_id: selectedOffre },
      { onSuccess: (data) => setResult(data.score) }
    )
  }

  const ready = !!(selectedOffre && selectedCandidat)
  const colors = result ? scoreColor(result.score) : null

  return (
    <div className="d-page" style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Sparkles size={22} color="var(--primary)" />
          Matching IA
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
          Calculez le score de compatibilité entre un candidat et une commande via Claude AI
        </p>
      </div>

      {/* Selector Card */}
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--card-shadow)' }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Commande client
          </label>
          <Select value={selectedOffre} onValueChange={setSelectedOffre}>
            <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 42 }}>
              <SelectValue placeholder="Sélectionner une commande..." />
            </SelectTrigger>
            <SelectContent>
              {offres?.length === 0 ? (
                <SelectItem value="_" disabled>Aucune commande — créez-en une d&apos;abord</SelectItem>
              ) : (
                offres?.map(o => <SelectItem key={o.id} value={o.id}>{o.client_nom ? `${o.client_nom} — ` : ''}{o.titre}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>vs</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Candidat
          </label>
          <Select value={selectedCandidat} onValueChange={setSelectedCandidat}>
            <SelectTrigger style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', height: 42 }}>
              <SelectValue placeholder="Sélectionner un candidat..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.length === 0 ? (
                <SelectItem value="_" disabled>Aucun candidat — importez des CVs d'abord</SelectItem>
              ) : (
                candidats?.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.prenom} {c.nom} {c.titre_poste ? `— ${c.titre_poste}` : ''}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <button
          onClick={handleMatch}
          disabled={!ready || calculerScore.isPending}
          style={{
            width: '100%', height: 44,
            background: ready && !calculerScore.isPending ? 'var(--foreground)' : 'var(--secondary)',
            color: ready && !calculerScore.isPending ? 'white' : 'var(--muted)',
            border: 'none', borderRadius: 'var(--radius)', cursor: ready ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-body)', transition: 'all 0.15s',
          }}
        >
          {calculerScore.isPending ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Analyse Claude en cours...</>
          ) : (
            <><Sparkles size={16} />Calculer le score de matching</>
          )}
        </button>
      </div>

      {/* Result */}
      {result && colors && (
        <div style={{ marginTop: 20, background: 'var(--card)', border: `2px solid ${colors.border}`, borderRadius: 'var(--radius-lg)', padding: 28, boxShadow: 'var(--card-shadow)' }}>

          {/* Score principal */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Score global</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 52, fontWeight: 900, color: colors.text, lineHeight: 1 }}>{result.score}</span>
                <span style={{ fontSize: 22, color: '#CBD5E1' }}>/100</span>
              </div>
            </div>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: colors.bg, border: `3px solid ${colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: colors.text }}>{colors.label}</span>
            </div>
          </div>

          {/* Barres */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            <ScoreBar label="Compétences" value={result.score_competences} />
            <ScoreBar label="Expérience" value={result.score_experience} />
          </div>

          {/* Compétences matchées */}
          {result.competences_matchees?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <CheckCircle size={14} />Compétences correspondantes ({result.competences_matchees.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.competences_matchees.map((c: string) => (
                  <span key={c} style={{ fontSize: 12, background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC', padding: '4px 12px', borderRadius: 99, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Compétences manquantes */}
          {result.competences_manquantes?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <XCircle size={14} />Compétences manquantes ({result.competences_manquantes.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.competences_manquantes.map((c: string) => (
                  <span key={c} style={{ fontSize: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '4px 12px', borderRadius: 99, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Explication */}
          {result.explication && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{result.explication}</p>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
