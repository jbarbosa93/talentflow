'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ⚠️ TEMPORAIRE : on enlève les types externes pour éviter erreur
type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

interface UploadCVProps {
  offreId?: string
  onSuccess?: (candidat: any) => void
  onClose?: () => void
}

type UploadState = 'idle' | 'uploading' | 'parsing' | 'success' | 'error'

const ETAPES_PIPELINE: { value: PipelineEtape; label: string }[] = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'contacte', label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place', label: 'Placé' },
  { value: 'refuse', label: 'Refusé' },
]

export default function UploadCV({ offreId, onSuccess, onClose }: UploadCVProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [statut, setStatut] = useState<PipelineEtape>('nouveau')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file)
    setError(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleUpload = async () => {
    if (!selectedFile) return

    setState('uploading')

    const formData = new FormData()
    formData.append('cv', selectedFile)

    try {
      const res = await fetch('/api/cv/parse', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setState('success')
      toast.success('Candidat créé !')

      onSuccess?.(data.candidat)
    } catch (err: any) {
      setState('error')
      setError(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6">

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed p-10 text-center cursor-pointer rounded-lg"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {selectedFile ? (
          <p>{selectedFile.name}</p>
        ) : (
          <p>Glissez votre CV ici ou cliquez</p>
        )}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <Button onClick={handleUpload}>
        Upload CV
      </Button>

    </div>
  )
}