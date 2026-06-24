// v2.13.24 — Synchronise les dates de mission sur l'entreprise autorisée d'un lien rapport.
//
// Le portail candidat borne les semaines saisissables avec
// `report_link_clients.mission_start_date / mission_end_date`. Quand la mission liée
// change (auto-liaison à la création, liaison manuelle, ou édition des dates de mission),
// ces dates doivent suivre — sinon le candidat se voit proposer les semaines de
// l'ancienne mission (bug récurrent).
//
// Robustesse : si le lien n'a qu'UNE entreprise autorisée, on la met à jour quel que soit
// son libellé (cas courant « 1 candidat = 1 lien = 1 entreprise »). S'il en a plusieurs,
// on ne touche que celle dont le nom correspond au client de la mission.
export async function syncReportClientDates(
  supabase: any,
  linkId: string,
  missionClientNom: string | null,
  dateDebut: string | null,
  dateFin: string | null,
): Promise<void> {
  try {
    const { data: rlcs } = await supabase
      .from('report_link_clients')
      .select('id, client_name')
      .eq('link_id', linkId)
    if (!rlcs || rlcs.length === 0) return

    const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()
    const targets = rlcs.length === 1
      ? rlcs
      : rlcs.filter((c: any) => missionClientNom && norm(c.client_name) === norm(missionClientNom))
    if (targets.length === 0) return

    await supabase
      .from('report_link_clients')
      .update({ mission_start_date: dateDebut ?? null, mission_end_date: dateFin ?? null })
      .in('id', targets.map((c: any) => c.id))
  } catch {
    /* best-effort — ne bloque jamais l'appelant */
  }
}
