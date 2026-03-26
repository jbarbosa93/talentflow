import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()

  // Chercher toutes les intégrations Microsoft actives (type='microsoft', distinguished by metadata.purpose)
  const { data: integrations } = await admin
    .from('integrations')
    .select('type, email, nom_compte, metadata, actif')
    .eq('type', 'microsoft')
    .eq('actif', true)

  const result: Record<string, any> = {}

  for (const int of integrations || []) {
    const purpose = (int.metadata as any)?.purpose || 'onedrive' // legacy fallback
    const key = `microsoft_${purpose}` // e.g. microsoft_onedrive
    result[key] = {
      email: int.email,
      nom: int.nom_compte,
      purpose,
      connected: true,
    }
  }

  return NextResponse.json(result)
}
