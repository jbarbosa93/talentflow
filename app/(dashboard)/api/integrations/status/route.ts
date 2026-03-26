import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()

  // Chercher toutes les intégrations Microsoft actives
  const { data: integrations } = await admin
    .from('integrations')
    .select('type, email, nom_compte, metadata, actif')
    .like('type', 'microsoft%')
    .eq('actif', true)

  const result: Record<string, any> = {}

  for (const int of integrations || []) {
    // Type peut être 'microsoft', 'microsoft_onedrive', 'microsoft_outlook'
    const type = int.type as string
    const purpose = type === 'microsoft_onedrive' ? 'onedrive'
      : type === 'microsoft_outlook' ? 'outlook'
      : (int.metadata as any)?.purpose || 'onedrive'
    const key = `microsoft_${purpose}`
    result[key] = {
      email: int.email,
      nom: int.nom_compte,
      purpose,
      connected: true,
    }
  }

  return NextResponse.json(result)
}
