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
        // refetchQueries force un re-fetch immédiat (invalidateQueries ne suffit pas
        // car la liste est derrière le modal d'import et React Query peut différer le refetch)
        queryClient.refetchQueries({ queryKey: ['candidats'] })
      }}
      onClose={closeUpload}
    />
  )
}
