// TalentFlow Sign — Modal de consentement CGU + signature électronique
// v2.2.0 — Phase 3
//
// Affiché AU PREMIER ACCÈS au lien /sign/v/{token} (avant le viewer).
// Bloque la consultation/signature tant que la checkbox CGU n'est pas cochée.
// Pattern DocuSign : "Vérifier et poursuivre" — récap + checkbox + bouton "Commencer".
//
// Conforme :
// - ZertES (RS 943.03) — signature électronique simple suisse
// - nLPD — protection des données suisses
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, X, FileSignature, ExternalLink, Mail, User } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  token: string
  senderName: string                  // ex: "L-Agence SA"
  recipientName: string                // ex: "Joao Barbosa"
  recipientEmail: string
  envelopeTitle: string
  isCC?: boolean                       // si role=Copie, label adapté ("consulter" au lieu de "signer")
  onAccepted: () => void
  onClose?: () => void                 // optionnel — sinon le modal est bloquant
}

export default function ConsentModal({
  open, token, senderName, recipientName, recipientEmail, envelopeTitle, isCC, onAccepted, onClose,
}: Props) {
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showFullTerms, setShowFullTerms] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) {
      setAccepted(false)
      setShowFullTerms(false)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!accepted || submitting) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/sign/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await r.json()
      if (!r.ok || !data.ok) {
        throw new Error(data.error || 'Erreur')
      }
      onAccepted()
    } catch (e: any) {
      toast.error(e.message || 'Erreur — réessayez')
      setSubmitting(false)
    }
  }

  if (!open || !mounted) return null

  const action = isCC ? 'consulter' : 'signer'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: '#FEF3C7', border: '1px solid rgba(234,179,8,0.25)',
            color: '#A16207',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <FileSignature size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A16207' }}>
              Vérifier et poursuivre
            </div>
            <h1 style={{
              margin: 0, marginTop: 2,
              fontSize: 17, fontWeight: 700, color: '#1C1A14', lineHeight: 1.2,
            }}>
              Avant de {action} ce document
            </h1>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '18px 22px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <p style={pStyle}>
            <strong>{senderName}</strong> vous invite à {action} le document :
          </p>
          <div style={{
            padding: '10px 12px',
            background: '#FAFAF7',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: '#1C1A14',
          }}>
            {envelopeTitle}
          </div>

          {/* Identité */}
          <div style={{
            padding: '12px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 8,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#0369A1' }}>
              Vous êtes identifié comme
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1C1A14' }}>
              <User size={13} style={{ color: '#0369A1' }} />
              <strong>{recipientName}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
              <Mail size={12} style={{ color: '#0369A1' }} />
              {recipientEmail}
            </div>
          </div>

          {/* Conditions inline */}
          <div style={{
            padding: '12px',
            background: '#FAFAF7',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            fontSize: 12.5, color: '#374151', lineHeight: 1.55,
          }}>
            <div style={{ fontWeight: 700, color: '#1C1A14', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} style={{ color: '#15803D' }} />
              Signature électronique
            </div>
            <p style={{ margin: '0 0 6px 0' }}>
              En cliquant sur <strong>Commencer</strong>, vous acceptez :
            </p>
            <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12.5, lineHeight: 1.6 }}>
              <li>De {action} ce document <strong>par voie électronique</strong>.</li>
              <li>
                Que votre signature électronique ait la <strong>même valeur juridique qu&apos;une signature manuscrite</strong>,
                conformément à la loi suisse sur la signature électronique (<strong>ZertES</strong>).
              </li>
              <li>
                Que les informations techniques (date, heure, IP, navigateur) soient enregistrées comme preuve légale.
              </li>
              <li>
                Que vos données soient traitées conformément à la <strong>nLPD</strong> (protection suisse des données).
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setShowFullTerms(true)}
              style={{
                marginTop: 8,
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: '#0369A1',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              Lire les conditions complètes
              <ExternalLink size={11} />
            </button>
          </div>

          {/* Checkbox obligatoire */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px',
            border: `1.5px solid ${accepted ? '#15803D' : '#E5E7EB'}`,
            borderRadius: 8,
            background: accepted ? '#F0FDF4' : '#fff',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              style={{
                marginTop: 2, flexShrink: 0,
                width: 16, height: 16,
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: 12.5, color: '#1C1A14', lineHeight: 1.55 }}>
              <strong>J&apos;accepte les conditions d&apos;utilisation</strong> et reconnais que ma signature
              électronique a la même valeur juridique qu&apos;une signature manuscrite (ZertES).
            </span>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #E5E7EB',
          background: '#FAFAF7',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!accepted || submitting}
            style={{
              padding: '12px 24px',
              fontSize: 14, fontWeight: 700,
              border: '1px solid #1C1A14',
              borderRadius: 10,
              background: accepted ? '#EAB308' : '#E5E7EB',
              color: accepted ? '#1C1A14' : '#9CA3AF',
              cursor: accepted && !submitting ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Validation...' : 'Commencer →'}
          </button>
        </div>
      </div>

      {/* Sub-modal : CGU complètes scrollables */}
      {showFullTerms && (
        <FullTermsModal onClose={() => setShowFullTerms(false)} senderName={senderName} />
      )}
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────
// FullTermsModal — sub-modal scrollable avec le texte juridique complet
// ─────────────────────────────────────────────────────────────────
function FullTermsModal({ onClose, senderName }: { onClose: () => void; senderName: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001, // au-dessus du ConsentModal
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1A14' }}>
            Conditions d&apos;utilisation — Signature électronique
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB', background: '#fff',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '18px 22px',
          fontSize: 13, lineHeight: 1.65, color: '#374151',
        }}>
          <p style={{ marginTop: 0 }}>
            <em>Version 1.0 · {new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}</em>
          </p>

          <h3 style={h3Style}>1. Objet</h3>
          <p>
            Les présentes conditions régissent l&apos;utilisation du service <strong>TalentFlow Sign</strong>,
            opéré pour le compte de <strong>{senderName}</strong>, permettant la signature électronique de documents
            entre destinataires identifiés.
          </p>

          <h3 style={h3Style}>2. Définitions</h3>
          <ul>
            <li><strong>Signature électronique simple (SES)</strong> : signature au sens de l&apos;art. 2 let. a de la
              Loi fédérale sur la signature électronique (ZertES, RS 943.03).</li>
            <li><strong>Document électronique</strong> : fichier PDF affiché et signé via TalentFlow Sign.</li>
            <li><strong>Destinataire / signataire</strong> : personne physique identifiée par nom et adresse email,
              recevant un lien de signature unique.</li>
          </ul>

          <h3 style={h3Style}>3. Consentement à la signature électronique</h3>
          <p>
            En cochant la case d&apos;acceptation et en cliquant sur « Commencer », le signataire reconnaît expressément :
          </p>
          <ul>
            <li>
              Que sa signature électronique apposée via le présent service a la <strong>même valeur juridique
              qu&apos;une signature manuscrite</strong>, conformément à la ZertES, pour les documents non soumis à
              une forme qualifiée par la loi (par ex. testament, acte authentique).
            </li>
            <li>
              Qu&apos;il consent à recevoir et examiner le document <strong>par voie électronique uniquement</strong>.
            </li>
            <li>
              Qu&apos;il a la possibilité, avant de signer, de télécharger une copie du document et de demander une
              version papier auprès de l&apos;expéditeur.
            </li>
          </ul>

          <h3 style={h3Style}>4. Identification</h3>
          <p>
            Le signataire est identifié par les informations suivantes, fournies par l&apos;expéditeur et que le
            signataire confirme exactes :
          </p>
          <ul>
            <li>Nom et prénom</li>
            <li>Adresse email professionnelle ou personnelle</li>
            <li>
              Lien unique reçu par email contenant un jeton (token) à usage unique avec date d&apos;expiration
            </li>
          </ul>
          <p>
            Le signataire s&apos;engage à ne pas partager ce lien avec un tiers et à signer personnellement.
          </p>

          <h3 style={h3Style}>5. Preuve juridique et journal d&apos;audit</h3>
          <p>
            À chaque action significative (consultation, acceptation des conditions, signature), TalentFlow Sign
            enregistre dans un <strong>journal d&apos;audit immuable</strong> :
          </p>
          <ul>
            <li>Date et heure (UTC)</li>
            <li>Adresse IP et user-agent du navigateur</li>
            <li>Identifiant unique du destinataire</li>
            <li>Hash cryptographique du document signé (intégrité)</li>
          </ul>
          <p>
            Ce journal est conservé pendant <strong>10 ans</strong> et constitue la preuve juridique de la
            signature en cas de litige.
          </p>

          <h3 style={h3Style}>6. Conservation du document signé</h3>
          <p>
            Le document signé est conservé sous forme électronique pendant <strong>10 ans</strong> à compter de la
            date de signature, dans une infrastructure sécurisée hébergée en Europe. Une copie est envoyée par
            email à chaque signataire et destinataire en copie après signature complète.
          </p>

          <h3 style={h3Style}>7. Retrait du consentement</h3>
          <p>
            Le signataire peut retirer son consentement <strong>à tout moment avant la signature</strong> en fermant
            simplement le navigateur ou en contactant l&apos;expéditeur. Une fois la signature apposée, elle est
            définitive et ne peut être révoquée unilatéralement.
          </p>

          <h3 style={h3Style}>8. Compatibilité technique</h3>
          <p>
            Le service requiert un navigateur récent (Chrome, Firefox, Safari, Edge — version sortie dans les 12
            derniers mois) et une connexion internet stable. Le signataire confirme disposer de cet équipement.
          </p>

          <h3 style={h3Style}>9. Protection des données (nLPD)</h3>
          <p>
            Conformément à la nouvelle loi fédérale sur la protection des données (nLPD, RS 235.1), le signataire
            dispose des droits suivants sur ses données personnelles :
          </p>
          <ul>
            <li>Droit d&apos;accès aux données collectées</li>
            <li>Droit de rectification</li>
            <li>Droit d&apos;effacement (sous réserve des obligations légales de conservation)</li>
            <li>Droit à la portabilité</li>
          </ul>
          <p>
            Pour exercer ces droits, contactez l&apos;expéditeur ({senderName}) ou écrivez à
            <a href="mailto:contact@talent-flow.ch" style={linkStyle}> contact@talent-flow.ch</a>.
          </p>

          <h3 style={h3Style}>10. Limitations</h3>
          <p>
            La signature électronique simple n&apos;est <strong>pas équivalente</strong> à une signature
            manuscrite pour les documents soumis à une forme qualifiée par la loi (testament, acte authentique
            notarié, contrat de mariage, etc.). Pour ces documents, une signature électronique qualifiée (SEQ) ou
            manuscrite est requise.
          </p>

          <h3 style={h3Style}>11. Responsabilité</h3>
          <p>
            <strong>{senderName}</strong> est mandataire et responsable du contenu juridique des documents envoyés.
            <strong>TalentFlow Sign</strong> est l&apos;opérateur technique de la plateforme et garantit la
            sécurité de la transmission, du stockage et de la traçabilité.
          </p>

          <h3 style={h3Style}>12. Droit applicable et for</h3>
          <p>
            Les présentes conditions sont soumises au <strong>droit suisse</strong>. Tout litige relatif à leur
            interprétation ou application sera de la compétence exclusive des tribunaux du canton du <strong>Valais</strong>,
            sous réserve de recours au Tribunal fédéral.
          </p>

          <p style={{ marginTop: 24, fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
            Document généré par TalentFlow Sign · Version 1.0 · L-Agence SA, Monthey, Suisse
          </p>
        </div>

        <div style={{
          padding: '12px 22px', borderTop: '1px solid #E5E7EB',
          background: '#FAFAF7',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14',
              borderRadius: 8, background: '#fff',
              color: '#1C1A14', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            J&apos;ai lu
          </button>
        </div>
      </div>
    </div>
  )
}

const pStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: '#1C1A14',
  lineHeight: 1.55,
}

const h3Style: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#1C1A14',
  marginTop: 18,
  marginBottom: 6,
}

const linkStyle: React.CSSProperties = {
  color: '#0369A1',
  textDecoration: 'underline',
}
