'use client'
import { createContext, useContext, useState, useCallback } from 'react'

interface UploadContextType {
  showUpload: boolean
  openUpload: () => void
  closeUpload: () => void
}

const UploadContext = createContext<UploadContextType | null>(null)

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider')
  return ctx
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [showUpload, setShowUpload] = useState(false)

  const openUpload = useCallback(() => setShowUpload(true), [])
  const closeUpload = useCallback(() => setShowUpload(false), [])

  return (
    <UploadContext.Provider value={{ showUpload, openUpload, closeUpload }}>
      {children}
    </UploadContext.Provider>
  )
}
