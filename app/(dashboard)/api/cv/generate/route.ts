// app/api/cv/generate/route.ts
// Génère un CV PDF brandé pour un candidat

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateBrandedCV } from '@/lib/cv-generator'
import { requireAuth } from '@/lib/auth-guard'
import type { Candidat } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()
    const { candidat_id, recruiter_info, included_sections, custom_content, experiences_override, formations_override } = body

    if (!candidat_id) {
      return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch candidate with fields needed by generateBrandedCV
    const { data, error } = await supabase
      .from('candidats')
      .select('id, nom, prenom, titre_poste, localisation, date_naissance, resume_ia, competences, experiences, formations_details, formation, langues, permis_conduire, email, telephone')
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
      experiencesOverride: Array.isArray(experiences_override) ? experiences_override : undefined,
      formationsOverride: Array.isArray(formations_override) ? formations_override : undefined,
    })

    const fileName = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}_LAgence.pdf`
      .replace(/\s+/g, '_')

    return new NextResponse(Buffer.from(pdfBytes), {
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
  const authError = await requireAuth()
  if (authError) return authError
  const url = new URL(request.url)
  const candidat_id = url.searchParams.get('candidat_id')

  if (!candidat_id) {
    return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidats')
    .select('id, nom, prenom, titre_poste, localisation, date_naissance, resume_ia, competences, experiences, formations_details, formation, langues, permis_conduire, email, telephone')
    .eq('id', candidat_id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })
  }

  const candidat = data as unknown as Candidat

  const pdfBytes = await generateBrandedCV(candidat)

  const fileName = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}_LAgence.pdf`
    .replace(/\s+/g, '_')

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(pdfBytes.length),
    },
  })
}
