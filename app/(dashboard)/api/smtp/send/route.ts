// api/smtp/send — Envoie un email via SMTP direct (Nodemailer)
// Supporte pièces jointes CV personnalisés automatiquement
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivityServer, getRouteUser } from '@/lib/logActivity'
import { decrypt } from '@/lib/smtp-crypto'
import nodemailer from 'nodemailer'
import { generateBrandedCV } from '@/lib/cv-generator'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
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
        for (const candidat of candidatsData as any[]) {
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
      auth: { user: config.email, pass: decrypt(config.password) },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    })

    // Signature dynamique du consultant connecté
    let signature = ''
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabaseUser = await createClient()
      const { data: { user: currentUser } } = await supabaseUser.auth.getUser()
      if (currentUser?.user_metadata) {
        const m = currentUser.user_metadata
        const fullName = [m.prenom, m.nom].filter(Boolean).join(' ')
        const entreprise = m.entreprise || 'L-Agence'
        if (fullName) {
          signature = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#6b7280"><strong style="color:#111827">${fullName}</strong><br>${entreprise} — Recrutement<br><span style="color:#F5A623">TalentFlow</span></div>`
        }
      }
    } catch { /* signature optionnelle */ }

    // Build email
    const useBcc = use_bcc || destinataires.length > 1
    const mailOptions: nodemailer.SendMailOptions = {
      from: config.nom ? `"${config.nom}" <${config.email}>` : config.email,
      subject: sujet,
      html: corps.replace(/\n/g, '<br>') + signature,
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    if (useBcc) {
      mailOptions.bcc = destinataires.join(', ')
    } else {
      mailOptions.to = destinataires.join(', ')
    }

    await transporter.sendMail(mailOptions)

    // Log — v1.9.60 : campagne_id + user_id + multi-candidats + CV perso/original
    const campagneId = (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const cvPersonnalise = Object.values(cvOptions).some((o: any) => o?.includedSections || o?.customContent)
    const cvUrlsUtilises: string[] = attachments
      .filter((a: any) => a?.filename)
      .map((a: any) => `attach:${a.filename}`)

    let clientId: string | null = null
    let clientNom: string | null = null
    try {
      const { data: matchedClients } = await (supabase as any)
        .from('clients')
        .select('id, nom')
        .in('email_contact', destinataires)
        .limit(5)
      if (matchedClients && matchedClients.length === 1) {
        clientId = (matchedClients[0] as any).id
        clientNom = (matchedClients[0] as any).nom
      } else if (matchedClients && matchedClients.length > 1) {
        clientNom = matchedClients.map((c: any) => c.nom).join(', ')
      }
    } catch { /* colonne absente, ignore */ }

    const routeUserForLog = await getRouteUser().catch(() => null)
    const logs = destinataires.map((dest: string) => ({
      candidat_id: candidat_ids[0] || null,
      sujet,
      corps,
      destinataire: dest,
      statut: 'envoye' as const,
      user_id: (routeUserForLog as any)?.user_id ?? null,
      campagne_id: campagneId,
      candidat_ids: candidat_ids.length > 0 ? candidat_ids : null,
      client_id: clientId,
      client_nom: clientNom,
      cv_personnalise: cvPersonnalise,
      cv_urls_utilises: cvUrlsUtilises.length > 0 ? cvUrlsUtilises : null,
    }))
    await supabase.from('emails_envoyes').insert(logs as any)

    // Log activité équipe
    try {
      const routeUser = await getRouteUser()
      const cvNames = attachments.map((a: any) => a.filename).filter(Boolean)
      const descParts = [`Sujet: ${sujet}`]
      if (cvNames.length > 0) descParts.push(`CV joints: ${cvNames.join(', ')}`)
      await logActivityServer({
        ...routeUser,
        type: 'email_envoye',
        titre: `Email envoyé à ${destinataires.length} destinataire(s)`,
        description: descParts.join(' — '),
        candidat_id: candidat_ids[0] || undefined,
        metadata: { destinataires, candidat_ids, attachments_count: attachments.length },
      })
    } catch (err) { console.warn('[smtp/send] logActivity failed:', (err as Error).message) }

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
