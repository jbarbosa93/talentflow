import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'cvs'
const FILE_PATH = 'settings/metiers.json'

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
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH)
    if (data && !error) {
      const text = await data.text()
      const metiers = JSON.parse(text)
      return NextResponse.json({ metiers })
    }
  } catch {
    // File doesn't exist yet — return defaults
  }
  return NextResponse.json({ metiers: DEFAULT_METIERS })
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  const { metiers } = await request.json()

  if (!Array.isArray(metiers)) {
    return NextResponse.json({ error: 'metiers must be an array' }, { status: 400 })
  }

  const blob = new Blob([JSON.stringify(metiers, null, 2)], { type: 'application/json' })

  // Try update first, then upload if file doesn't exist
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(FILE_PATH, blob, { contentType: 'application/json', upsert: true })

  if (error) {
    console.error('[metiers] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ metiers, saved: true })
}
