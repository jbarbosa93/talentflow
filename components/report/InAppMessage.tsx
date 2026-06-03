'use client'

// TalentFlow — Message riche affiché DANS l'app candidat (modal + animation).
// v2.10.26 — Au chargement du portail (ou ouverture depuis une notif), récupère le
// dernier message non vu du candidat connecté → affiche un modal centré (titre +
// texte + image optionnelle) avec une animation festive (confetti, cœurs, feux
// d'artifice, neige, étoiles). « OK » marque comme vu. Public, silencieux si rien.

import { useEffect, useRef, useState } from 'react'

// Précharge canvas-confetti UNE fois (mis en cache au niveau module). On lance le
// téléchargement dès le montage, en parallèle du fetch du message → le module est
// prêt quand le modal s'affiche (sinon les confettis arrivaient en retard, le temps
// de télécharger le chunk au moment de l'animation).
let confettiPromise: Promise<any> | null = null
function loadConfetti(): Promise<any> {
  if (!confettiPromise) {
    confettiPromise = import('canvas-confetti').then(m => m.default).catch(() => null)
  }
  return confettiPromise
}

interface InApp {
  id: string
  title: string
  body: string
  image_url: string | null
  animation: string
}

export default function InAppMessage() {
  const [msg, setMsg] = useState<InApp | null>(null)
  const [closing, setClosing] = useState(false)
  const animatedIdRef = useRef<string | null>(null)
  const msgRef = useRef<InApp | null>(null)
  msgRef.current = msg

  // Vérifie s'il y a un message non vu. Ne remplace pas un modal déjà affiché.
  // Appelé : au montage, périodiquement (app ouverte), et quand l'app revient au
  // premier plan (tap sur la notif → l'app reprend sans recharger la page).
  useEffect(() => {
    let active = true
    loadConfetti()  // précharge l'animation en parallèle → prête à l'affichage

    async function check() {
      if (msgRef.current) return  // un modal est déjà affiché
      try {
        const r = await fetch('/api/push/inapp')
        const d = await r.json()
        if (active && d.message && !msgRef.current) setMsg(d.message)
      } catch { /* noop */ }
    }

    check()
    const interval = setInterval(check, 25000)  // re-check toutes les 25 s tant que l'app est ouverte
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      active = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // Lance l'animation une fois par message affiché.
  useEffect(() => {
    if (!msg || animatedIdRef.current === msg.id) return
    animatedIdRef.current = msg.id
    runAnimation(msg.animation)
  }, [msg])

  function dismiss() {
    if (!msg) return
    setClosing(true)
    fetch('/api/push/inapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg.id }),
    }).catch(() => {})
    setTimeout(() => setMsg(null), 200)
  }

  if (!msg) return null

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99990,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        opacity: closing ? 0 : 1, transition: 'opacity 0.2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, 94vw)', background: '#fff', borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          transform: closing ? 'scale(0.95)' : 'scale(1)', transition: 'transform 0.2s',
          animation: 'tfPop 0.32s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {msg.image_url && (
          <img src={msg.image_url} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '24px 24px 22px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#1C1A14', lineHeight: 1.25 }}>{msg.title}</h2>
          <p style={{ margin: '0 0 22px', fontSize: 15.5, lineHeight: 1.55, color: '#444', whiteSpace: 'pre-wrap' }}>{msg.body}</p>
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: '#EAB308', color: '#1C1A14', fontSize: 16, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Merci ! 🎉
          </button>
        </div>
      </div>
      <style>{`@keyframes tfPop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
}

// ── Animations (canvas-confetti, importé dynamiquement) ──────────────────────
async function runAnimation(type: string) {
  if (!type || type === 'none') return
  const confetti = await loadConfetti()
  if (!confetti) return
  const Z = 100000

  if (type === 'confetti') {
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, zIndex: Z })
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, zIndex: Z }), 180)
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, zIndex: Z }), 180)
    return
  }

  if (type === 'hearts' || type === 'stars') {
    const emoji = type === 'hearts' ? '❤️' : '⭐'
    let shapes: any = undefined
    try { shapes = [confetti.shapeFromText({ text: emoji, scalar: 2.2 })] } catch {}
    const opts: any = { particleCount: 40, spread: 90, origin: { y: 0.55 }, scalar: 2.2, zIndex: Z }
    if (shapes) opts.shapes = shapes
    confetti(opts)
    setTimeout(() => confetti({ ...opts, particleCount: 30, origin: { x: 0.2, y: 0.6 } }), 250)
    setTimeout(() => confetti({ ...opts, particleCount: 30, origin: { x: 0.8, y: 0.6 } }), 450)
    return
  }

  if (type === 'fireworks') {
    const end = 2400
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += 250
      confetti({ particleCount: 50, spread: 360, startVelocity: 30, origin: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.4 }, zIndex: Z })
      if (elapsed >= end) clearInterval(timer)
    }, 250)
    return
  }

  if (type === 'snow') {
    let snowShape: any = undefined
    try { snowShape = [confetti.shapeFromText({ text: '❄️', scalar: 1.6 })] } catch {}
    let ticks = 0  // on compte les ticks (pas de Date.now côté animation)
    const timer = setInterval(() => {
      ticks++
      const opts: any = { particleCount: 3, startVelocity: 0, gravity: 0.4, ticks: 300, spread: 60, origin: { x: Math.random(), y: -0.1 }, scalar: 1.4, zIndex: Z }
      if (snowShape) opts.shapes = snowShape
      confetti(opts)
      if (ticks >= 28) clearInterval(timer) // ~4 s
    }, 140)
    return
  }
}
