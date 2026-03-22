'use client'
import { Suspense } from 'react'
import CandidatsList from '@/components/CandidatsList'

export default function CandidatsATraiterPage() {
  return <Suspense fallback={null}><CandidatsList mode="a_traiter" /></Suspense>
}
