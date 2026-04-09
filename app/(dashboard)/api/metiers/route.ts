import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const DEFAULT_METIERS = [
  // BÂTIMENT
  'Maçonnerie', 'Goudron', 'Ferrailleur', 'Désamianteur', 'Peintre',
  'Plâtrier', 'Carreleur', 'Paysagiste', 'Sanitaire', 'Chauffage',
  'Électricien', 'Automaticien', 'Ferblantier', 'Couvreur', 'Menuisier',
  'Charpentier', 'Étancheur', 'Poseur de sols', 'Storiste', 'Échafaudages',
  'Pompage / Solaire',
  // TECHNIQUE - INDUSTRIE - USINE
  'Mécanicien', 'Soudeur', 'Tuyauteur', 'Calorifugeur',
  'Serrurier', 'Polymécanicien', 'Logisticien', 'Ventilation',
  // DIVERS
  'Chauffeur', 'Ouvrier', 'Manutentionnaire', 'Nettoyage',
  // COMMERCIAL
  'Administratif',
  // ARCHITECTURE
  'Architecture',
]

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'metiers')
    .single()

  const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

  if (error || !data) {
    return NextResponse.json({ metiers: DEFAULT_METIERS }, { headers: noCache })
  }

  // data.value peut être un tableau JS (jsonb parsé) ou une string JSON
  let metiers: string[]
  if (Array.isArray(data.value)) {
    metiers = data.value as string[]
  } else if (typeof data.value === 'string') {
    try { metiers = JSON.parse(data.value) } catch { metiers = DEFAULT_METIERS }
  } else {
    metiers = DEFAULT_METIERS
  }

  return NextResponse.json({ metiers }, { headers: noCache })
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  const { metiers } = await request.json()

  if (!Array.isArray(metiers)) {
    return NextResponse.json({ error: 'metiers must be an array' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'metiers', value: metiers })

  if (error) {
    console.error('[metiers] PUT error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  return NextResponse.json({ metiers, saved: true })
}
