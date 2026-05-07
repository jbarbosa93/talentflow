// TalentFlow Sign — Modal d'import depuis JSON DocuSign (style v2)
// v2.2.0 — Phase 2
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, FileJson } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  onImported?: (templateId: string) => void
}

type Phase = 'idle' | 'parsing' | 'uploading' | 'success' | 'error'

interface Result {
  templateId: string
  documentsCount: number
  fieldsCount: number
  recipientsCount: number
}

export default function DocusignImportModal({ open, onClose, onImported }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) return
    setFile(null)
    setPhase('idle')
    setErrorMsg(null)
    setResult(null)
  }, [open])

  const handleFile = (f: File) => {
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') {
      toast.error('Fichier JSON uniquement')
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error('Fichier > 50 MB')
      return
    }
    setFile(f)
    setPhase('idle')
    setErrorMsg(null)
  }

  const handleImport = async () => {
    if (!file) return
    setPhase('parsing')
    setErrorMsg(null)
    try {
      // Le serveur fait tout en bloc : on indique "uploading" dès l'envoi de la requête
      // (le parsing client ne sert à rien — on délègue au serveur).
      setPhase('uploading')
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/sign/templates/import', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur import')
      setResult(data as Result)
      setPhase('success')
      toast.success('Template DocuSign importé')
      if (onImported) onImported(data.templateId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      setErrorMsg(msg)
      setPhase('error')
      toast.error(msg)
    }
  }

  const handleGoToTemplate = () => {
    if (!result) return
    onClose()
    router.push(`/sign/templates/${result.templateId}/edit`)
  }

  if (!open || !mounted) return null

  const busy = phase === 'parsing' || phase === 'uploading'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 560,
          width: '92%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'var(--primary-soft)',
                border: '1px solid rgba(245,167,35,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <FileJson size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                Importer depuis DocuSign
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Charge un export JSON DocuSign pour créer un template avec ses champs.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              color: 'var(--muted)',
              padding: 4,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {phase === 'success' && result ? (
            <SuccessPanel result={result} onContinue={handleGoToTemplate} />
          ) : (
            <>
              {/* Dropzone */}
              <label
                onDragOver={e => {
                  e.preventDefault()
                  if (!busy) setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  if (busy) return
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '32px 20px',
                  border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 12,
                  background: dragOver ? 'var(--primary-soft)' : 'var(--secondary)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'center',
                }}
              >
                <Upload size={28} style={{ color: 'var(--muted)' }} />
                {file ? (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {(file.size / 1024).toFixed(1)} KB · cliquer pour changer
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' }}>
                      Déposez le JSON ou cliquez pour parcourir
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      Fichier JSON DocuSign (≤ 50 MB)
                    </div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </label>

              {/* Progress / Error */}
              {phase === 'uploading' && (
                <ProgressLine label="Parsing JSON, upload PDFs et création du template..." />
              )}
              {phase === 'error' && errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--destructive-soft, var(--border))',
                    background: 'var(--destructive-soft)',
                    borderRadius: 10,
                    fontSize: 12.5,
                    color: 'var(--destructive)',
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {phase !== 'success' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              padding: '12px 22px 18px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="neo-btn"
              style={{ fontSize: 13, padding: '6px 14px' }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || busy}
              className="neo-btn-yellow"
              style={{
                fontSize: 13,
                padding: '0 16px',
                height: 38,
                opacity: !file || busy ? 0.6 : 1,
                cursor: !file || busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Importer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function ProgressLine({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        border: '1px solid var(--border)',
        background: 'var(--secondary)',
        borderRadius: 10,
        fontSize: 12.5,
        color: 'var(--foreground)',
      }}
    >
      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <span>{label}</span>
    </div>
  )
}

function SuccessPanel({ result, onContinue }: { result: Result; onContinue: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '12px 0' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--success-soft)',
          color: 'var(--success)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckCircle2 size={28} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
        Import réussi
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span className="neo-tag" style={{ fontSize: 11 }}>
          {result.documentsCount} PDF{result.documentsCount > 1 ? 's' : ''}
        </span>
        <span className="neo-tag" style={{ fontSize: 11 }}>
          {result.fieldsCount} champ{result.fieldsCount > 1 ? 's' : ''}
        </span>
        <span className="neo-tag" style={{ fontSize: 11 }}>
          {result.recipientsCount} destinataire{result.recipientsCount > 1 ? 's' : ''}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
        Le template est créé. Tu peux ajuster la position des champs dans l&apos;éditeur visuel.
      </p>
      <button type="button" onClick={onContinue} className="neo-btn-yellow" style={{ marginTop: 8 }}>
        Ouvrir l&apos;éditeur
      </button>
    </div>
  )
}
