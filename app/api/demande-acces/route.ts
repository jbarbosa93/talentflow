// POST /api/demande-acces
// 1. Sauvegarde dans Supabase (table demandes_acces) — toujours fiable
// 2. Tentative d'envoi d'email via SMTP si configuré (optionnel)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailWrapper } from '@/lib/email-template'

export const runtime = 'nodejs'

const DESTINATAIRE = 'j.barbosa@l-agence.ch'

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildHtmlAdmin(prenom: string, nom: string, entreprise: string, email: string, dateHeure: string) {
  const p = escHtml(prenom), n = escHtml(nom), e = escHtml(entreprise), em = escHtml(email)
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Nouvelle demande d'accès
    </h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:13px">${dateHeure}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#6B7280;width:110px">Prénom</td><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700;color:#111827">${p}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#6B7280">Nom</td><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700;color:#111827">${n}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#6B7280">Entreprise</td><td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700;color:#111827">${e}</td></tr>
      <tr><td style="padding:10px 0;font-size:13px;font-weight:700;color:#6B7280">Email</td><td style="padding:10px 0;font-size:14px;font-weight:700;color:#111827"><a href="mailto:${em}" style="color:#111827">${em}</a></td></tr>
    </table>

    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:14px 16px">
      <p style="margin:0;color:#065F46;font-size:13px;line-height:1.5">
        💡 Retrouvez cette demande dans TalentFlow → Paramètres → Demandes d'accès
      </p>
    </div>
  `)
}

function buildHtmlConfirmation(prenom: string, nom: string, entreprise: string, email: string) {
  const p = escHtml(prenom), n = escHtml(nom), e = escHtml(entreprise), em = escHtml(email)
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Bonjour ${p} 👋
    </h2>
    <p style="margin:0 0 12px;color:#6B7280;font-size:15px;line-height:1.6">
      Merci pour votre intérêt pour <strong>TalentFlow</strong> !
    </p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:14px;line-height:1.6">
      Votre demande d'accès a bien été enregistrée. Notre équipe reviendra vers vous sous <strong>24 heures</strong>.
    </p>

    <div style="background:#F9F5EE;border:2px solid #1C1A14;border-radius:10px;padding:16px;margin-bottom:24px;box-shadow:3px 3px 0 #1C1A14">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Votre demande</p>
      <p style="margin:0;font-size:14px;color:#111827;font-weight:600">${p} ${n} — ${e}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6B7280">${em}</p>
    </div>

    <p style="margin:0;font-size:13px;color:#9CA3AF">
      En attendant : <a href="mailto:j.barbosa@l-agence.ch" style="color:#111827;font-weight:700">j.barbosa@l-agence.ch</a>
    </p>
  `)
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
