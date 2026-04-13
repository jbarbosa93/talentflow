// POST /api/demande-acces
// 1. Sauvegarde dans Supabase (table demandes_acces) — toujours fiable
// 2. Tentative d'envoi d'email via SMTP si configuré (optionnel)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const DESTINATAIRE = 'j.barbosa@l-agence.ch'

function buildHtmlAdmin(prenom: string, nom: string, entreprise: string, email: string, dateHeure: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFFDF5; border: 2px solid #1C1A14; border-radius: 12px; overflow: hidden;">
      <div style="background: #F7C948; padding: 24px 28px; border-bottom: 2px solid #1C1A14;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #1C1A14;">🎉 Nouvelle demande d'accès TalentFlow</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #4a4a30;">${dateHeure}</p>
      </div>
      <div style="padding: 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B; width: 120px;">Prénom</td><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${prenom}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B;">Nom</td><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${nom}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B;">Entreprise</td><td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${entreprise}</td></tr>
          <tr><td style="padding: 10px 0; font-size: 13px; font-weight: 700; color: #6B6B5B;">Email</td><td style="padding: 10px 0; font-size: 14px; font-weight: 700; color: #1C1A14;"><a href="mailto:${email}" style="color: #1C1A14;">${email}</a></td></tr>
        </table>
        <div style="margin-top: 24px; padding: 16px; background: #F0FFF4; border: 1.5px solid #86EFAC; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">
            💡 Retrouvez cette demande dans TalentFlow → Paramètres → Demandes d'accès
          </p>
        </div>
      </div>
    </div>`
}

function buildHtmlConfirmation(prenom: string, nom: string, entreprise: string, email: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFFDF5; border: 2px solid #1C1A14; border-radius: 12px; overflow: hidden;">
      <div style="background: #F7C948; padding: 24px 28px; border-bottom: 2px solid #1C1A14;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #1C1A14;">Bonjour ${prenom} 👋</h1>
      </div>
      <div style="padding: 28px;">
        <p style="font-size: 15px; color: #1C1A14; line-height: 1.6;">Merci pour votre intérêt pour <strong>TalentFlow</strong> !</p>
        <p style="font-size: 14px; color: #4a4a30; line-height: 1.6;">
          Votre demande d'accès a bien été enregistrée. Notre équipe reviendra vers vous sous <strong>24 heures</strong>.
        </p>
        <div style="margin: 24px 0; padding: 16px; background: white; border: 2px solid #1C1A14; border-radius: 10px; box-shadow: 3px 3px 0 #1C1A14;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #6B6B5B; text-transform: uppercase; letter-spacing: 0.5px;">Votre demande</p>
          <p style="margin: 0; font-size: 14px; color: #1C1A14; font-weight: 600;">${prenom} ${nom} — ${entreprise}</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #6B6B5B;">${email}</p>
        </div>
        <p style="font-size: 13px; color: #9E9E8E;">
          En attendant : <a href="mailto:j.barbosa@l-agence.ch" style="color: #1C1A14; font-weight: 700;">j.barbosa@l-agence.ch</a>
        </p>
      </div>
    </div>`
}

export async function POST(request: NextRequest) {
  try {
    const { prenom, nom, entreprise, email } = await request.json()

    if (!prenom || !nom || !entreprise || !email) {
      return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
    }

    // ── 1. Sauvegarder en base Supabase (primaire) ──────────────────────────
    const supabase = createAdminClient()
    const { error: dbError } = await supabase
      .from('demandes_acces')
      .insert({ prenom, nom, entreprise, email })

    if (dbError) {
      console.error('[Demande accès] Erreur DB:', dbError)
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement.' }, { status: 500 })
    }

    console.log(`[Demande accès] Sauvegardé en DB : ${prenom} ${nom} (${entreprise}) — ${email}`)

    // ── 2. Envoi email via SMTP si configuré (optionnel) ────────────────────
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.default.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })

        const dateHeure = new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris',
        }).format(new Date())

        await transporter.sendMail({
          from: `"TalentFlow" <${process.env.SMTP_USER}>`,
          to: DESTINATAIRE,
          subject: `🚀 Nouvelle demande d'accès — ${prenom} ${nom} (${entreprise})`,
          html: buildHtmlAdmin(prenom, nom, entreprise, email, dateHeure),
          text: `Nouvelle demande\n\n${prenom} ${nom}\n${entreprise}\n${email}\n${dateHeure}`,
        })

        await transporter.sendMail({
          from: `"TalentFlow" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `Votre demande d'accès TalentFlow a bien été reçue ✓`,
          html: buildHtmlConfirmation(prenom, nom, entreprise, email),
          text: `Bonjour ${prenom},\n\nMerci ! Nous vous répondrons sous 24h.\n\nL'équipe TalentFlow`,
        })

        console.log(`[Demande accès] Emails envoyés à ${DESTINATAIRE} + ${email}`)
      } catch (emailErr) {
        // L'email est optionnel — on ne bloque pas si ça échoue
        console.error('[Demande accès] Erreur email (non bloquant):', emailErr)
      }
    } else {
      console.log('[Demande accès] SMTP non configuré — demande sauvegardée uniquement en DB')
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Demande accès] Erreur inattendue:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// GET /api/demande-acces — liste des demandes (admin)
export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('demandes_acces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ demandes: data })
}
