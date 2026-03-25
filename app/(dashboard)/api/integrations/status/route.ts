import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()

  // Chercher toutes les intégrations Microsoft actives
  const { data: integrations } = await admin
    .from('integrations')
    .select('type, email, nom_compte, metadata, actif')
    .in('type', ['microsoft', 'microsoft_onedrive', 'microsoft_outlook'])
    .eq('actif', true)

  const result: Record<string, any> = {}

  for (const int of integrations || []) {
    result[int.type] = {
      email: int.email,
      nom: int.nom_compte,
      connected: true,
    }
  }

  return NextResponse.json(result)
}
