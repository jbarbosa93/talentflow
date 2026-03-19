import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#FFFDF5',
      fontFamily: 'var(--font-body, "Nunito", sans-serif)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '24px 48px', borderBottom: '3px solid #1C1A14',
        background: '#FFFDF5',
      }}>
        <div style={{
          fontFamily: '"Fraunces", serif', fontWeight: 700, fontSize: 22,
          color: '#1C1A14', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#F7C948', display: 'inline-block', border: '2px solid #1C1A14',
          }}/>
          TalentFlow
        </div>
        <Link href="/login" style={{
          background: '#F7C948', color: '#1C1A14', fontWeight: 700, fontSize: 14,
          padding: '10px 20px', border: '2.5px solid #1C1A14',
          boxShadow: '3px 3px 0 #1C1A14', textDecoration: 'none',
          borderRadius: 8, transition: 'all 0.15s',
        }}>
          Se connecter
        </Link>
      </nav>

      {/* Hero */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 48px', textAlign: 'center',
      }}>
        <div style={{
          background: '#F7C948', color: '#1C1A14', fontWeight: 700, fontSize: 12,
          padding: '6px 14px', border: '2px solid #1C1A14', borderRadius: 6,
          marginBottom: 24, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          ATS · Applicant Tracking System
        </div>

        <h1 style={{
          fontFamily: '"Fraunces", serif', fontSize: 'clamp(36px, 6vw, 72px)',
          fontWeight: 700, color: '#1C1A14', lineHeight: 1.1,
          maxWidth: 800, marginBottom: 24,
        }}>
          Le CRM Recrutement<br />
          <span style={{ color: '#F7C948', WebkitTextStroke: '2px #1C1A14' }}>
            pour les agences
          </span>
        </h1>

        <p style={{
          fontSize: 18, color: '#5C5840', maxWidth: 520,
          lineHeight: 1.7, marginBottom: 48,
        }}>
          Gérez vos candidats, offres et entretiens en un seul endroit.
          Analyse IA des CVs, matching automatique et pipeline visuel.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/login" style={{
            background: '#F7C948', color: '#1C1A14', fontWeight: 800, fontSize: 16,
            padding: '16px 36px', border: '3px solid #1C1A14',
            boxShadow: '5px 5px 0 #1C1A14', textDecoration: 'none',
            borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            Espace recruteurs →
          </Link>
          <Link href="/register" style={{
            background: 'transparent', color: '#1C1A14', fontWeight: 700, fontSize: 16,
            padding: '16px 36px', border: '3px solid #1C1A14',
            boxShadow: '5px 5px 0 #1C1A14', textDecoration: 'none',
            borderRadius: 12,
          }}>
            Créer un compte
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px 48px', borderTop: '2px solid #E8E0C8',
        textAlign: 'center', fontSize: 13, color: '#9E9580',
      }}>
        © 2026 TalentFlow · Tous droits réservés
      </footer>
    </div>
  )
}
