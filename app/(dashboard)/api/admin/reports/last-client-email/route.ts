// TalentFlow Rapports — Dernier email client utilisé pour une entreprise
// v2.13.x — Mémorisation par entreprise : à la création d'un nouveau lien rapport,
// on pré-remplit le champ "Email client" avec l'email réellement utilisé au dernier
// lien de la même entreprise (ex. le chef de chantier / RH saisi la fois précédente),
// au lieu de toujours repartir de l'email générique de l'entreprise.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  const clientId = req.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ email: null })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('report_link_clients' as any)
    .select('client_email, created_at')
    .eq('client_id', clientId)
    .not('client_email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const email = ((data as any)?.client_email || '').trim() || null
  return NextResponse.json({ email })
}
