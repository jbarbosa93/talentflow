// One-shot — Répare les dates auto-fill d'Ismael (S20→S19 déjà fait, mais
//             field_values étaient figées à S20). Recalcule + regen PDF + re-envoie emails.
// v2.6.17 — Usage : npx tsx scripts/one-shot/fix-ismael-dates.ts

import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
config({ path: path.join(projectRoot, '.env.local') })

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { recomputeAutoFillDates } = await import('@/lib/report/correct-week')
  const { generateReportPdf } = await import('@/lib/report/pdf-generator')
  const { getWeekDates } = await import('@/lib/report/week-helpers')
  const { sendCorrectionEmail } = await import('@/lib/report/send-notifications')
  const { logReportAudit } = await import('@/lib/report/audit')

  const SUBMISSION_ID = '34a08da1-3429-4324-b628-0c5492d57d6a'
  const REASON = 'Le rapport a été déclaré par erreur en semaine 20 alors qu\'il concerne la semaine 19. Correction du numéro de semaine et des dates affichées sans modification des heures déclarées. (Cet envoi remplace le précédent dont les dates par jour n\'avaient pas été mises à jour.)'
  const ACTOR_EMAIL = process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch'

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔧 Réparation dates field_values + regen + re-envoi')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const supabase = createAdminClient()

  // 1. Submission + link
  const { data: subData } = await (supabase as any)
    .from('report_submissions').select('*').eq('id', SUBMISSION_ID).maybeSingle()
  if (!subData) throw new Error('Submission introuvable')
  const submission = subData as any

  console.log('week_start actuel    :', submission.week_start)
  console.log('field_values dates AVANT  :', Object.entries(submission.field_values).filter(([_, v]) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v as string)))

  const { data: linkData } = await (supabase as any)
    .from('report_links').select('*').eq('id', submission.link_id).maybeSingle()
  if (!linkData) throw new Error('Link introuvable')
  const link = linkData as any

  // 2. Template fields
  const { data: tpl } = await (supabase as any)
    .from('sign_templates').select('documents').eq('id', link.template_id).maybeSingle()
  const allFields: any[] = []
  for (const d of (tpl?.documents || [])) {
    if (Array.isArray(d.fields)) allFields.push(...d.fields)
  }

  // 3. Recalcul field_values
  const newFieldValues = recomputeAutoFillDates(submission.field_values || {}, allFields, submission.week_start)
  const datesAfter = Object.entries(newFieldValues).filter(([_, v]) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v as string))
  console.log('field_values dates APRÈS  :', datesAfter)

  // 4. UPDATE
  const { error: updErr } = await (supabase as any)
    .from('report_submissions')
    .update({ field_values: newFieldValues, updated_at: new Date().toISOString() })
    .eq('id', SUBMISSION_ID)
  if (updErr) throw updErr
  console.log('✓ field_values mis à jour en DB')

  // 5. Récupère candidat lié
  let candidat: any = null
  if (link.candidat_id) {
    const { data: candData } = await (supabase as any)
      .from('candidats').select('prenom, nom, email').eq('id', link.candidat_id).maybeSingle()
    if (candData) candidat = candData
  }

  // 6. Regen PDF
  const updatedSub = { ...submission, field_values: newFieldValues } as any
  console.log('▶ Régénération PDFs…')
  const newPdfs = await generateReportPdf({ link, submission: updatedSub, candidat })
  console.log('✓ PDFs régénérés :', newPdfs.length)
  newPdfs.forEach(p => console.log('  ·', p.name))

  // 7. Préparation envoi
  const attachments = newPdfs.filter(d => !/certificat/i.test(d.name))
    .map(d => ({ filename: d.name, content: d.pdfBase64 }))

  const adminEnvEmail = (process.env.ADMIN_EMAIL || '').trim()
  let creatorEmail = ''
  if (link.created_by) {
    try {
      const { data: creatorUser } = await supabase.auth.admin.getUserById(link.created_by)
      creatorEmail = (creatorUser?.user?.email || '').trim()
    } catch {}
  }
  const candidatEmail = (link.candidat_email || '').trim()
  let clientEmail = ''
  let clientContactName: string | null = null
  let clientName = (link.client_name || '').trim()
  if (submission.report_link_client_id) {
    const { data: rlc } = await (supabase as any)
      .from('report_link_clients').select('client_email, client_contact_name, client_name')
      .eq('id', submission.report_link_client_id).maybeSingle()
    if (rlc) {
      clientEmail = (rlc.client_email || '').trim()
      clientContactName = rlc.client_contact_name || null
      clientName = rlc.client_name || clientName
    }
  }
  if (!clientEmail) clientEmail = (link.client_email || '').trim()
  if (!clientContactName) clientContactName = link.client_contact_name || null

  const fromWeekFigured = getWeekDates('2026-05-11')
  const toWeekActual = getWeekDates(submission.week_start)
  const candidateName = (link.candidat_name || '').trim() || 'Le collaborateur'

  console.log('▶ Envoi 3 emails correctifs…')
  type T = { audience: 'admin' | 'candidat' | 'client'; to: string }
  const targets: T[] = []
  if (adminEnvEmail) targets.push({ audience: 'admin', to: adminEnvEmail })
  if (creatorEmail && creatorEmail.toLowerCase() !== adminEnvEmail.toLowerCase()) {
    targets.push({ audience: 'admin', to: creatorEmail })
  }
  if (candidatEmail) targets.push({ audience: 'candidat', to: candidatEmail })
  if (clientEmail) targets.push({ audience: 'client', to: clientEmail })

  const seen = new Set<string>()
  for (const t of targets) {
    const key = `${t.audience}:${t.to.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const r = await sendCorrectionEmail({
        to: t.to,
        audience: t.audience,
        candidateName,
        clientName: clientName || 'le client',
        clientContactName,
        fromWeekLabel: fromWeekFigured.label,
        fromWeekNumber: fromWeekFigured.weekNumber,
        toWeekLabel: toWeekActual.label,
        toWeekNumber: toWeekActual.weekNumber,
        reason: REASON,
        correctedBy: ACTOR_EMAIL,
        attachments,
      })
      console.log('  ' + (r.ok ? '✓' : '❌'), t.audience.padEnd(8), '→', t.to, r.error || `(id: ${r.id})`)
    } catch (e: any) {
      console.log('  ❌', t.audience.padEnd(8), '→', t.to, '— EXCEPTION:', e?.message || e)
    }
  }

  await logReportAudit({
    submissionId: SUBMISSION_ID,
    action: 'week_corrected',
    actorEmail: ACTOR_EMAIL,
    ip: 'one-shot-fix-dates',
    metadata: { fix: 'recompute_field_values_autofill_dates', reason: 'PDF précédent avait header S19 mais dates par jour S20 (field_values pas recalculé)' },
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Fix terminé')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  process.exit(0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
