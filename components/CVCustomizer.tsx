'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, Download, Loader2, Check, MapPin, Calendar, Car, User, Briefcase, FileText, BookOpen, Languages, Paperclip, Plus, Trash2, ChevronUp, ChevronDown, Eye, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Candidat {
  id: string
  prenom?: string | null
  nom?: string | null
  email?: string | null
  telephone?: string | null
  localisation?: string | null
  titre_poste?: string | null
  date_naissance?: string | null
  resume_ia?: string | null
  competences?: string[] | null
  formation?: string | null
  langues?: string[] | null
  permis_conduire?: boolean | null
  experiences?: any[] | null
  formations_details?: any[] | null
  genre?: 'homme' | 'femme' | null
  cv_url?: string | null
}

type Civilite = 'Monsieur' | 'Madame' | 'Monsieur/Madame'

function defaultCivilite(genre?: 'homme' | 'femme' | null): Civilite {
  if (genre === 'homme') return 'Monsieur'
  if (genre === 'femme') return 'Madame'
  return 'Monsieur/Madame'
}

interface Experience {
  poste: string
  entreprise: string
  date_debut?: string   // YYYY-MM
  date_fin?: string     // YYYY-MM — ignoré si current=true
  current?: boolean
  description: string
  periode?: string      // legacy fallback si non-parsable
}

// v1.9.71 — Formations avec structure similaire aux Expériences (user request)
interface Formation {
  diplome: string
  etablissement: string
  date_debut?: string   // YYYY-MM
  date_fin?: string     // YYYY-MM — ignoré si current=true
  current?: boolean
  description?: string
  annee?: string        // legacy fallback
}

const SECTIONS = [
  { key: 'resume', label: 'Profil / Résumé', icon: User },
  { key: 'competences', label: 'Compétences', icon: Briefcase },
  { key: 'experiences', label: 'Expériences professionnelles', icon: FileText },
  { key: 'formations', label: 'Formations', icon: BookOpen },
  { key: 'langues', label: 'Langues', icon: Languages },
]

const INFO_FIELDS = [
  { key: 'show_localisation', label: 'Localisation', icon: MapPin },
  { key: 'show_age', label: 'Âge', icon: Calendar },
  { key: 'show_permis', label: 'Permis de conduire', icon: Car },
  { key: 'show_outille', label: 'Outillé', icon: Car },
]

const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--secondary)', color: 'var(--foreground)',
  outline: 'none', boxSizing: 'border-box' as const,
}

// ─── Helpers de parsing des anciennes périodes ─────────────────────────────
const MONTH_MAP: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1,
  fev: 2, fevr: 2, fevrier: 2,
  mars: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6,
  juil: 7, juillet: 7,
  aout: 8,
  sept: 9, septembre: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, decembre: 12,
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseMonthYear(s: string, fallbackYear?: string): string | null {
  const v = stripAccents(s.trim().toLowerCase())
  if (!v) return null
  const iso = /^(\d{4})-(\d{1,2})$/.exec(v)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(v)
  if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`
  const my = /^([a-z]+)\.?\s+(\d{4})$/.exec(v)
  if (my) {
    const m = MONTH_MAP[my[1]]
    if (m) return `${my[2]}-${String(m).padStart(2, '0')}`
  }
  const yearOnly = /^(\d{4})$/.exec(v)
  if (yearOnly) return `${yearOnly[1]}-01`
  // Mois seul → utiliser l'année de l'autre bord du tiret (ex: "Juillet - septembre 2022")
  const monthOnly = /^([a-z]+)\.?$/.exec(v)
  if (monthOnly && fallbackYear) {
    const m = MONTH_MAP[monthOnly[1]]
    if (m) return `${fallbackYear}-${String(m).padStart(2, '0')}`
  }
  return null
}

/** Extrait l'année d'un segment de type "septembre 2022" / "2022" */
function extractYear(s: string): string | null {
  const v = stripAccents(s.trim().toLowerCase())
  const y = /(\d{4})/.exec(v)
  return y ? y[1] : null
}

function normalizeExperience(exp: any): Experience {
  const base: Experience = {
    poste: exp.poste || '',
    entreprise: exp.entreprise || '',
    description: exp.description || '',
  }
  // Déjà au nouveau format ?
  if (exp.date_debut !== undefined || exp.date_fin !== undefined || exp.current !== undefined) {
    return {
      ...base,
      date_debut: exp.date_debut || undefined,
      date_fin: exp.date_fin || undefined,
      current: !!exp.current,
    }
  }
  // Parsing legacy periode
  const periode = (exp.periode || '').trim()
  if (!periode) return base
  const parts = periode.split(/\s*[-–—]\s*/)
  if (parts.length === 2) {
    const finRaw = parts[1].trim()
    const isCurrent = /^(actuel|present|aujourd)/i.test(stripAccents(finRaw.toLowerCase()))
    // Année partagée : si un côté a l'année et l'autre non, on la propage
    const yearA = extractYear(parts[0])
    const yearB = extractYear(finRaw)
    const sharedYear = yearA || yearB || undefined
    const debut = parseMonthYear(parts[0], sharedYear)
    if (debut) {
      if (isCurrent) return { ...base, date_debut: debut, current: true }
      const fin = parseMonthYear(finRaw, sharedYear)
      if (fin) return { ...base, date_debut: debut, date_fin: fin, current: false }
    }
  } else if (parts.length === 1) {
    const single = parseMonthYear(parts[0])
    if (single) return { ...base, date_debut: single }
  }
  // Échec parsing — on garde periode pour fallback rendu
  return { ...base, periode }
}

/**
 * Tri chronologique "du plus récent au plus ancien" :
 *  1. Postes actuels en premier (current: true), triés par date_debut desc entre eux
 *  2. Postes terminés ensuite, triés par date_fin desc (tiebreaker date_debut desc)
 *  3. Experiences sans aucune date parsée tombent en bas
 */
function sortExperiencesByDateDebut(arr: Experience[]): Experience[] {
  const rank = (e: Experience): number => {
    if (e.current) return 0
    if (e.date_fin || e.date_debut) return 1
    return 2
  }
  return [...arr].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb

    // Groupe 0 : postes actuels → date_debut desc
    if (ra === 0) {
      return (b.date_debut || '').localeCompare(a.date_debut || '')
    }
    // Groupe 1 : postes terminés → date_fin desc, tiebreaker date_debut desc
    if (ra === 1) {
      const fa = a.date_fin || a.date_debut || ''
      const fb = b.date_fin || b.date_debut || ''
      if (fa !== fb) return fb.localeCompare(fa)
      return (b.date_debut || '').localeCompare(a.date_debut || '')
    }
    return 0
  })
}

// v1.9.71 — normalisation Formation + tri similaire
function normalizeFormation(f: any): Formation {
  const base: Formation = {
    diplome: f.diplome || f.titre || '',
    etablissement: f.etablissement || f.ecole || f.lieu || '',
    description: f.description || '',
  }
  if (f.date_debut !== undefined || f.date_fin !== undefined || f.current !== undefined) {
    return {
      ...base,
      date_debut: f.date_debut || undefined,
      date_fin: f.date_fin || undefined,
      current: !!f.current,
    }
  }
  // Legacy : annee seule (ex "2015" ou "2012-2015")
  const annee = (f.annee || '').trim()
  if (!annee) return base
  const parts = annee.split(/\s*[-–—]\s*/)
  if (parts.length === 2) {
    const debut = parseMonthYear(parts[0])
    const fin = parseMonthYear(parts[1])
    if (debut && fin) return { ...base, date_debut: debut, date_fin: fin }
  } else {
    const single = parseMonthYear(annee)
    if (single) return { ...base, date_fin: single }
  }
  return { ...base, annee }
}

function sortFormationsByDateDebut(arr: Formation[]): Formation[] {
  return [...arr].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    const fa = a.date_fin || a.date_debut || a.annee || ''
    const fb = b.date_fin || b.date_debut || b.annee || ''
    return fb.localeCompare(fa)
  })
}

export default function CVCustomizerModal({
  candidat,
  onClose,
  mode = 'download',
  onAttach,
}: {
  candidat: Candidat
  onClose: () => void
  mode?: 'download' | 'mailing'
  onAttach?: (candidatId: string, options: any) => void
}) {
  const [sections, setSections] = useState<Record<string, boolean>>({
    resume: true,
    competences: true,
    experiences: true,
    formations: true,
    langues: true,
  })
  const [infoFields, setInfoFields] = useState<Record<string, boolean>>({
    show_localisation: true,
    show_age: true,
    show_permis: !!candidat.permis_conduire,
    show_outille: false,
  })
  const [customContent, setCustomContent] = useState<Record<string, string>>({})
  const [experiences, setExperiences] = useState<Experience[]>([])
  // v1.9.71 — Formations avec même structure que Expériences
  const [formations, setFormations] = useState<Formation[]>([])
  const [civilite, setCivilite] = useState<Civilite>(defaultCivilite(candidat.genre))
  const [recruiterInfo, setRecruiterInfo] = useState<{ prenom: string; nom: string; email: string; telephone?: string; entreprise?: string } | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter() // v1.9.71 — pour bouton Envoyer
  const [downloading, setDownloading] = useState(false)
  const [customizationLoading, setCustomizationLoading] = useState(true)
  const [attached, setAttached] = useState(false)

  const initialLoadDone = useRef(false)
  const saveAbort = useRef<AbortController | null>(null)
  const previewAbort = useRef<AbortController | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Récupérer les infos du recruteur connecté
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {}
        setRecruiterInfo({
          prenom: meta.prenom || '',
          nom: meta.nom || '',
          email: session.user.email || '',
          telephone: meta.telephone || meta.phone || meta.mobile || '',
          entreprise: meta.entreprise || 'L-Agence SA',
        })
      }
    })
  }, [])

  // Chargement initial : customization sauvegardée OU valeurs candidat
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // v1.9.123 — La liste candidats (/api/candidats LIST_COLUMNS) ne renvoie PAS
        // experiences ni formations_details (champs JSON lourds, exclus de la liste).
        // Quand CVCustomizer s'ouvre depuis /messages, le `candidat` reçu n'a donc pas
        // ces champs. On fetch la fiche complète via /api/candidats/[id] avant de
        // décider quoi mettre dans les states. Si déjà présents (ouverture depuis la
        // fiche complète), on skip le fetch.
        let fullCandidat: any = candidat
        const hasFullData = Array.isArray((candidat as any).experiences)
          || Array.isArray((candidat as any).formations_details)
        if (!hasFullData) {
          try {
            const fullRes = await fetch(`/api/candidats/${candidat.id}`, { credentials: 'include' })
            if (fullRes.ok) {
              const fullJson = await fullRes.json()
              const c = fullJson?.candidat ?? fullJson
              if (c && (c.experiences !== undefined || c.formations_details !== undefined)) {
                fullCandidat = { ...candidat, ...c }
              }
            }
          } catch { /* fallback sur candidat partiel ci-dessous */ }
          if (cancelled) return
        }

        const res = await fetch(`/api/cv-customizations?candidat_id=${candidat.id}`, { credentials: 'include' })
        if (cancelled) return
        const json = await res.json()
        const saved = json?.customization?.data

        if (saved) {
          // Restaurer depuis la sauvegarde
          if (saved.sections) setSections(saved.sections)
          if (saved.infoFields) setInfoFields(saved.infoFields)
          if (saved.customContent) setCustomContent(saved.customContent)
          if (saved.civilite === 'Monsieur' || saved.civilite === 'Madame' || saved.civilite === 'Monsieur/Madame') {
            setCivilite(saved.civilite)
          } else {
            setCivilite(defaultCivilite(fullCandidat.genre))
          }
          // v1.9.122 — Si saved.experiences est vide [] mais candidat.experiences en a,
          // on retombe sur les valeurs candidat (cas race condition / corruption ancienne).
          // Si l'utilisateur veut vraiment 0 exp, il décoche "Inclure expériences".
          if (Array.isArray(saved.experiences) && saved.experiences.length > 0) {
            // Respecter l'ordre manuel sauvegardé par le consultant — pas de re-tri
            setExperiences(saved.experiences.map(normalizeExperience))
          } else {
            setExperiences(sortExperiencesByDateDebut((fullCandidat.experiences || []).map(normalizeExperience)))
          }
          // v1.9.71 — formations | v1.9.122 — même garde-fou length > 0
          if (Array.isArray(saved.formations) && saved.formations.length > 0) {
            setFormations(saved.formations.map(normalizeFormation))
          } else {
            const initialFormations = (fullCandidat.formations_details as any[]) || []
            setFormations(sortFormationsByDateDebut(initialFormations.map(normalizeFormation)))
          }
        } else {
          // Valeurs initiales depuis la fiche candidat
          setCustomContent({
            nom_complet: [fullCandidat.prenom, fullCandidat.nom].filter(Boolean).join(' '),
            titre_poste: fullCandidat.titre_poste || '',
            localisation: fullCandidat.localisation || '',
            resume_ia: fullCandidat.resume_ia || '',
            formation: fullCandidat.formation || '',
            competences: fullCandidat.competences?.join(', ') || '',
          })
          setExperiences(sortExperiencesByDateDebut((fullCandidat.experiences || []).map(normalizeExperience)))
          setFormations(sortFormationsByDateDebut(((fullCandidat.formations_details as any[]) || []).map(normalizeFormation)))
        }
      } catch (e) {
        // Fallback valeurs candidat en cas d'erreur
        setCustomContent({
          nom_complet: [candidat.prenom, candidat.nom].filter(Boolean).join(' '),
          titre_poste: candidat.titre_poste || '',
          localisation: candidat.localisation || '',
          resume_ia: candidat.resume_ia || '',
          formation: candidat.formation || '',
          competences: candidat.competences?.join(', ') || '',
        })
        setExperiences(sortExperiencesByDateDebut((candidat.experiences || []).map(normalizeExperience)))
        setFormations(sortFormationsByDateDebut(((candidat.formations_details as any[]) || []).map(normalizeFormation)))
      } finally {
        if (!cancelled) {
          setCustomizationLoading(false)
          // Marquer le load terminé au prochain tick pour que les setState aient eu le temps de s'appliquer
          setTimeout(() => { initialLoadDone.current = true }, 0)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [candidat.id])

  // Construire le payload pour /api/cv/generate
  const buildPayload = () => ({
    candidat_id: candidat.id,
    included_sections: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
    recruiter_info: recruiterInfo || undefined,
    custom_content: {
      ...customContent,
      show_localisation: infoFields.show_localisation ? '1' : '0',
      show_age: infoFields.show_age ? '1' : '0',
      show_permis: infoFields.show_permis ? '1' : '0',
      show_outille: infoFields.show_outille ? '1' : '0',
      age: customContent.age || '',
      competences: customContent.competences || candidat.competences?.join(', ') || '',
    },
    experiences_override: experiences,
    formations_override: formations, // v1.9.71
  })

  // Auto-save + auto-regenerate avec debounce 500ms
  useEffect(() => {
    if (!initialLoadDone.current) return
    if (customizationLoading) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(async () => {
      const payload = buildPayload()

      // Sauvegarde cv_customizations (cancellable)
      if (saveAbort.current) saveAbort.current.abort()
      saveAbort.current = new AbortController()
      fetch('/api/cv-customizations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: saveAbort.current.signal,
        body: JSON.stringify({
          candidat_id: candidat.id,
          data: {
            sections,
            infoFields,
            customContent,
            experiences,
            formations, // v1.9.71
            civilite,
          },
        }),
      }).catch(err => {
        if (err?.name !== 'AbortError') console.warn('[cv-custom save]', err)
      })

      // Régénération preview (cancellable)
      if (previewAbort.current) previewAbort.current.abort()
      previewAbort.current = new AbortController()
      setLoading(true)
      try {
        const res = await fetch('/api/cv/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: previewAbort.current.signal,
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Erreur génération')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[cv preview]', err)
        }
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [sections, infoFields, customContent, experiences, formations, civilite, customizationLoading])

  // Cleanup URL objet au démontage
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      if (saveAbort.current) saveAbort.current.abort()
      if (previewAbort.current) previewAbort.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload()),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}_LAgence.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CV téléchargé')
    } catch {
      toast.error('Erreur téléchargement')
    }
    setDownloading(false)
  }

  const handleAttach = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload()),
      })
      const blob = await res.blob()
      const buffer = await blob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      onAttach?.(candidat.id, {
        pdfBase64: base64,
        includedSections: buildPayload().included_sections,
      })
      setAttached(true)
      toast.success(`CV personnalisé de ${candidat.prenom} ${candidat.nom} joint au mail`)
    } catch {
      toast.error('Erreur génération du CV personnalisé')
    }
    setDownloading(false)
  }

  // ─── Édition expériences ─────────────────────────────────────────────────
  const updateExperience = (idx: number, patch: Partial<Experience>) => {
    setExperiences(prev => prev.map((exp, i) => (i === idx ? { ...exp, ...patch } : exp)))
  }

  const deleteExperience = (idx: number) => {
    setExperiences(prev => prev.filter((_, i) => i !== idx))
  }

  const moveExperience = (idx: number, direction: -1 | 1) => {
    setExperiences(prev => {
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // v1.9.71 — Helpers Formation (mêmes patterns que Experience)
  const updateFormation = (idx: number, patch: Partial<Formation>) => {
    setFormations(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }
  const deleteFormation = (idx: number) => {
    setFormations(prev => prev.filter((_, i) => i !== idx))
  }
  const moveFormation = (idx: number, direction: -1 | 1) => {
    setFormations(prev => {
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }
  const addFormation = () => {
    setFormations(prev => [...prev, { diplome: '', etablissement: '', description: '' }])
  }

  const handleReset = async () => {
    if (!confirm('Réinitialiser la personnalisation ? Toutes vos modifications (textes, expériences, ordre, civilité) seront effacées et remplacées par les données de la fiche candidat.')) return

    try {
      // Supprimer la customization côté serveur
      await fetch(`/api/cv-customizations?candidat_id=${candidat.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch (e) {
      console.warn('[cv-custom reset] delete error', e)
    }

    // Bloquer l'auto-save pendant la réinitialisation
    initialLoadDone.current = false

    // Recharger les valeurs candidat avec tri automatique
    setSections({ resume: true, competences: true, experiences: true, formations: true, langues: true })
    setInfoFields({
      show_localisation: true,
      show_age: true,
      show_permis: !!candidat.permis_conduire,
      show_outille: false,
    })
    setCustomContent({
      nom_complet: [candidat.prenom, candidat.nom].filter(Boolean).join(' '),
      titre_poste: candidat.titre_poste || '',
      localisation: candidat.localisation || '',
      resume_ia: candidat.resume_ia || '',
      formation: candidat.formation || '',
      competences: candidat.competences?.join(', ') || '',
    })
    setExperiences(sortExperiencesByDateDebut((candidat.experiences || []).map(normalizeExperience)))
    setCivilite(defaultCivilite(candidat.genre))

    toast.success('Personnalisation réinitialisée')

    // Réactiver l'auto-save au prochain tick
    setTimeout(() => { initialLoadDone.current = true }, 0)
  }

  const addExperience = () => {
    setExperiences(prev => [
      { poste: '', entreprise: '', date_debut: '', date_fin: '', current: false, description: '' },
      ...prev,
    ])
  }

  const Checkbox = ({ checked, onClick, size = 20 }: { checked: boolean; onClick: () => void; size?: number }) => (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: 6, flexShrink: 0,
        border: checked ? '2px solid var(--primary)' : '2px solid var(--border)',
        background: checked ? 'var(--primary)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {checked && <Check size={size - 6} color="#1C1A14" strokeWidth={3} />}
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 16,
          width: '97vw', maxWidth: 1500, height: '92vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--secondary)',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
              Personnaliser le CV
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {candidat.prenom} {candidat.nom} — {loading ? 'Génération…' : 'Aperçu mis à jour automatiquement'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading && (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
            )}
            <button
              onClick={handleReset}
              title="Réinitialiser à la fiche candidat (efface la customization)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', fontSize: 12, fontWeight: 700,
                fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}
            >
              ↻ Réinitialiser
            </button>
            {/* Aperçu CV original (hover) */}
            {candidat.cv_url && (
              <CvOriginalHoverButton cvUrl={candidat.cv_url} label={`${candidat.prenom} ${candidat.nom}`} />
            )}
            {mode === 'mailing' ? (
              <button onClick={attached ? () => setAttached(false) : handleAttach}
                className="neo-btn-yellow neo-btn-sm"
                style={{
                  background: attached ? 'var(--success)' : undefined,
                  color: attached ? 'var(--destructive-foreground)' : undefined,
                }}>
                {attached ? <><Check size={14} /> Joint au mail</> : <><Paperclip size={14} /> Joindre au mail</>}
              </button>
            ) : (
              <>
                <button onClick={handleDownload} disabled={downloading}
                  className="neo-btn-yellow neo-btn-sm">
                  {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                  Télécharger PDF
                </button>
                {/* v1.9.71 — Bouton Envoyer : redirige vers /messages avec candidat présélectionné */}
                <button
                  onClick={() => {
                    router.push(`/messages?candidat_id=${candidat.id}&attach=perso`)
                    onClose()
                  }}
                  className="neo-btn-sm"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 7,
                    background: 'var(--info)', color: 'var(--destructive-foreground)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: 700,
                  }}
                  title="Envoyer ce CV par email"
                >
                  <Mail size={14} />
                  Envoyer
                </button>
              </>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 6 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body : 2 colonnes */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left : contrôles */}
          <div style={{ width: 520, flexShrink: 0, overflowY: 'auto', padding: 24, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Sections toggles */}
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Sections à inclure
              </h3>
              {SECTIONS.map(s => {
                const Icon = s.icon
                return (
                  <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={sections[s.key]} onClick={() => setSections(p => ({ ...p, [s.key]: !p[s.key] }))} />
                    <Icon size={14} color="var(--muted)" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{s.label}</span>
                  </label>
                )
              })}
            </div>

            {/* Info fields toggles */}
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Informations personnelles
              </h3>
              {INFO_FIELDS.map(f => {
                const Icon = f.icon
                return (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={infoFields[f.key]} onClick={() => setInfoFields(p => ({ ...p, [f.key]: !p[f.key] }))} size={18} />
                    <Icon size={14} color="var(--muted)" />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>{f.label}</span>
                  </label>
                )
              })}
            </div>

            {/* Editable fields */}
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Modifier le contenu
              </h3>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <User size={11} /> Civilité
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)', marginLeft: 'auto' }}>
                    (utilisée dans les mailings)
                  </span>
                </label>
                <select
                  value={civilite}
                  onChange={e => setCivilite(e.target.value as Civilite)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
                >
                  <option value="Monsieur">Monsieur</option>
                  <option value="Madame">Madame</option>
                  <option value="Monsieur/Madame">Monsieur/Madame (non précisé)</option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <User size={11} /> Nom complet
                </label>
                <input value={customContent.nom_complet || ''} onChange={e => setCustomContent(p => ({ ...p, nom_complet: e.target.value }))} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Briefcase size={11} /> Titre / Poste
                </label>
                <input value={customContent.titre_poste || ''} onChange={e => setCustomContent(p => ({ ...p, titre_poste: e.target.value }))} style={inputStyle} />
              </div>

              {infoFields.show_localisation && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <MapPin size={11} /> Localisation
                  </label>
                  <input value={customContent.localisation || ''} onChange={e => setCustomContent(p => ({ ...p, localisation: e.target.value }))} style={inputStyle} />
                </div>
              )}

              {infoFields.show_age && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Calendar size={11} /> Âge
                  </label>
                  <input value={customContent.age || ''} onChange={e => setCustomContent(p => ({ ...p, age: e.target.value }))} style={inputStyle} placeholder={candidat.date_naissance ? 'Calculé automatiquement' : 'Ex: 32 ans'} />
                </div>
              )}

              {sections.resume && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <FileText size={11} /> Résumé / Profil
                  </label>
                  <textarea value={customContent.resume_ia || ''} onChange={e => setCustomContent(p => ({ ...p, resume_ia: e.target.value }))} rows={5}
                    style={{ ...inputStyle, fontSize: 12, resize: 'vertical' as const }} />
                </div>
              )}

              {sections.competences && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Briefcase size={11} /> Compétences (séparées par des virgules)
                  </label>
                  <textarea
                    value={customContent.competences ?? ''}
                    onChange={e => setCustomContent(p => ({ ...p, competences: e.target.value }))}
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                    placeholder="Compétence 1, Compétence 2, ..."
                  />
                </div>
              )}
            </div>

            {/* v1.9.71 — Formations éditables (array, même structure qu'Expériences) */}
            {sections.formations && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                    Formations ({formations.length})
                  </h3>
                  <button
                    onClick={addFormation}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      border: '1.5px solid var(--primary)', borderRadius: 6,
                      padding: '4px 8px', fontSize: 11, fontWeight: 700,
                      background: 'transparent', color: 'var(--primary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Plus size={12} /> Ajouter
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {formations.map((f, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid var(--border)', borderRadius: 10,
                        padding: 12, background: 'var(--secondary)',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          value={f.diplome || ''}
                          onChange={e => updateFormation(idx, { diplome: e.target.value })}
                          placeholder="Diplôme / formation"
                          style={{ ...inputStyle, fontWeight: 700, fontSize: 12 }}
                        />
                        <button
                          onClick={() => moveFormation(idx, -1)}
                          disabled={idx === 0}
                          title="Monter"
                          style={{
                            width: 28, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: idx === 0 ? 'var(--border)' : 'var(--foreground)',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveFormation(idx, 1)}
                          disabled={idx === formations.length - 1}
                          title="Descendre"
                          style={{
                            width: 28, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: idx === formations.length - 1 ? 'var(--border)' : 'var(--foreground)',
                            cursor: idx === formations.length - 1 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => deleteFormation(idx)}
                          title="Supprimer cette formation"
                          style={{
                            width: 32, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: '#DC2626',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        value={f.etablissement || ''}
                        onChange={e => updateFormation(idx, { etablissement: e.target.value })}
                        placeholder="Établissement / école"
                        style={{ ...inputStyle, fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Début</label>
                          <input
                            type="month"
                            value={f.date_debut || ''}
                            onChange={e => updateFormation(idx, { date_debut: e.target.value })}
                            style={{ ...inputStyle, fontSize: 12 }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Fin</label>
                          <input
                            type="month"
                            value={f.current ? '' : (f.date_fin || '')}
                            disabled={!!f.current}
                            onChange={e => updateFormation(idx, { date_fin: e.target.value })}
                            style={{
                              ...inputStyle, fontSize: 12,
                              opacity: f.current ? 0.5 : 1,
                            }}
                          />
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--foreground)', cursor: 'pointer' }}>
                        <Checkbox
                          checked={!!f.current}
                          onClick={() => updateFormation(idx, { current: !f.current, ...(!f.current ? { date_fin: '' } : {}) })}
                          size={16}
                        />
                        <span>En cours</span>
                      </label>
                      <textarea
                        value={f.description || ''}
                        onChange={e => updateFormation(idx, { description: e.target.value })}
                        placeholder="Description (optionnel)"
                        rows={2}
                        style={{ ...inputStyle, fontSize: 12, resize: 'vertical' }}
                      />
                      {f.annee && !f.date_debut && !f.date_fin && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
                          Ancienne année (non parseable) : <strong>{f.annee}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                  {formations.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>
                      Aucune formation. Cliquez sur <strong>Ajouter</strong> pour en créer une.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Expériences éditables */}
            {sections.experiences && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                    Expériences ({experiences.length})
                  </h3>
                  <button
                    onClick={addExperience}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      border: '1.5px solid var(--primary)', borderRadius: 6,
                      padding: '4px 8px', fontSize: 11, fontWeight: 700,
                      background: 'transparent', color: 'var(--primary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Plus size={12} /> Ajouter
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {experiences.map((exp, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid var(--border)', borderRadius: 10,
                        padding: 12, background: 'var(--secondary)',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          value={exp.poste || ''}
                          onChange={e => updateExperience(idx, { poste: e.target.value })}
                          placeholder="Titre du poste"
                          style={{ ...inputStyle, fontWeight: 700, fontSize: 12 }}
                        />
                        <button
                          onClick={() => moveExperience(idx, -1)}
                          disabled={idx === 0}
                          title="Monter"
                          style={{
                            width: 28, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: idx === 0 ? 'var(--border)' : 'var(--foreground)',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveExperience(idx, 1)}
                          disabled={idx === experiences.length - 1}
                          title="Descendre"
                          style={{
                            width: 28, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: idx === experiences.length - 1 ? 'var(--border)' : 'var(--foreground)',
                            cursor: idx === experiences.length - 1 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => deleteExperience(idx)}
                          title="Supprimer cette expérience"
                          style={{
                            width: 32, height: 32, flexShrink: 0,
                            border: '1.5px solid var(--border)', borderRadius: 6,
                            background: 'transparent', color: '#DC2626',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <input
                        value={exp.entreprise || ''}
                        onChange={e => updateExperience(idx, { entreprise: e.target.value })}
                        placeholder="Entreprise"
                        style={{ ...inputStyle, fontSize: 12 }}
                      />

                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Début</label>
                          <input
                            type="month"
                            value={exp.date_debut || ''}
                            onChange={e => updateExperience(idx, { date_debut: e.target.value })}
                            style={{ ...inputStyle, fontSize: 12 }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Fin</label>
                          <input
                            type="month"
                            value={exp.current ? '' : (exp.date_fin || '')}
                            disabled={!!exp.current}
                            onChange={e => updateExperience(idx, { date_fin: e.target.value })}
                            style={{
                              ...inputStyle, fontSize: 12,
                              opacity: exp.current ? 0.5 : 1,
                            }}
                          />
                        </div>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--foreground)', cursor: 'pointer' }}>
                        <Checkbox
                          checked={!!exp.current}
                          onClick={() => updateExperience(idx, { current: !exp.current, ...(!exp.current ? { date_fin: '' } : {}) })}
                          size={16}
                        />
                        <span>Poste actuel (Actuellement)</span>
                      </label>

                      <textarea
                        value={exp.description || ''}
                        onChange={e => updateExperience(idx, { description: e.target.value })}
                        placeholder="Description du poste / missions"
                        rows={3}
                        style={{ ...inputStyle, fontSize: 12, resize: 'vertical' }}
                      />

                      {exp.periode && !exp.date_debut && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
                          Ancienne période (non parseable) : <strong>{exp.periode}</strong>
                        </div>
                      )}
                    </div>
                  ))}

                  {experiences.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>
                      Aucune expérience. Cliquez sur <strong>Ajouter</strong> pour en créer une.
                    </div>
                  )}
                </div>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Les modifications sont sauvegardées automatiquement et ne changent pas la fiche candidat.
            </p>
          </div>

          {/* Right : PDF preview */}
          <div style={{ flex: 1, background: '#F1F1F1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {customizationLoading || (loading && !pdfUrl) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--muted)' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Génération du CV...</span>
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Aperçu CV" />
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                Aperçu en cours de génération…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
   CvOriginalHoverButton — bouton avec aperçu flottant au survol.
   Affiche une miniature du CV original (iframe /api/cv/print) à côté du
   bouton quand la souris survole. Cliquer ouvre le CV en plein écran
   dans un nouvel onglet.
   ──────────────────────────────────────────────────────────────────────── */
function CvOriginalHoverButton({ cvUrl, label }: { cvUrl: string; label: string }) {
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const timer = useRef<number | null>(null)

  const PREVIEW_W = 680
  const PREVIEW_H = 860

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const handleEnter = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      // Afficher sous le bouton par défaut, sinon au-dessus si pas la place
      const spaceBelow = window.innerHeight - rect.bottom - 20
      const spaceAbove = rect.top - 20
      const placeAbove = spaceBelow < PREVIEW_H && spaceAbove > spaceBelow
      const x = Math.max(12, Math.min(window.innerWidth - PREVIEW_W - 12, rect.left + rect.width / 2 - PREVIEW_W / 2))
      const y = placeAbove
        ? Math.max(12, rect.top - PREVIEW_H - 8)
        : Math.max(12, Math.min(window.innerHeight - PREVIEW_H - 12, rect.bottom + 8))
      setPreviewPos({ x, y })
    }, 200)
  }
  const handleLeave = () => {
    if (timer.current) window.clearTimeout(timer.current)
    // Délai pour laisser la souris rejoindre le popup
    timer.current = window.setTimeout(() => setPreviewPos(null), 250)
  }
  const handlePreviewEnter = () => {
    if (timer.current) window.clearTimeout(timer.current)
  }
  const handlePreviewLeave = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPreviewPos(null), 150)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => window.open(`/api/cv/print?url=${encodeURIComponent(cvUrl)}`, '_blank')}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        title="Voir le CV original (cliquer pour ouvrir)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1.5px solid var(--border)', background: 'var(--card)',
          color: 'var(--foreground)', fontSize: 12, fontWeight: 700,
          fontFamily: 'var(--font-body)', cursor: 'pointer',
        }}
      >
        <Eye size={12} />
        CV original
      </button>
      {previewPos && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
          style={{
            position: 'fixed', left: previewPos.x, top: previewPos.y,
            width: PREVIEW_W, height: PREVIEW_H, zIndex: 99999,
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--background)', fontSize: 12, fontWeight: 700,
            color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Paperclip size={12} />
            CV original — {label}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 500 }}>
              Cliquer pour ouvrir en plein écran
            </span>
          </div>
          <iframe
            src={`/api/cv/print?url=${encodeURIComponent(cvUrl)}#zoom=page-width`}
            style={{ width: '100%', height: 'calc(100% - 34px)', border: 'none' }}
          />
        </div>,
        document.body
      )}
    </>
  )
}
