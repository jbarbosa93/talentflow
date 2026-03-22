'use client'
import { Suspense } from 'react'
import CandidatsList from '@/components/CandidatsList'

export default function CandidatsPage() {
  return <Suspense fallback={null}><CandidatsList /></Suspense>
}
