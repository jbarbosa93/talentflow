// POST /api/demande-acces
// Reçoit une demande d'accès depuis la landing page et envoie un email à l'admin

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'

const DESTINATAIRE = 'j.barbosa@l-agence.ch'

export async function POST(request: NextRequest) {
  try {
    const { prenom, nom, entreprise, email } = await request.json()

    if (!prenom || !nom || !entreprise || !email) {
      return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 })
    }

    // Vérification basique du format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
    }

    // Configurer le transporteur SMTP
    // Variables d'environnement requises sur Vercel :
    //   SMTP_HOST     → ex: smtp.gmail.com  ou  mail.infomaniak.com
    //   SMTP_PORT     → ex: 587
    //   SMTP_USER     → adresse email expéditeur
    //   SMTP_PASS     → mot de passe ou app password
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const dateHeure = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(new Date())

    // Email à l'admin
    await transporter.sendMail({
      from: `"TalentFlow" <${process.env.SMTP_USER}>`,
      to: DESTINATAIRE,
      subject: `🚀 Nouvelle demande d'accès — ${prenom} ${nom} (${entreprise})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFFDF5; border: 2px solid #1C1A14; border-radius: 12px; overflow: hidden;">
          <div style="background: #F7C948; padding: 24px 28px; border-bottom: 2px solid #1C1A14;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #1C1A14;">
              🎉 Nouvelle demande d'accès TalentFlow
            </h1>
            <p style="margin: 4px 0 0; font-size: 13px; color: #4a4a30;">${dateHeure}</p>
          </div>
          <div style="padding: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B; width: 120px;">Prénom</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${prenom}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B;">Nom</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${nom}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 13px; font-weight: 700; color: #6B6B5B;">Entreprise</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #E8E4D4; font-size: 14px; font-weight: 700; color: #1C1A14;">${entreprise}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-size: 13px; font-weight: 700; color: #6B6B5B;">Email</td>
                <td style="padding: 10px 0; font-size: 14px; font-weight: 700; color: #1C1A14;">
                  <a href="mailto:${email}" style="color: #1C1A14;">${email}</a>
                </td>
              </tr>
            </table>

            <div style="margin-top: 24px; padding: 16px; background: #F0FFF4; border: 1.5px solid #86EFAC; border-radius: 8px;">
              <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">
                💡 Pour donner l'accès, créez un compte manuellement dans Supabase Auth
                ou envoyez une invitation à <strong>${email}</strong>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Nouvelle demande d'accès TalentFlow\n\nPrénom : ${prenom}\nNom : ${nom}\nEntreprise : ${entreprise}\nEmail : ${email}\nDate : ${dateHeure}`,
    })

    // Email de confirmation au candidat
    await transporter.sendMail({
      from: `"TalentFlow" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Votre demande d'accès TalentFlow a bien été reçue ✓`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FFFDF5; border: 2px solid #1C1A14; border-radius: 12px; overflow: hidden;">
          <div style="background: #F7C948; padding: 24px 28px; border-bottom: 2px solid #1C1A14;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #1C1A14;">
              Bonjour ${prenom} 👋
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; color: #1C1A14; line-height: 1.6;">
              Merci pour votre intérêt pour <strong>TalentFlow</strong> !
            </p>
            <p style="font-size: 14px; color: #4a4a30; line-height: 1.6;">
              Votre demande d'accès a bien été enregistrée. Notre équipe reviendra vers vous
              sous <strong>24 heures</strong> avec vos identifiants de connexion.
            </p>
            <div style="margin: 24px 0; padding: 16px; background: white; border: 2px solid #1C1A14; border-radius: 10px; box-shadow: 3px 3px 0 #1C1A14;">
              <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #6B6B5B; text-transform: uppercase; letter-spacing: 0.5px;">Votre demande</p>
              <p style="margin: 0; font-size: 14px; color: #1C1A14; font-weight: 600;">${prenom} ${nom} — ${entreprise}</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #6B6B5B;">${email}</p>
            </div>
            <p style="font-size: 13px; color: #9E9E8E;">
              En attendant, vous pouvez nous contacter directement à
              <a href="mailto:j.barbosa@l-agence.ch" style="color: #1C1A14; font-weight: 700;">j.barbosa@l-agence.ch</a>
            </p>
          </div>
        </div>
      `,
      text: `Bonjour ${prenom},\n\nMerci pour votre demande d'accès à TalentFlow. Nous reviendrons vers vous sous 24h.\n\nÀ bientôt,\nL'équipe TalentFlow`,
    })

    console.log(`[Demande accès] ${prenom} ${nom} (${entreprise}) — ${email}`)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Demande accès] Erreur:', error)
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
