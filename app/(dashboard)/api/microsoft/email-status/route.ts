// GET /api/microsoft/email-status
// Retourne l'intégration Outlook personnelle de l'utilisateur connecté

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json(null, { status: 401 })

    const admin = createAdminClient()
    const { data } = await admin
      .from('integrations')
      .select('id, email, nom_compte, expires_at, actif')
      .eq('type', 'microsoft_email' as any)
      .filter('metadata->>user_id', 'eq', user.id)
      .eq('actif', true)
      .maybeSingle()

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(null)
  }
}
