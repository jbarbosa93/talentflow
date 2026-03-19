import { redirect } from 'next/navigation'

// Les inscriptions publiques sont désactivées.
// Les personnes intéressées doivent faire une demande d'accès.
export default function RegisterPage() {
  redirect('/demande-acces')
}
