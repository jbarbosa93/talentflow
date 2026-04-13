// api/annonces/france-travail — Génère le formulaire Word et l'envoie à France Travail
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRouteUser, logActivityServer } from '@/lib/logActivity'
import { requireAuth } from '@/lib/auth-guard'
import nodemailer from 'nodemailer'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel,
} from 'docx'

export const runtime = 'nodejs'

const FT_TO = 'pei.74041@pole-emploi.fr'
const FT_CC = ['andre.bonier@pole-emploi.fr', 'info@l-agence.ch']

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

const F = 'Arial'
const S = 20  // 10pt
const SB = 20

function p(children: TextRun[], spacing = 80): Paragraph {
  return new Paragraph({ spacing: { after: spacing }, children })
}
function t(text: string, opts: any = {}): TextRun {
  return new TextRun({ text, font: F, size: S, ...opts })
}
function tb(text: string): TextRun { return t(text, { bold: true }) }
function tul(text: string): TextRun { return t(text, { underline: {} }) }

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '003399', space: 4 } },
    children: [new TextRun({ text, font: F, size: 22, bold: true, underline: {} })],
  })
}

function fieldLine(label: string, value: string): Paragraph {
  return p([tb(label + ' : '), t(value || '')])
}

// ─── Génération DOCX (format proche de l'original) ──────────────────────────

async function generateDocx(data: any): Promise<Buffer> {
  const {
    titre, nombre_postes, description,
    qualification, formation, connaissances, experience, debutant, exp_type, exp_annees,
    contrat, duree_cdd, horaire, heures_hebdo, temps_partiel, precision_horaires,
    lieu, prise_de_poste, contact_info, infos_complementaires,
  } = data

  const isCdi = contrat !== 'cdd'
  const isTempsPlein = !temps_partiel
  const isContactDirect = true
  const isContactFT = false

  const prisDe = prise_de_poste
    ? new Date(prise_de_poste).toLocaleDateString('fr-FR')
    : '…… / …………… / ……………'

  const descLines: string[] = (description || '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 900, bottom: 900, left: 1000, right: 1000 },
        },
      },
      children: [

        // ── EN-TÊTE ──────────────────────────────────────────────────────────
        p([tb('FORMULAIRE DÉPÔT D\'OFFRE EN SUISSE 2021')], 60),
        p([
          t('À retourner par email : '),
          tul('pei.74041@pole-emploi.fr'),
          t(' et en copie à '),
          tul('andre.bonier@pole-emploi.fr'),
          t(' — Ligne directe employeur : '),
          tb('0033 450 84 89 58'),
        ], 60),
        p([t('Merci de nous retourner ce document au format Word. Tout document incomplet ne sera pas traité. Pas d\'abréviation et d\'anglais dans le titre. Merci', { italics: true, size: 18 })], 200),

        // ── VOTRE ENTREPRISE ─────────────────────────────────────────────────
        sectionTitle('Votre Entreprise'),
        p([tb('NOM de la SOCIÉTÉ : '), t(COMPANY.nom), t('     '), tb('Activité : '), t(COMPANY.activite)]),
        p([tb('NUMÉRO DE SIRET (entreprise française) : '), t('(non applicable – entreprise suisse)')]),
        p([tb('ADRESSE : '), t('Avenue des Alpes 3, 1870 Monthey – Suisse')]),
        p([tb('ADRESSE SITE INTERNET : '), t(COMPANY.site), t('     '), tb('Effectif : '), t('')]),
        p([tb('ADRESSE COURRIEL : '), t(COMPANY.email)]),
        p([tb('PERSONNE À JOINDRE : '), t(COMPANY.contact), t('     '), tb('FONCTION : '), t(COMPANY.fonction)]),
        p([tb('TÉLÉPHONE : '), t(COMPANY.tel), t('     '), tb('Natel : '), t(COMPANY.natel)], 200),

        // ── L'EMPLOI OFFERT ──────────────────────────────────────────────────
        sectionTitle('L\'emploi offert'),
        p([
          tb('INTITULÉ DU POSTE : '), t(titre || ''),
          t('          '),
          tb('Nombre de postes : '), t(String(nombre_postes || '2')),
        ]),
        p([tb('DESCRIPTIF DES TÂCHES et responsabilités (maximum 1000 caractères)')]),
        ...descLines.map((line: string) => p([t('– ' + line)], 40)),
        new Paragraph({ spacing: { after: 160 } }),

        // ── LE PROFIL RECHERCHÉ ───────────────────────────────────────────────
        sectionTitle('Le profil recherché'),
        fieldLine('QUALIFICATION', qualification || ''),
        fieldLine('FORMATION INITIALE et CONTINUE (diplômes exigés ou niveau)', formation || ''),
        fieldLine('CONNAISSANCES PARTICULIÈRES (langues, informatique, permis…)', connaissances || ''),
        fieldLine('EXPÉRIENCE PROFESSIONNELLE (domaines et durée)', experience || ''),
        p([
          tb('DÉBUTANT '), t(debutant ? '☑' : '☐'),
          t('     '),
          tb('EXPÉRIENCE '),
          t('exigée '), t((!debutant && exp_type === 'exigee') ? '☑' : '☐'),
          t('   Souhaitée '), t((!debutant && exp_type === 'souhaitee') ? '☑' : '☐'),
          t(`   ${exp_annees || ''} an(s)`),
        ], 200),

        // ── LES CONDITIONS D'EMPLOI ───────────────────────────────────────────
        sectionTitle('Les conditions d\'emploi'),
        p([
          t('CDI '), t(isCdi ? '☑' : '☐'),
          t('     CDD '), t(!isCdi ? '☑' : '☐'),
          t('     '),
          tb('Si CDD, pour quelle durée : '), t(!isCdi ? (duree_cdd || '') : 'Poste à l\'année'),
        ]),
        fieldLine('HORAIRE DE TRAVAIL (Début – Fin)', horaire || ''),
        p([
          tb('DURÉE DU TRAVAIL : '), t(heures_hebdo || '40-45'),
          t(' Heures hebdomadaires     '),
          t('temps plein '), t(isTempsPlein ? '☑' : '☐'),
          t('     temps partiel '), t(!isTempsPlein ? '☑' : '☐'),
        ]),
        fieldLine('PRÉCISION SUR LES HORAIRES (3×8, week-end, nuit…)', precision_horaires || ''),
        fieldLine('LIEU DE TRAVAIL', lieu || ''),
        p([tb('SALAIRE (précision indispensable) : '), t('DE ………… A ………… CHF')]),
        p([tb('PRISE DE POSTE LE : '), t(prisDe)], 200),

        // ── SERVICE ATTENDU ───────────────────────────────────────────────────
        sectionTitle('Le service attendu pour le traitement de votre offre'),
        p([t('Mode de mise en relation des candidats : répondez seulement à l\'une ou l\'autre des 2 possibilités mais pas les 2', { italics: true, size: 18 })]),
        p([
          t('1) Les candidats vous contactent directement : '),
          tb('oui '), t(isContactDirect ? '☑' : '☐'),
          t('   non '), t(!isContactDirect ? '☑' : '☐'),
        ]),
        p([
          t('   Si oui : par téléphone, par courrier, par email : '),
          t(contact_info || `${COMPANY.tel}  ${COMPANY.email}`),
        ]),
        p([
          t('2) Les candidats répondent à Pôle emploi : '),
          tb('oui '), t(isContactFT ? '☑' : '☐'),
          t('   non '), t(!isContactFT ? '☑' : '☐'),
        ]),
        p([
          tb('Informations complémentaires '),
          t('(Pour les cabinets de recrutement, merci de préciser le nom de votre client final et son secteur d\'activité) : '),
          t(infos_complementaires || ''),
        ]),
      ],
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ─── Route POST ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
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
          cc: FT_CC,
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
        cc: FT_CC.join(', '),
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
        metadata: { source: 'france_travail', titre: data.titre, lieu: data.lieu, contrat: data.contrat, nombre_postes: data.nombre_postes || 2, filename },
      })
    } catch (err) { console.warn('[france-travail] logActivity failed:', (err as Error).message) }

    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error('[France Travail] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur' }, { status: 500 })
  }
}
