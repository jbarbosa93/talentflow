// app/(dashboard)/api/secretariat/import/route.ts
// POST — import en masse pour les tables du module Secrétariat

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const ALLOWED_TABLES = ['secretariat_candidats', 'secretariat_accidents', 'secretariat_loyers'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

// POST /api/secretariat/import — insertion en masse
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()
    const { table, data } = body as { table: string; data: object[] }

    if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
      return NextResponse.json(
        { error: `Table invalide. Valeurs autorisées : ${ALLOWED_TABLES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'data doit être un tableau non vide' }, { status: 400 })
    }

    const { data: inserted, error } = await (supabase as any)
      .from(table)
      .insert(data)
      .select()

    if (error) throw error

    return NextResponse.json({ inserted: inserted ?? [], count: inserted?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
