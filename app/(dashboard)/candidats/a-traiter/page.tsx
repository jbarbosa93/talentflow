'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CandidatsATraiterRedirect() {
  const router = useRouter()
  useEffect(() => {
    sessionStorage.setItem('candidats_import_status', 'a_traiter')
    router.replace('/candidats')
  }, [router])
  return null
}
