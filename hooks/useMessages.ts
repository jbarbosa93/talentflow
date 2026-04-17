import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useEmailTemplates(type?: 'email' | 'sms') {
  return useQuery({
    queryKey: ['email-templates', type || 'all'],
    queryFn: async () => {
      const url = type ? `/api/email-templates?type=${type}` : '/api/email-templates'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.templates as any[]
    },
    staleTime: 60_000,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.template
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success('Template créé')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSendEmail() {
  return useMutation({
    mutationFn: async (body: {
      candidat_id?: string
      candidat_ids?: string[]
      destinataire?: string
      destinataires?: string[]
      sujet: string
      corps: string
      use_bcc?: boolean
    }) => {
      const res = await fetch('/api/microsoft/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => toast.success(data.count > 1 ? `Email envoyé à ${data.count} destinataires (CCI)` : 'Email envoyé'),
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  })
}

export function useSyncMicrosoft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/onedrive/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['onedrive-fichiers'] })
      toast.success(`Sync terminé : ${data.processed} nouveau${data.processed > 1 ? 'x' : ''} candidat${data.processed > 1 ? 's' : ''} importé${data.processed > 1 ? 's' : ''}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
