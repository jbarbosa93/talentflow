'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Trash2, UserPlus, Mail, Building2, RefreshCw, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface AdminUser {
  id: string
  email: string
  prenom: string
  nom: string
  entreprise: string
  role: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return 'Jamais'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function getInitiales(prenom: string, nom: string, email: string) {
  if (prenom && nom) return `${prenom[0]}${nom[0]}`.toUpperCase()
  if (prenom) return prenom[0].toUpperCase()
  return email[0]?.toUpperCase() || '?'
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'Admin'
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 100,
      background: isAdmin ? '#FEF3C7' : '#EFF6FF',
      color: isAdmin ? '#92400E' : '#1E40AF',
      border: `1px solid ${isAdmin ? '#FDE68A' : '#BFDBFE'}`,
      whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  )
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    prenom: '',
    nom: '',
    role: 'Consultant',
    entreprise: '',
  })
  const [inviteError, setInviteError] = useState<string | null>(null)

  const { data: users = [], isLoading, error, refetch } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const body = await res.json()
          throw new Error(body.error || 'Erreur serveur')
        }
        throw new Error(res.status === 401 || res.status === 403 ? 'Session expirée — rechargez la page' : `Erreur ${res.status}`)
      }
      return res.json()
    },
    retry: 1,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Erreur lors de la suppression')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setConfirmDelete(null)
      toast.success('Utilisateur supprimé')
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmDelete(null)
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors de l\'invitation')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(`Invitation envoyée à ${inviteForm.email}`)
      setInviteForm({ email: '', prenom: '', nom: '', role: 'Consultant', entreprise: '' })
      setInviteError(null)
    },
    onError: (err: Error) => {
      setInviteError(err.message)
    },
  })

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError(null)
    if (!inviteForm.email) {
      setInviteError('L\'email est requis')
      return
    }
    inviteMutation.mutate()
  }

  if (error) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          background: '#FEF2F2',
          border: '1.5px solid #FECACA',
          borderRadius: 12,
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <AlertTriangle size={20} style={{ color: '#DC2626', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#7F1D1D', margin: 0 }}>Erreur d&apos;accès</p>
            <p style={{ fontSize: 13, color: '#991B1B', marginTop: 4 }}>
              {error instanceof Error ? error.message : 'Erreur lors du chargement des utilisateurs.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 style={{
              fontSize: 24, fontWeight: 900, color: 'var(--foreground)',
              letterSpacing: '-0.5px', margin: 0,
            }}>
              Administration
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100,
              background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Shield size={10} />
                Admin
              </span>
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            Gérez les accès et les utilisateurs de votre plateforme
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            background: 'none', border: '1.5px solid var(--border)', cursor: 'pointer',
            color: 'var(--muted)', padding: '8px 10px', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          title="Rafraîchir"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Section utilisateurs actifs */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12,
        }}>
          Utilisateurs actifs ({users.length})
        </h2>

        <div style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {isLoading ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Chargement des utilisateurs...
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Aucun utilisateur trouvé
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Utilisateur', 'Rôle', 'Entreprise', 'Dernière connexion', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '0.4px',
                      background: '#F8FAFC',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => {
                  const isLast = i === users.length - 1
                  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ') || user.email?.split('@')[0] || '—'
                  const initiales = getInitiales(user.prenom, user.nom, user.email || '')

                  return (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: isLast ? 'none' : '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--secondary)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Avatar + Nom + Email */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
                              {fullName}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Mail size={10} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user.email}
                              </span>
                              {!user.email_confirmed_at && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100,
                                  background: '#FFF3C4', color: '#7A5F00', border: '1px solid #F7C948',
                                  flexShrink: 0,
                                }}>
                                  Non confirmé
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Rôle */}
                      <td style={{ padding: '12px 16px' }}>
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Entreprise */}
                      <td style={{ padding: '12px 16px' }}>
                        {user.entreprise ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--foreground)' }}>
                            <Building2 size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            {user.entreprise}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                        )}
                      </td>

                      {/* Dernière connexion */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {formatDate(user.last_sign_in_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {confirmDelete === user.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Confirmer ?</span>
                            <button
                              onClick={() => deleteMutation.mutate(user.id)}
                              disabled={deleteMutation.isPending}
                              style={{
                                background: '#DC2626', border: 'none', cursor: 'pointer',
                                color: 'white', padding: '4px 10px', borderRadius: 6,
                                fontSize: 11, fontWeight: 700, transition: 'opacity 0.15s',
                              }}
                            >
                              Oui
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{
                                background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
                                color: 'var(--muted)', padding: '4px 10px', borderRadius: 6,
                                fontSize: 11, fontWeight: 700,
                              }}
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            title="Supprimer l'utilisateur"
                            style={{
                              background: 'none', border: '1px solid transparent', cursor: 'pointer',
                              color: 'var(--muted)', padding: '6px', borderRadius: 6,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.color = '#DC2626'
                              e.currentTarget.style.borderColor = '#FECACA'
                              e.currentTarget.style.background = '#FEF2F2'
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.color = 'var(--muted)'
                              e.currentTarget.style.borderColor = 'transparent'
                              e.currentTarget.style.background = 'none'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section invitation */}
      <section>
        <h2 style={{
          fontSize: 13, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12,
        }}>
          Inviter un utilisateur
        </h2>

        <div style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 12,
          padding: '24px 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: '#FEF3C7', border: '1.5px solid #FDE68A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <UserPlus size={16} style={{ color: '#92400E' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                Envoyer une invitation
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                L&apos;utilisateur recevra un email pour créer son compte
              </p>
            </div>
          </div>

          <form onSubmit={handleInviteSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                  Email *
                </label>
                <Input
                  type="email"
                  placeholder="utilisateur@exemple.com"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  required
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                  Rôle
                </label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 14,
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="Consultant">Consultant</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                  Prénom
                </label>
                <Input
                  placeholder="Prénom"
                  value={inviteForm.prenom}
                  onChange={e => setInviteForm(f => ({ ...f, prenom: e.target.value }))}
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                  Nom
                </label>
                <Input
                  placeholder="Nom de famille"
                  value={inviteForm.nom}
                  onChange={e => setInviteForm(f => ({ ...f, nom: e.target.value }))}
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                Entreprise
              </label>
              <Input
                placeholder="Nom de l'entreprise (optionnel)"
                value={inviteForm.entreprise}
                onChange={e => setInviteForm(f => ({ ...f, entreprise: e.target.value }))}
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
              />
            </div>

            {inviteError && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertTriangle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#DC2626' }}>{inviteError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                disabled={inviteMutation.isPending}
                size="sm"
              >
                <UserPlus className="w-3.5 h-3.5 mr-2" />
                {inviteMutation.isPending ? 'Envoi en cours...' : 'Envoyer l\'invitation'}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
