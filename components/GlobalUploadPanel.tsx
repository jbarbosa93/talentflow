'use client'
import { useUpload } from '@/contexts/UploadContext'
import { useQueryClient } from '@tanstack/react-query'
import UploadCV from '@/components/UploadCV'

export default function GlobalUploadPanel() {
  const { showUpload, closeUpload } = useUpload()
  const queryClient = useQueryClient()

  if (!showUpload) return null

  return (
    <UploadCV
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['candidats'] })
      }}
      onClose={closeUpload}
    />
  )
}
