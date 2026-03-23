// api/smtp/send — Envoie un email via SMTP direct (Nodemailer)
// Supporte pièces jointes CV personnalisés automatiquement
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'
import { generateBrandedCV } from '@/lib/cv-generator'

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
    const candidat_ids: string[] = body.candidat_ids || (body.candidat_id ? [body.candidat_id] : [])
    // Options CV personnalisé par candidat: { [candidat_id]: { includedSections, customContent } }
    const cvOptions: Record<string, any> = body.cv_options || {}
    const recruiterInfo = body.recruiter_info || null
    const attachCvs = body.attach_cvs !== false && candidat_ids.length > 0

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

    // Générer les CV en pièces jointes
    const attachments: nodemailer.SendMailOptions['attachments'] = []

    if (attachCvs) {
      // Charger les données candidats
      const { data: candidatsData } = await supabase
        .from('candidats')
        .select('*')
        .in('id', candidat_ids)

      if (candidatsData && candidatsData.length > 0) {
        for (const candidat of candidatsData) {
          try {
            const opts = cvOptions[candidat.id] || {}
            const pdfBytes = await generateBrandedCV(candidat, {
              recruiterInfo: recruiterInfo || undefined,
              includedSections: opts.includedSections,
              customContent: opts.customContent,
            })
            const fileName = `CV_${(candidat.prenom || '').trim()}_${(candidat.nom || '').trim()}.pdf`
              .replace(/\s+/g, '_')
            attachments.push({
              filename: fileName,
              content: Buffer.from(pdfBytes),
              contentType: 'application/pdf',
            })
          } catch (err) {
            console.error(`[SMTP] Erreur génération CV pour ${candidat.id}:`, err)
          }
        }
      }
    }

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
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    if (useBcc) {
      mailOptions.bcc = destinataires.join(', ')
    } else {
      mailOptions.to = destinataires.join(', ')
    }

    await transporter.sendMail(mailOptions)

    // Log
    const logs = destinataires.map((dest: string) => ({
      candidat_id: candidat_ids[0] || null,
      sujet,
      corps,
      destinataire: dest,
      statut: 'envoye' as const,
    }))
    await supabase.from('emails_envoyes').insert(logs)

    return NextResponse.json({
      success: true,
      count: destinataires.length,
      attachments: attachments.length,
    })
  } catch (error) {
    console.error('[SMTP Send] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi email' },
      { status: 500 }
    )
  }
}
