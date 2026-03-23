// api/smtp/send — Envoie un email via SMTP direct (Nodemailer)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const destinataires: string[] = body.destinataires
      ? body.destinataires
      : body.destinataire
        ? [body.destinataire]
        : []
    const { sujet, corps, use_bcc = false } = body
    const candidat_id = body.candidat_id || body.candidat_ids?.[0] || null

    if (destinataires.length === 0 || !sujet || !corps) {
      return NextResponse.json(
        { error: 'destinataire(s), sujet et corps sont requis' },
        { status: 400 }
      )
    }

    // Lire la config SMTP
    const supabase = createAdminClient()
    const { data: settingsRow } = await (supabase as any)
      .from('app_settings')
      .select('value')
      .eq('key', 'smtp_config')
      .single()

    if (!settingsRow) {
      return NextResponse.json(
        { error: 'SMTP non configuré. Allez dans Messages → paramètres pour connecter votre email.' },
        { status: 404 }
      )
    }

    const config = JSON.parse(settingsRow.value)

    const transporter = nodemailer.createTransport({
      host: config.host || 'smtp.office365.com',
      port: config.port || 587,
      secure: false,
      auth: { user: config.email, pass: config.password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    })

    // Build email
    const useBcc = use_bcc || destinataires.length > 1
    const mailOptions: nodemailer.SendMailOptions = {
      from: config.nom ? `"${config.nom}" <${config.email}>` : config.email,
      subject: sujet,
      html: corps.replace(/\n/g, '<br>'),
    }

    if (useBcc) {
      mailOptions.bcc = destinataires.join(', ')
    } else {
      mailOptions.to = destinataires.join(', ')
    }

    await transporter.sendMail(mailOptions)

    // Log
    const logs = destinataires.map((dest: string) => ({
      candidat_id,
      sujet,
      corps,
      destinataire: dest,
      statut: 'envoye' as const,
    }))
    await supabase.from('emails_envoyes').insert(logs)

    return NextResponse.json({ success: true, count: destinataires.length })
  } catch (error) {
    console.error('[SMTP Send] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi email' },
      { status: 500 }
    )
  }
}
