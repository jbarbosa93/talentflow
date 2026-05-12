// One-shot — Correction de la submission Ismael Jarmoun (semaine 20 → 19)
// v2.6.17 — Usage : npx tsx scripts/one-shot/correct-week-ismael.ts
//
// Pré-requis : variables d'environnement chargées (.env.local)

import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Charge .env.local AVANT tout import qui utilise les env vars
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
config({ path: path.join(projectRoot, '.env.local') })

// ─── Lazy imports après chargement env ───────────────────────────────────
async function main() {
  const { correctSubmissionWeek } = await import('@/lib/report/correct-week')
  const { sendCorrectionEmail } = await import('@/lib/report/send-notifications')
  const { createAdminClient } = await import('@/lib/supabase/admin')

  const SUBMISSION_ID = '34a08da1-3429-4324-b628-0c5492d57d6a'
  const NEW_WEEK_START = '2026-05-04' // Lundi de la semaine 19
  const REASON = 'Le rapport a été déclaré par erreur en semaine 20 alors qu\'il concerne la semaine 19. Correction du numéro de semaine et des dates affichées sans modification des heures déclarées.'
  const ACTOR_EMAIL = process.env.ADMIN_EMAIL || 'jbarbosa93@hotmail.com'

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Correction submission Ismael Jarmoun (S20 → S19)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Submission ID :', SUBMISSION_ID)
  console.log('New week_start:', NEW_WEEK_START, '(lundi semaine 19)')
  console.log('Actor         :', ACTOR_EMAIL)
  console.log('Reason        :', REASON.slice(0, 80) + '...')
  console.log('')

  // ─── 1. Correction (lib) ─────────────────────────────────────────────
  console.log('▶ Étape 1/3 — Correction DB + regen PDF…')
  let correction
  try {
    correction = await correctSubmissionWeek({
      submissionId: SUBMISSION_ID,
      newWeekStart: NEW_WEEK_START,
      reason: REASON,
      actorEmail: ACTOR_EMAIL,
      actorIp: 'one-shot-script',
    })
  } catch (e: any) {
    console.error('❌ ERREUR correctSubmissionWeek:', e?.code || '', e?.message || e)
    process.exit(1)
  }

  console.log('✓ DB corrigée — week_start:', correction.submission.week_start)
  console.log('✓ PDFs régénérés :', correction.newPdfs.length)
  correction.newPdfs.forEach(p => console.log('  ·', p.name))
  console.log('  De   : S' + correction.fromWeek.weekNumber + ' (' + correction.fromWeek.label + ')')
  console.log('  Vers : S' + correction.toWeek.weekNumber + ' (' + correction.toWeek.label + ')')
  console.log('')

  // ─── 2. Préparation PDF en PJ (rapport seul, pas le certificat) ─────
  const attachments = correction.newPdfs
    .filter(d => !/certificat/i.test(d.name))
    .map(d => ({ filename: d.name, content: d.pdfBase64 }))
  console.log('✓ Attachments rapport (sans cert) :', attachments.length)
  console.log('')

  // ─── 3. Résolution destinataires ─────────────────────────────────────
  const adminClient = createAdminClient()
  const link = correction.link
  const submission = correction.submission
  const adminEnvEmail = (process.env.ADMIN_EMAIL || '').trim()

  let creatorEmail = ''
  if (link.created_by) {
    try {
      const { data: creatorUser } = await adminClient.auth.admin.getUserById(link.created_by)
      creatorEmail = (creatorUser?.user?.email || '').trim()
    } catch (e) {
      console.warn('⚠ getUserById error:', e instanceof Error ? e.message : String(e))
    }
  }

  const candidatEmail = (link.candidat_email || '').trim()

  let clientEmail = ''
  let clientContactName: string | null = null
  let clientName = (link.client_name || '').trim()
  if (submission.report_link_client_id) {
    const { data: rlc } = await (adminClient as any)
      .from('report_link_clients')
      .select('client_email, client_contact_name, client_name')
      .eq('id', submission.report_link_client_id)
      .maybeSingle()
    if (rlc) {
      clientEmail = (rlc.client_email || '').trim()
      clientContactName = rlc.client_contact_name || null
      clientName = rlc.client_name || clientName
    }
  }
  if (!clientEmail) clientEmail = (link.client_email || '').trim()
  if (!clientContactName) clientContactName = link.client_contact_name || null

  const candidateName = (link.candidat_name || '').trim() || 'Le collaborateur'

  console.log('▶ Étape 2/3 — Résolution destinataires :')
  console.log('  Créateur lien (admin) :', creatorEmail || '(introuvable)')
  console.log('  ADMIN_EMAIL env       :', adminEnvEmail || '(non set)')
  console.log('  Candidat Ismael       :', candidatEmail || '(non set)')
  console.log('  Client Margelisch     :', clientEmail || '(non set)', clientContactName ? `(contact: ${clientContactName})` : '')
  console.log('')

  // ─── 4. Envois (dedup) ───────────────────────────────────────────────
  type T = { audience: 'admin' | 'candidat' | 'client'; to: string }
  const targets: T[] = []
  if (adminEnvEmail) targets.push({ audience: 'admin', to: adminEnvEmail })
  if (creatorEmail && creatorEmail.toLowerCase() !== adminEnvEmail.toLowerCase()) {
    targets.push({ audience: 'admin', to: creatorEmail })
  }
  if (candidatEmail) targets.push({ audience: 'candidat', to: candidatEmail })
  if (clientEmail) targets.push({ audience: 'client', to: clientEmail })

  const seen = new Set<string>()
  console.log('▶ Étape 3/3 — Envoi emails (' + targets.length + ' cibles avant dedup) :')

  for (const t of targets) {
    const key = `${t.audience}:${t.to.toLowerCase()}`
    if (seen.has(key)) {
      console.log('  ⊘ Skip dedup :', t.audience, '→', t.to)
      continue
    }
    seen.add(key)
    try {
      const r = await sendCorrectionEmail({
        to: t.to,
        audience: t.audience,
        candidateName,
        clientName: clientName || 'le client',
        clientContactName,
        fromWeekLabel: correction.fromWeek.label,
        fromWeekNumber: correction.fromWeek.weekNumber,
        toWeekLabel: correction.toWeek.label,
        toWeekNumber: correction.toWeek.weekNumber,
        reason: REASON,
        correctedBy: ACTOR_EMAIL,
        attachments,
      })
      if (r.ok) {
        console.log('  ✓', t.audience.padEnd(8), '→', t.to, '(id:', r.id, ')')
      } else {
        console.log('  ❌', t.audience.padEnd(8), '→', t.to, '— ERR:', r.error)
      }
    } catch (e: any) {
      console.log('  ❌', t.audience.padEnd(8), '→', t.to, '— EXCEPTION:', e?.message || e)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Correction terminée')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  process.exit(0)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
