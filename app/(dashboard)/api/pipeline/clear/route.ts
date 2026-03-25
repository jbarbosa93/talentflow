import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const admin = createAdminClient()

  // Supprimer TOUS les candidats de la pipeline
  const { count, error } = await admin
    .from('pipeline')
    .delete()
    .gte('created_at', '2000-01-01')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: count || 0, message: 'Pipeline vidée' })
}
