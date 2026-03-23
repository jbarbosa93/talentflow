// app/api/cv/generate/route.ts
// Génère un CV PDF brandé pour un candidat

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateBrandedCV } from '@/lib/cv-generator'
import type { Candidat } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidat_id, recruiter_info, included_sections, custom_content } = body

    if (!candidat_id) {
      return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch candidate with all fields
    const { data, error } = await supabase
      .from('candidats')
      .select('*')
      .eq('id', candidat_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
    }

    const candidat = data as unknown as Candidat

    const pdfBytes = await generateBrandedCV(candidat, {
      recruiterInfo: recruiter_info,
      includedSections: included_sections,
      customContent: custom_content,
    })

    const fileName = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}_LAgence.pdf`
      .replace(/\s+/g, '_')

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (err) {
    console.error('[CV Generate] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur génération CV' },
      { status: 500 }
    )
  }
}

// GET — pour télécharger depuis le navigateur avec query params
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const candidat_id = url.searchParams.get('candidat_id')

  if (!candidat_id) {
    return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidats')
    .select('*')
    .eq('id', candidat_id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
  }

  const candidat = data as unknown as Candidat

  const pdfBytes = await generateBrandedCV(candidat)

  const fileName = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}_LAgence.pdf`
    .replace(/\s+/g, '_')

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(pdfBytes.length),
    },
  })
}
