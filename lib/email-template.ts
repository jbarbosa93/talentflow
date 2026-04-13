// lib/email-template.ts — Template HTML partagé pour les emails TalentFlow

export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TalentFlow</title>
</head>
<body style="margin:0;padding:0;background:#F2EDE4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2EDE4;padding:48px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- LOGO HEADER -->
        <tr>
          <td style="background:#1C1A14;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center">
            <table cellpadding="0" cellspacing="0" align="center">
              <tr>
                <td style="width:38px;height:38px;text-align:center;vertical-align:middle">
                  <img src="https://www.talent-flow.ch/email-logo.png" width="38" height="38" alt="⚡" style="display:block;border-radius:10px" />
                </td>
                <td style="padding-left:12px">
                  <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.3px">TalentFlow</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENU -->
        <tr>
          <td style="background:#FFFFFF;padding:40px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
            <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:1.6">
              © 2026 TalentFlow · L-Agence SA<br>
              Ce message est confidentiel et destiné uniquement à son destinataire.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function emailOtpHtml(otp: string): string {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Code de connexion
    </h2>
    <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6">
      Entrez ce code dans l'application pour finaliser votre connexion à TalentFlow.
    </p>

    <!-- Code block -->
    <div style="background:#F9F5EE;border:2px solid #F5A623;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px">
      <span style="font-size:44px;font-weight:800;letter-spacing:14px;font-family:'Courier New',Courier,monospace;color:#1C1A14;display:block;line-height:1">${otp}</span>
    </div>

    <div style="background:#FEF9EC;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-bottom:0">
      <p style="margin:0;color:#92400E;font-size:13px;line-height:1.5">
        ⏱ Ce code expire dans <strong>10 minutes</strong>. Ne le partagez avec personne.
      </p>
    </div>
  `)
}

export function emailResetPasswordHtml(resetLink: string): string {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Réinitialisation du mot de passe
    </h2>
    <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6">
      Vous avez demandé à réinitialiser votre mot de passe TalentFlow. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
    </p>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="${resetLink}"
        style="display:inline-block;background:#F5A623;color:#1C1A14;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.1px">
        Réinitialiser mon mot de passe →
      </a>
    </div>

    <!-- Fallback link -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0 0 6px;color:#6B7280;font-size:12px">Si le bouton ne fonctionne pas, copiez ce lien :</p>
      <p style="margin:0;word-break:break-all;font-size:11px;color:#9CA3AF">${resetLink}</p>
    </div>

    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px">
      <p style="margin:0;color:#991B1B;font-size:13px;line-height:1.5">
        ⚠️ Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
      </p>
    </div>
  `)
}

export function emailInvitationHtml(inviteLink: string, prenom: string): string {
  const prenomDisplay = prenom ? ` ${prenom}` : ''
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Bienvenue sur TalentFlow${prenomDisplay} !
    </h2>
    <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6">
      Vous avez été invité(e) à rejoindre TalentFlow, la plateforme de gestion du recrutement de L-Agence.<br>
      Cliquez sur le bouton ci-dessous pour créer votre compte.
    </p>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="${inviteLink}"
        style="display:inline-block;background:#F5A623;color:#1C1A14;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.1px">
        Créer mon compte →
      </a>
    </div>

    <!-- Fallback link -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0 0 6px;color:#6B7280;font-size:12px">Si le bouton ne fonctionne pas, copiez ce lien :</p>
      <p style="margin:0;word-break:break-all;font-size:11px;color:#9CA3AF">${inviteLink}</p>
    </div>

    <div style="background:#FEF9EC;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px">
      <p style="margin:0;color:#92400E;font-size:13px;line-height:1.5">
        ⏱ Ce lien est valable <strong>24 heures</strong>. Si vous n'attendiez pas cette invitation, ignorez cet email.
      </p>
    </div>
  `)
}

export function emailWelcomeHtml(prenom: string): string {
  const prenomDisplay = prenom ? ` ${prenom}` : ''
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Compte activé${prenomDisplay} !
    </h2>
    <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6">
      Votre compte TalentFlow a été créé avec succès. Vous pouvez maintenant vous connecter et commencer à utiliser la plateforme.
    </p>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="https://www.talent-flow.ch/dashboard"
        style="display:inline-block;background:#F5A623;color:#1C1A14;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.1px">
        Accéder au dashboard →
      </a>
    </div>

    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:14px 16px">
      <p style="margin:0;color:#065F46;font-size:13px;line-height:1.5">
        ✅ Bienvenue dans l'équipe ! Si vous avez des questions, contactez votre administrateur.
      </p>
    </div>
  `)
}

export function emailPasswordChangedHtml(): string {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px">
      Mot de passe modifié
    </h2>
    <p style="margin:0 0 28px;color:#6B7280;font-size:15px;line-height:1.6">
      Votre mot de passe TalentFlow a été modifié avec succès. Vous pouvez maintenant vous connecter avec vos nouveaux identifiants.
    </p>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="https://www.talent-flow.ch/login"
        style="display:inline-block;background:#F5A623;color:#1C1A14;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.1px">
        Se connecter →
      </a>
    </div>

    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:14px 16px">
      <p style="margin:0;color:#065F46;font-size:13px;line-height:1.5">
        ✅ Si vous n'avez pas effectué cette modification, contactez immédiatement votre administrateur.
      </p>
    </div>
  `)
}
