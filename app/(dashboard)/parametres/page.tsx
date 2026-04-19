import { redirect } from 'next/navigation'

// /parametres → redirige vers /parametres/profil (page complète par défaut).
// Avant v1.9.51 : landing page avec onglet "Apparence" par défaut → incohérent.
// La section Apparence (toggle dark/light) est déjà dans la TopBar.
// La config métiers reste accessible via son URL directe si besoin.
export default function ParametresIndexPage() {
  redirect('/parametres/profil')
}
