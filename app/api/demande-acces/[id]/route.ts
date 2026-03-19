import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { statut } = await request.json()

  if (!['en_attente', 'approuve', 'refuse'].includes(statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('demandes_acces')
    .update({ statut })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
