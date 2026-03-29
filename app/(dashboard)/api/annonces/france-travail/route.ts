// api/annonces/france-travail — Génère le formulaire Word et l'envoie à France Travail
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRouteUser, logActivityServer } from '@/lib/logActivity'
import nodemailer from 'nodemailer'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel,
} from 'docx'

export const runtime = 'nodejs'

const FT_TO = 'pei.74041@pole-emploi.fr'
const FT_CC = 'andre.bonier@pole-emploi.fr'

const COMPANY = {
  nom:      'L-Agence SA',
  activite: 'Recrutement et placement de personnel intérim',
  adresse:  'Avenue des Alpes 3',
  site:     'www.l-agence.ch',
  email:    'info@l-agence.ch',
  contact:  'Joao Barbosa',
  fonction: 'Consultant',
  tel:      '0041245521870',
  natel:    '0041788658774',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLUE = '003399'
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const BORDERS_NONE = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE }
const BORDER_GRAY = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
const BORDERS_GRAY = { top: BORDER_GRAY, bottom: BORDER_GRAY, left: BORDER_GRAY, right: BORDER_GRAY }

function sectionHeader(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: BLUE },
    indent: { left: 160, right: 160 },
    children: [new TextRun({ text: title, bold: true, size: 22, color: 'FFFFFF', font: 'Calibri' })],
  })
}

function field(label: string, value: string): Paragraph[] {
  const lines = (value || '—').split('\n').filter(l => l.trim())
  return lines.map((line, i) => new Paragraph({
    spacing: { after: i < lines.length - 1 ? 40 : 120 },
    indent: { left: 160 },
    children: [
      ...(i === 0 ? [new TextRun({ text: `${label} : `, bold: true, size: 19, font: 'Calibri' })] : [
        new TextRun({ text: '  ', size: 19 })
      ]),
      new TextRun({ text: line, size: 19, font: 'Calibri' }),
    ],
  }))
}

function infoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3600, type: WidthType.DXA },
        borders: BORDERS_GRAY,
        shading: { type: ShadingType.CLEAR, fill: 'EEF2FF' },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, font: 'Calibri' })] })],
      }),
      new TableCell({
        width: { size: 5760, type: WidthType.DXA },
        borders: BORDERS_GRAY,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value || '—', size: 18, font: 'Calibri' })] })],
      }),
    ],
  })
}

// ─── Génération DOCX ─────────────────────────────────────────────────────────

async function generateDocx(data: any): Promise<Buffer> {
  const {
    titre, nombre_postes, description,
    qualification, formation, connaissances, experience, debutant, exp_type, exp_annees,
    contrat, duree_cdd, horaire, heures_hebdo, temps_partiel, precision_horaires,
    lieu, salaire_de, salaire_a, prise_de_poste,
    contact_direct, contact_info, infos_complementaires,
  } = data

  const expStr = debutant
    ? 'Débutant accepté'
    : `${exp_type === 'exigee' ? 'Exigée' : 'Souhaitée'} — ${exp_annees || '?'} an(s)`

  const salStr = (salaire_de || salaire_a)
    ? `De ${salaire_de || '?'} à ${salaire_a || '?'} CHF`
    : '—'

  const contratStr = contrat === 'cdi' ? 'CDI' : `CDD — durée : ${duree_cdd || '?'}`
  const tempsStr = `${heures_hebdo || '?'} h/sem — ${temps_partiel ? 'Temps partiel' : 'Temps plein'}`

  const contactStr = contact_direct
    ? `Candidats contactent directement — ${contact_info || COMPANY.tel}`
    : 'Les candidats répondent à France Travail'

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, bottom: 1080, left: 1134, right: 1134 },
        },
      },
      children: [
        // En-tête
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'FORMULAIRE DÉPÔT D\'OFFRE EN SUISSE', bold: true, size: 28, color: BLUE, font: 'Calibri' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: `À retourner par email : ${FT_TO} et en copie à ${FT_CC}`, size: 17, color: '555555', font: 'Calibri' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: 'Ligne directe employeur : 0033 450 84 89 58', size: 17, color: '555555', font: 'Calibri' })],
        }),

        // ── VOTRE ENTREPRISE ──────────────────────────────────────────────────
        sectionHeader('VOTRE ENTREPRISE'),
        new Paragraph({ spacing: { after: 100 } }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3600, 5760],
          rows: [
            infoRow('Nom de la société', COMPANY.nom),
            infoRow('Activité', COMPANY.activite),
            infoRow('Adresse', COMPANY.adresse),
            infoRow('Site internet', COMPANY.site),
            infoRow('Email', COMPANY.email),
            infoRow('Personne à joindre', `${COMPANY.contact} — ${COMPANY.fonction}`),
            infoRow('Téléphone', `${COMPANY.tel} / ${COMPANY.natel}`),
          ],
        }),

        // ── L'EMPLOI OFFERT ───────────────────────────────────────────────────
        sectionHeader('L\'EMPLOI OFFERT'),
        ...field('Intitulé du poste', titre),
        ...field('Nombre de postes à pourvoir', String(nombre_postes || '1')),
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 160 },
          children: [new TextRun({ text: 'Descriptif des tâches :', bold: true, size: 19, font: 'Calibri' })],
        }),
        ...(description || '—').split('\n').filter((l: string) => l.trim()).map((line: string) =>
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 320 },
            bullet: { level: 0 },
            children: [new TextRun({ text: line.replace(/^[-•]\s*/, ''), size: 19, font: 'Calibri' })],
          })
        ),
        new Paragraph({ spacing: { after: 120 } }),

        // ── LE PROFIL RECHERCHÉ ────────────────────────────────────────────────
        sectionHeader('LE PROFIL RECHERCHÉ'),
        ...field('Qualification', qualification),
        ...field('Formation initiale et continue', formation),
        ...field('Connaissances particulières (langues, permis, informatique…)', connaissances),
        ...field('Expérience professionnelle', experience),
        ...field('Niveau d\'expérience', expStr),

        // ── LES CONDITIONS D'EMPLOI ───────────────────────────────────────────
        sectionHeader('LES CONDITIONS D\'EMPLOI'),
        ...field('Type de contrat', contratStr),
        ...field('Horaire de travail (Début – Fin)', horaire),
        ...field('Durée du travail', tempsStr),
        ...field('Précisions sur les horaires', precision_horaires),
        ...field('Lieu de travail', lieu),
        ...field('Salaire', salStr),
        ...field('Prise de poste', prise_de_poste),

        // ── SERVICE ATTENDU ───────────────────────────────────────────────────
        sectionHeader('LE SERVICE ATTENDU'),
        ...field('Mode de mise en relation', contactStr),
        ...field('Informations complémentaires (client final, secteur)', infos_complementaires),
      ],
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ─── Route POST ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.titre || !data.description || !data.lieu) {
      return NextResponse.json({ error: 'Titre, description et lieu sont obligatoires' }, { status: 400 })
    }

    // Générer le Word doc
    const docBuffer = await generateDocx(data)
    const filename = `Annonce_${(data.titre || 'poste').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`

    const subject = `Dépôt d'offre — ${data.titre} (${data.nombre_postes || 2} postes) — L-Agence SA`
    const htmlBody = `
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint notre formulaire de dépôt d'offre pour le poste de <strong>${data.titre}</strong>
      (${data.nombre_postes || 2} postes) — ${data.lieu}.</p>
      <p>Cordialement,<br>${COMPANY.contact}<br>${COMPANY.nom}<br>${COMPANY.tel}</p>
    `
    const docBase64 = docBuffer.toString('base64')

    // ── Essai 1 : Resend (toujours disponible, pas besoin de config SMTP) ──────
    const RESEND_API_KEY = process.env.RESEND_API_KEY
    if (RESEND_API_KEY) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'TalentFlow <noreply@talent-flow.ch>',
          to: [FT_TO],
          cc: [FT_CC],
          subject,
          html: htmlBody,
          attachments: [{ filename, content: docBase64 }],
        }),
      })
      if (!resendRes.ok) {
        const err = await resendRes.text()
        throw new Error(`Resend: ${err}`)
      }
    } else {
      // ── Essai 2 : SMTP configuré ──────────────────────────────────────────────
      const supabase = createAdminClient()
      const { data: settingsRow } = await (supabase as any)
        .from('app_settings').select('value').eq('key', 'smtp_config').single()

      if (!settingsRow) {
        return NextResponse.json({ error: 'Aucune méthode d\'envoi disponible. Configurez le SMTP dans Messages → Paramètres.' }, { status: 404 })
      }

      const smtpConfig = JSON.parse(settingsRow.value)
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host || 'smtp.office365.com',
        port: smtpConfig.port || 587,
        secure: false,
        auth: { user: smtpConfig.email, pass: smtpConfig.password },
        tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
      })
      await transporter.sendMail({
        from: smtpConfig.nom ? `"${smtpConfig.nom}" <${smtpConfig.email}>` : smtpConfig.email,
        to: FT_TO,
        cc: FT_CC,
        subject,
        html: htmlBody,
        attachments: [{ filename, content: docBuffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
      })
    }

    // Log activité
    try {
      const user = await getRouteUser()
      await logActivityServer({
        ...user,
        type: 'email_envoye',
        titre: `Offre France Travail envoyée — ${data.titre}`,
        description: `${data.nombre_postes || 1} poste(s) — ${data.lieu} — envoi vers ${FT_TO}`,
        metadata: { titre: data.titre, lieu: data.lieu, contrat: data.contrat },
      })
    } catch {}

    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error('[France Travail] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur' }, { status: 500 })
  }
}
