'use client'
import { useState } from 'react'
import { Sparkles, CheckCircle, XCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCandidats } from '@/hooks/useCandidats'
import { useOffres } from '@/hooks/useOffres'
import { useCalculerScore } from '@/hooks/usePipeline'
import { cn } from '@/lib/utils'

function scoreColor(score: number) {
  if (score >= 75) return { text: 'text-emerald-400', bg: 'bg-emerald-500/15', bar: 'bg-emerald-500' }
  if (score >= 50) return { text: 'text-primary', bg: 'bg-primary/15', bar: 'bg-primary' }
  return { text: 'text-rose-400', bg: 'bg-rose-500/15', bar: 'bg-rose-500' }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const colors = scoreColor(value)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/40">{label}</span>
        <span className={cn('text-sm font-bold', colors.text)}>{value}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', colors.bar)} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export default function MatchingPage() {
  const [selectedOffre, setSelectedOffre] = useState<string>('')
  const [selectedCandidat, setSelectedCandidat] = useState<string>('')
  const [result, setResult] = useState<any>(null)

  const { data: offres } = useOffres()
  const { data: candidats } = useCandidats()
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
    <div className="p-6 max-w-2xl">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Matching IA
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Calculez le score de compatibilité entre un candidat et une offre via Claude
        </p>
      </div>

      {/* Selector Card */}
      <div className="rounded-xl border border-white/6 bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Offre d&apos;emploi</label>
          <Select value={selectedOffre} onValueChange={setSelectedOffre}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/70 h-10">
              <SelectValue placeholder="Sélectionner une offre..." />
            </SelectTrigger>
            <SelectContent>
              {offres?.map(o => <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-xs text-white/20 font-medium">vs</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Candidat</label>
          <Select value={selectedCandidat} onValueChange={setSelectedCandidat}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/70 h-10">
              <SelectValue placeholder="Sélectionner un candidat..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.prenom} {c.nom} — {c.titre_poste || 'Sans titre'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleMatch}
          disabled={!ready || calculerScore.isPending}
          className="w-full h-10"
        >
          {calculerScore.isPending ? (
            <>
              <Zap className="w-4 h-4 mr-2 animate-pulse" />
              Analyse Claude en cours...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Calculer le score de matching
            </>
          )}
        </Button>
      </div>

      {/* Result */}
      {result && colors && (
        <div className="mt-4 rounded-xl border border-white/6 bg-card p-6 space-y-5">
          {/* Score principal */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">Score global</p>
              <p className={cn('text-5xl font-black tracking-tight', colors.text)}>
                {result.score}
                <span className="text-2xl text-white/20">/100</span>
              </p>
            </div>
            <div className={cn('w-20 h-20 rounded-full border-4 flex items-center justify-center', colors.bg, `border-current`)}>
              <span className={cn('text-lg font-black', colors.text)}>
                {result.score >= 75 ? 'Fort' : result.score >= 50 ? 'Moy.' : 'Faible'}
              </span>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-3">
            <ScoreBar label="Compétences" value={result.score_competences} />
            <ScoreBar label="Expérience" value={result.score_experience} />
          </div>

          {/* Compétences */}
          {result.competences_matchees?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 mb-2.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Compétences correspondantes ({result.competences_matchees.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.competences_matchees.map((c: string) => (
                  <span key={c} className="text-xs bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          {result.competences_manquantes?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 mb-2.5">
                <XCircle className="w-3.5 h-3.5" />
                Compétences manquantes ({result.competences_manquantes.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.competences_manquantes.map((c: string) => (
                  <span key={c} className="text-xs bg-rose-500/15 text-rose-400 px-2.5 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          {result.explication && (
            <div className="pt-4 border-t border-white/5">
              <p className="text-xs text-white/40 leading-relaxed">{result.explication}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
