// app/api/microsoft/send/route.ts
// Envoie un email via Microsoft Graph API — support BCC multi-destinataires

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, callGraph } from '@/lib/microsoft'
import type { Integration } from '@/types/database'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const body = await request.json()

    // Support ancien format (destinataire string) ET nouveau (destinataires array)
    const destinataires: string[] = body.destinataires
      ? body.destinataires
      : body.destinataire
        ? [body.destinataire]
        : []
    const { candidat_ids, sujet, corps, use_bcc = false, include_signature = true } = body
    const send_mode = body.send_mode === 'grouped' ? 'grouped' : 'individual' // v1.9.70
    const cc: string[] = Array.isArray(body.cc) ? body.cc.filter((e: any) => typeof e === 'string' && e.trim()) : []
    const candidat_id = body.candidat_id || (candidat_ids?.[0]) || null

    if (destinataires.length === 0 || !sujet || !corps) {
      return NextResponse.json(
        { error: 'destinataire(s), sujet et corps sont requis' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Récupérer le user connecté pour utiliser SON compte Outlook personnel
    const { createClient } = await import('@/lib/supabase/server')
    const supabaseUser = await createClient()
    const { data: { user: currentUser } } = await supabaseUser.auth.getUser()

    let integrationRaw: any = null

    if (currentUser?.id) {
      // Chercher l'intégration email personnelle de l'utilisateur
      const { data: personalEmail } = await supabase
        .from('integrations')
        .select('*')
        .eq('type', 'microsoft_email' as any)
        .filter('metadata->>user_id', 'eq', currentUser.id)
        .eq('actif', true)
        .maybeSingle()
      integrationRaw = personalEmail
    }

    const integration = integrationRaw as unknown as Integration | null

    if (!integration) {
      return NextResponse.json(
        { error: 'Aucun compte Outlook connecté. Connectez votre compte Outlook dans Paramètres > Profil.' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(integration.id)

    // Signature dynamique du consultant connecté
    // Priorité 1 : user_metadata.signature_html (custom)
    // Priorité 2 : preset par défaut (prenom du consultant)
    let signature = ''
    if (include_signature && currentUser?.user_metadata) {
      const m = currentUser.user_metadata
      const customHtml = typeof m.signature_html === 'string' ? m.signature_html.trim() : ''
      if (customHtml) {
        signature = `<br><br>${customHtml}`
      } else {
        const prenom = (m.prenom || m.first_name || '').toString().trim()
        if (prenom) {
          signature = `<br><br><p style="font-family:Arial,sans-serif;font-size:13px;color:#111827;margin:0">Cordialement,<br><strong>${prenom}</strong><br>L-AGENCE SA<br>+41 24 552 18 70<br>info@l-agence.ch</p>`
        }
      }
    }

    // Build recipients
    const recipients = destinataires.map((email: string) => ({
      emailAddress: { address: email },
    }))

    // Build message — v1.9.70 : 3 modes
    // - send_mode='grouped' : toRecipients = destinataires, ccRecipients = cc (1 seul email visible)
    // - use_bcc=true        : bccRecipients (copie cachée, mode "rare")
    // - default (individual) : toRecipients (appelé 1x par destinataire côté client)
    const message: any = {
      subject: sujet,
      body: {
        contentType: 'HTML',
        content: corps.replace(/\n/g, '<br>') + signature,
      },
      from: {
        emailAddress: { address: integration.email, name: integration.nom_compte },
      },
    }

    if (send_mode === 'grouped') {
      message.toRecipients = recipients
      if (cc.length > 0) {
        message.ccRecipients = cc.map((email: string) => ({ emailAddress: { address: email } }))
      }
    } else if (use_bcc) {
      message.bccRecipients = recipients
    } else {
      message.toRecipients = recipients
    }

    // Joindre les CVs des candidats sélectionnés
    const allCandidatIds = candidat_ids || (candidat_id ? [candidat_id] : [])
    const cvOptions = body.cv_options || {}
    const attachCvs = body.attach_cvs || false
    // v1.9.78 — docs non-CV (certificats, permis, diplômes, etc.) à joindre par candidat
    // Format : { [candidatId]: string[] }  avec URLs des documents choisis (issues de candidat.documents[].url)
    const extraDocs: Record<string, string[]> = body.extra_docs && typeof body.extra_docs === 'object' ? body.extra_docs : {}
    const hasExtraDocs = Object.values(extraDocs).some(arr => Array.isArray(arr) && arr.length > 0)

    // Limite Graph API = 35 MB au total pour les pièces jointes d'un mail.
    // On prend une marge à 30 MB (base64 ≈ +33% de la taille binaire + métadonnées JSON).
    const MAX_ATTACH_BYTES = 30 * 1024 * 1024
    const docsJoinedLog: Array<{ url: string; type: string; name: string }> = []

    if (allCandidatIds.length > 0 && (attachCvs || hasExtraDocs)) {
      const { data: candidats } = await supabase
        .from('candidats')
        .select('id, nom, prenom, cv_url, cv_nom_fichier, documents')
        .in('id', allCandidatIds)

      const attachments: any[] = []
      let totalBase64Bytes = 0
      const pushAttachment = (att: any, candidateName: string) => {
        const size = typeof att.contentBytes === 'string' ? att.contentBytes.length : 0
        if (totalBase64Bytes + size > MAX_ATTACH_BYTES) {
          const err: any = new Error(
            `Pièces jointes trop volumineuses (limite 30 MB). Dépassement détecté sur ${candidateName}. ` +
            `Retirez un ou plusieurs documents et réessayez.`
          )
          err.code = 'ATTACHMENTS_TOO_LARGE'
          throw err
        }
        totalBase64Bytes += size
        attachments.push(att)
      }

      for (const c of (candidats || [])) {
        const cname = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'candidat'
        const opts = cvOptions[c.id]

        // ─── 1. CV (si attachCvs) ──────────────────────────────────────────
        if (attachCvs) {
          if (opts?.pdfBase64) {
            pushAttachment({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: `CV_${c.prenom || ''}_${c.nom || ''}.pdf`,
              contentType: 'application/pdf',
              contentBytes: opts.pdfBase64,
            }, cname)
          } else if (!(opts && !opts.original && !opts.pdfBase64) && c.cv_url) {
            // Joindre le CV original (si opts.original ou pas d'options du tout)
            try {
              const cvRes = await fetch(c.cv_url)
              if (cvRes.ok) {
                const buffer = Buffer.from(await cvRes.arrayBuffer())
                const filename = c.cv_nom_fichier || `CV_${c.prenom || ''}_${c.nom || ''}.pdf`
                const contentType = filename.toLowerCase().endsWith('.docx')
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'application/pdf'
                pushAttachment({
                  '@odata.type': '#microsoft.graph.fileAttachment',
                  name: filename,
                  contentType,
                  contentBytes: buffer.toString('base64'),
                }, cname)
              }
            } catch (err) {
              if (err && typeof err === 'object' && (err as any).code === 'ATTACHMENTS_TOO_LARGE') throw err
              console.error(`[MS Send] Erreur téléchargement CV ${c.nom}:`, err)
            }
          }
        }

        // ─── 2. Documents additionnels (certificats, permis, etc.) ─────────
        const wantedUrls: string[] = Array.isArray(extraDocs[c.id]) ? extraDocs[c.id] : []
        if (wantedUrls.length > 0) {
          const candidatDocs: Array<{ url: string; name: string; type: string }> = Array.isArray((c as any).documents) ? (c as any).documents : []
          for (const wantedUrl of wantedUrls) {
            const doc = candidatDocs.find(d => d?.url === wantedUrl)
            if (!doc?.url) continue
            try {
              const docRes = await fetch(doc.url)
              if (!docRes.ok) continue
              const buffer = Buffer.from(await docRes.arrayBuffer())
              const fname = doc.name || `document.${doc.url.split('.').pop() || 'pdf'}`
              const ext = (fname.split('.').pop() || '').toLowerCase()
              const contentType = ext === 'pdf' ? 'application/pdf'
                : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : ext === 'doc' ? 'application/msword'
                : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'png' ? 'image/png'
                : 'application/octet-stream'
              pushAttachment({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: fname,
                contentType,
                contentBytes: buffer.toString('base64'),
              }, cname)
              docsJoinedLog.push({ url: doc.url, type: doc.type || 'autre', name: fname })
            } catch (err) {
              if (err && typeof err === 'object' && (err as any).code === 'ATTACHMENTS_TOO_LARGE') throw err
              console.error(`[MS Send] Erreur téléchargement doc ${doc.name}:`, err)
            }
          }
        }
      }

      if (attachments.length > 0) {
        message.attachments = attachments
      }
    }

    // Send via Graph API
    await callGraph(accessToken, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    })

    // Log sent emails — un log par destinataire, regroupés par campagne_id
    // v1.9.60 : campagne_id uuid partagé + user_id + candidat_ids[] + client_nom + cv_personnalise + cv_urls_utilises
    // v1.9.65 : accept body.campagne_id pour que l'UI qui boucle destinataire-par-destinataire
    //            puisse grouper tous les envois d'une même session sous un seul campagne_id.
    const campagneId = (typeof body.campagne_id === 'string' && body.campagne_id.trim())
      ? body.campagne_id.trim()
      : ((globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const cvPersonnalise = Object.values(cvOptions).some((o: any) => o?.pdfBase64)
    const cvUrlsUtilises: string[] = []
    if (allCandidatIds.length > 0 && attachCvs) {
      const { data: candidatsCv } = await supabase
        .from('candidats')
        .select('id, cv_url')
        .in('id', allCandidatIds)
      for (const c of (candidatsCv || [])) {
        const opts = cvOptions[c.id]
        if (opts?.pdfBase64) cvUrlsUtilises.push(`custom:${c.id}`)
        else if (c.cv_url) cvUrlsUtilises.push(c.cv_url)
      }
    }
    // v1.9.78 — les docs joints sont tracés dans cv_urls_utilises avec préfixe `doc:<type>:<url>`
    // (plutôt qu'une nouvelle colonne — rétrocompat historique, l'UI parse le préfixe pour afficher "1 certificat", etc.)
    for (const d of docsJoinedLog) {
      cvUrlsUtilises.push(`doc:${d.type}:${d.url}`)
    }

    // Résolution client_id/nom
    // v1.9.112 — body.client_id (fourni explicitement par la prospection en lot) prend priorité.
    //            Sinon : best-effort matching legacy (laissé inchangé).
    let clientId: string | null = null
    let clientNom: string | null = null
    if (typeof body.client_id === 'string' && body.client_id.trim()) {
      clientId = body.client_id.trim()
      try {
        const { data: c } = await (supabase as any)
          .from('clients')
          .select('nom_entreprise')
          .eq('id', clientId)
          .maybeSingle()
        if (c?.nom_entreprise) clientNom = c.nom_entreprise
      } catch { /* ignore */ }
    } else {
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
    }

    const logs = destinataires.map((dest: string) => ({
      candidat_id,
      integration_id: integration.id,
      sujet,
      corps,
      destinataire: dest,
      statut: 'envoye' as const,
      user_id: currentUser?.id ?? null,
      campagne_id: campagneId,
      candidat_ids: allCandidatIds.length > 0 ? allCandidatIds : null,
      client_id: clientId,
      client_nom: clientNom,
      cv_personnalise: cvPersonnalise,
      cv_urls_utilises: cvUrlsUtilises.length > 0 ? cvUrlsUtilises : null,
    }))
    await supabase.from('emails_envoyes').insert(logs as any)

    return NextResponse.json({ success: true, count: destinataires.length, campagne_id: campagneId })

  } catch (error) {
    console.error('[MS Send] Error:', error)
    // v1.9.78 — erreur spécifique pièces jointes trop volumineuses → 413 (non-envoi)
    if (error && typeof error === 'object' && (error as any).code === 'ATTACHMENTS_TOO_LARGE') {
      return NextResponse.json(
        { error: (error as Error).message, code: 'ATTACHMENTS_TOO_LARGE' },
        { status: 413 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur envoi email' },
      { status: 500 }
    )
  }
}
