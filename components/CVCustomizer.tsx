'use client'
import { useState, useCallback, useEffect } from 'react'
import { X, Download, Eye, Loader2, Check, MapPin, Calendar, Car, User, Briefcase, FileText, BookOpen, Languages } from 'lucide-react'
import { toast } from 'sonner'

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
]

const inputStyle = {
  width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--secondary)', color: 'var(--foreground)',
  outline: 'none', boxSizing: 'border-box' as const,
}

export default function CVCustomizerModal({
  candidat,
  onClose,
}: {
  candidat: Candidat
  onClose: () => void
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
  })
  const [customContent, setCustomContent] = useState<Record<string, string>>({})
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setCustomContent({
      nom_complet: [candidat.prenom, candidat.nom].filter(Boolean).join(' '),
      titre_poste: candidat.titre_poste || '',
      localisation: candidat.localisation || '',
      resume_ia: candidat.resume_ia || '',
      formation: candidat.formation || '',
    })
  }, [candidat])

  const buildPayload = () => ({
    candidat_id: candidat.id,
    included_sections: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
    custom_content: {
      ...customContent,
      show_localisation: infoFields.show_localisation ? '1' : '0',
      show_age: infoFields.show_age ? '1' : '0',
      show_permis: infoFields.show_permis ? '1' : '0',
    },
  })

  const generatePreview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) throw new Error('Erreur génération')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    } catch {
      toast.error('Erreur lors de la génération du CV')
    }
    setLoading(false)
  }, [candidat.id, sections, infoFields, customContent])

  useEffect(() => { generatePreview() }, [])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          width: '95vw', maxWidth: 1100, height: '90vh',
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
              {candidat.prenom} {candidat.nom} — Sélectionnez les sections et modifiez le contenu
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={generatePreview} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} />}
              Actualiser
            </button>
            <button onClick={handleDownload} disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'var(--ink, #1C1A14)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              Télécharger PDF
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 6 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body : 2 colonnes */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left : contrôles */}
          <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', padding: 24, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>

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

              {sections.resume && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <FileText size={11} /> Résumé / Profil
                  </label>
                  <textarea value={customContent.resume_ia || ''} onChange={e => setCustomContent(p => ({ ...p, resume_ia: e.target.value }))} rows={5}
                    style={{ ...inputStyle, fontSize: 12, resize: 'vertical' as const }} />
                </div>
              )}

              {sections.formations && candidat.formation && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <BookOpen size={11} /> Formation
                  </label>
                  <input value={customContent.formation || ''} onChange={e => setCustomContent(p => ({ ...p, formation: e.target.value }))} style={inputStyle} />
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Modifiez les champs ci-dessus puis cliquez <strong>Actualiser</strong> pour voir le résultat.
            </p>
          </div>

          {/* Right : PDF preview */}
          <div style={{ flex: 1, background: '#F1F1F1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {loading && !pdfUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--muted)' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Génération du CV...</span>
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Aperçu CV" />
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                Cliquez sur Actualiser pour voir l&apos;aperçu
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
