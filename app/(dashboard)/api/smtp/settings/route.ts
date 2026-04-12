// api/smtp/settings — Sauvegarde/lecture des paramètres SMTP
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/smtp-crypto'

export const runtime = 'nodejs'

// GET — Lire les paramètres SMTP sauvegardés
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await (supabase as any)
      .from('app_settings')
      .select('value')
      .eq('key', 'smtp_config')
      .single()

    if (!data) return NextResponse.json({ configured: false })

    const config = JSON.parse(data.value)
    // Ne jamais renvoyer le mot de passe en clair
    return NextResponse.json({
      configured: true,
      email: config.email,
      host: config.host,
      port: config.port,
      nom: config.nom || '',
    })
  } catch {
    return NextResponse.json({ configured: false })
  }
}

// POST — Sauvegarder les paramètres SMTP
export async function POST(request: NextRequest) {
  try {
    const { email, password, host, port, nom } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
    }

    // Test de connexion SMTP avant de sauvegarder
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: host || 'smtp.office365.com',
      port: port || 587,
      secure: false,
      auth: { user: email, pass: password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    })

    try {
      await transporter.verify()
    } catch (err: any) {
      return NextResponse.json({
        error: `Connexion SMTP échouée : ${err.message}. Vérifiez vos identifiants.`,
      }, { status: 400 })
    }

    // Sauvegarder en base — mot de passe chiffré AES-256-GCM
    const supabase = createAdminClient()
    const config = JSON.stringify({ email, password: encrypt(password), host: host || 'smtp.office365.com', port: port || 587, nom: nom || '' })

    await (supabase as any)
      .from('app_settings')
      .upsert({ key: 'smtp_config', value: config }, { onConflict: 'key' })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// DELETE — Supprimer les paramètres SMTP
export async function DELETE() {
  try {
    const supabase = createAdminClient()
    await (supabase as any).from('app_settings').delete().eq('key', 'smtp_config')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }
}
