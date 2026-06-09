'use client'
// TalentFlow Mobile /m/profil — Profil consultant + déconnexion
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Building2, Phone, LogOut, Loader2 } from 'lucide-react'
import MHeader from '../_components/MHeader'

interface UserInfo {
  email: string
  prenom: string
  nom: string
  entreprise: string
  telephone: string
}

export default function MobileProfilPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createClient()
        const { data: { user: u } } = await supabase.auth.getUser()
        const m = (u?.user_metadata || {}) as Record<string, string>
        setUser({
          email: u?.email || '',
          prenom: m.prenom || '',
          nom: m.nom || '',
          entreprise: m.entreprise || '',
          telephone: m.telephone || '',
        })
      } catch { /* ignore */ }
      setLoading(false)
    }
    run()
  }, [])

  async function logout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
      try { await createClient().auth.signOut() } catch { /* ignore */ }
      sessionStorage.removeItem('tf_faceid_ok')
    } finally {
      router.replace('/login')
    }
  }

  const fullName = user ? `${user.prenom} ${user.nom}`.trim() || user.email : ''
  const initials = user
    ? ((user.prenom?.[0] || '') + (user.nom?.[0] || '')).toUpperCase() || (user.email?.[0] || '?').toUpperCase()
    : '?'

  return (
    <>
      <MHeader title="Profil" back="/m" />
      <div className="m-content">
        {/* Logo L-Agence */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 18px' }}>
          <img src="/logo-agence-officiel-noir.png" alt="L-Agence" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
        </div>

        {loading && <div className="m-loading">Chargement...</div>}

        {!loading && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
              <div className="m-avatar lg" style={{ width: 84, height: 84, fontSize: 28 }}>{initials}</div>
              <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>{fullName}</div>
            </div>

            <div className="m-section-title">Mes informations</div>
            <div className="m-info-list">
              {user?.email && (
                <a href={`mailto:${user.email}`} className="m-info-row">
                  <Mail size={18} className="m-info-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Email</div><div className="m-info-val">{user.email}</div></div>
                </a>
              )}
              {user?.telephone && (
                <a href={`tel:${user.telephone}`} className="m-info-row">
                  <Phone size={18} className="m-info-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Téléphone</div><div className="m-info-val">{user.telephone}</div></div>
                </a>
              )}
              {user?.entreprise && (
                <div className="m-info-row">
                  <Building2 size={18} className="m-info-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="m-info-label">Agence</div><div className="m-info-val">{user.entreprise}</div></div>
                </div>
              )}
            </div>

            <button
              onClick={logout}
              disabled={loggingOut}
              className="m-btn full"
              style={{ marginTop: 22, background: '#fff', border: '1px solid #dc2626', color: '#dc2626', fontWeight: 700 }}
            >
              {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              {loggingOut ? 'Déconnexion...' : 'Se déconnecter'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
