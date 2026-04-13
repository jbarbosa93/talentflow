// Vérifie si un candidat a déjà été envoyé à un email/client
// GET /api/activites/check-doublon?candidat_ids=x,y&destinataires=a@b.ch,c@d.ch
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { searchParams } = new URL(request.url)
    const candidatIdsStr = searchParams.get('candidat_ids') || ''
    const destinatairesStr = searchParams.get('destinataires') || ''

    const candidatIds = candidatIdsStr.split(',').filter(Boolean)
    const destinataires = destinatairesStr.split(',').filter(Boolean)

    if (candidatIds.length === 0 || destinataires.length === 0) {
      return NextResponse.json({ doublons: [] })
    }

    const supabase = createAdminClient() as any

    // Chercher dans les activités les envois précédents avec ces candidats
    const { data: activites } = await supabase
      .from('activites')
      .select('*')
      .eq('type', 'email_envoye')
      .in('candidat_id', candidatIds)
      .order('created_at', { ascending: false })

    if (!activites || activites.length === 0) {
      // Aussi chercher dans emails_envoyes (historique ancien)
      const { data: emailsHist } = await supabase
        .from('emails_envoyes')
        .select('*')
        .in('candidat_id', candidatIds)
        .order('created_at', { ascending: false })

      if (!emailsHist || emailsHist.length === 0) {
        return NextResponse.json({ doublons: [] })
      }

      // Vérifier si les destinataires matchent
      const doublons = emailsHist
        .filter((e: any) => destinataires.some(d => d.toLowerCase() === (e.destinataire || '').toLowerCase()))
        .map((e: any) => ({
          candidat_id: e.candidat_id,
          destinataire: e.destinataire,
          date: e.created_at,
          user_name: 'Système',
          sujet: e.sujet,
        }))

      return NextResponse.json({ doublons })
    }

    // Vérifier dans les métadonnées des activités si les destinataires matchent
    const doublons: any[] = []
    for (const act of activites) {
      const meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : (act.metadata || {})
      const actDestinataires: string[] = meta.destinataires || []

      for (const dest of destinataires) {
        if (actDestinataires.some((d: string) => d.toLowerCase() === dest.toLowerCase())) {
          doublons.push({
            candidat_id: act.candidat_id,
            candidat_nom: act.candidat_nom,
            destinataire: dest,
            date: act.created_at,
            user_name: act.user_name,
            titre: act.titre,
          })
        }
      }
    }

    return NextResponse.json({ doublons })
  } catch (error) {
    console.error('[check-doublon]', error)
    return NextResponse.json({ doublons: [] })
  }
}
