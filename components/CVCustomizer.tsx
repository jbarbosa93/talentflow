'use client'
import { useState, useCallback, useEffect } from 'react'
import { X, Download, Send, Eye, Loader2, Check } from 'lucide-react'
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
  { key: 'resume', label: 'Profil / Résumé' },
  { key: 'competences', label: 'Compétences' },
  { key: 'experiences', label: 'Expériences professionnelles' },
  { key: 'formations', label: 'Formations' },
  { key: 'langues', label: 'Langues' },
]

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
  const [customContent, setCustomContent] = useState<Record<string, string>>({})
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Initialiser le contenu editable
  useEffect(() => {
    setCustomContent({
      nom_complet: [candidat.prenom, candidat.nom].filter(Boolean).join(' '),
      titre_poste: candidat.titre_poste || '',
      resume_ia: candidat.resume_ia || '',
      formation: candidat.formation || '',
    })
  }, [candidat])

  const includedSections = Object.entries(sections)
    .filter(([, v]) => v)
    .map(([k]) => k)

  // Générer le PDF preview
  const generatePreview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidat_id: candidat.id,
          included_sections: includedSections,
          custom_content: customContent,
        }),
      })
      if (!res.ok) throw new Error('Erreur génération')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    } catch {
      toast.error('Erreur lors de la génération du CV')
    }
    setLoading(false)
  }, [candidat.id, includedSections, customContent])

  // Auto-preview au premier chargement
  useEffect(() => { generatePreview() }, [])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/cv/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidat_id: candidat.id,
          included_sections: includedSections,
          custom_content: customContent,
        }),
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

  const toggleSection = (key: string) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const updateContent = (key: string, value: string) => {
    setCustomContent(prev => ({ ...prev, [key]: value }))
  }

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
            <button
              onClick={generatePreview}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)',
                background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} />}
              Actualiser
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: 'var(--primary)', color: 'var(--ink, #1C1A14)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
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
          <div style={{
            width: 360, flexShrink: 0, overflowY: 'auto',
            padding: 24, borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            {/* Sections toggles */}
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Sections à inclure
              </h3>
              {SECTIONS.map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                  <div
                    onClick={() => toggleSection(s.key)}
                    style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: sections[s.key] ? '2px solid var(--primary)' : '2px solid var(--border)',
                      background: sections[s.key] ? 'var(--primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    {sections[s.key] && <Check size={13} color="#1C1A14" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{s.label}</span>
                </label>
              ))}
            </div>

            {/* Editable fields */}
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Modifier le contenu
              </h3>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nom complet</label>
                <input
                  value={customContent.nom_complet || ''}
                  onChange={e => updateContent('nom_complet', e.target.value)}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', background: 'var(--secondary)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Titre / Poste</label>
                <input
                  value={customContent.titre_poste || ''}
                  onChange={e => updateContent('titre_poste', e.target.value)}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', background: 'var(--secondary)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {sections.resume && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Résumé / Profil</label>
                  <textarea
                    value={customContent.resume_ia || ''}
                    onChange={e => updateContent('resume_ia', e.target.value)}
                    rows={5}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'inherit', background: 'var(--secondary)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              {sections.formations && candidat.formation && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Formation</label>
                  <input
                    value={customContent.formation || ''}
                    onChange={e => updateContent('formation', e.target.value)}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', background: 'var(--secondary)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Modifiez les champs ci-dessus puis cliquez <strong>Actualiser</strong> pour voir le résultat dans l&apos;aperçu.
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
              <iframe
                src={pdfUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Aperçu CV"
              />
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
