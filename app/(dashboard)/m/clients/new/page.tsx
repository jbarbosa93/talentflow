'use client'
// TalentFlow Mobile /m/clients/new — Ajouter une entreprise
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import MHeader from '../../_components/MHeader'
import MClientForm, { ClientFormValues } from '../../_components/MClientForm'

export default function MobileClientNewPage() {
  const router = useRouter()
  const qc = useQueryClient()

  async function create(values: ClientFormValues) {
    const payload = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, (v as string).trim() || null])
    )
    const r = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.error || 'Échec de la création')
    }
    const j = await r.json().catch(() => ({}))
    qc.invalidateQueries({ queryKey: ['m', 'clients'] })
    const newId = j?.client?.id || j?.id
    if (newId) router.replace(`/m/clients/${newId}`)
    else router.replace('/m/clients')
  }

  return (
    <>
      <MHeader title="Nouvelle entreprise" back="/m/clients" />
      <div className="m-content">
        <MClientForm submitLabel="Créer l'entreprise" onSubmit={create} />
      </div>
    </>
  )
}
