import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Strip from "@/components/landing/Strip"
import Features from "@/components/landing/Features"
import Beta from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"
import Particles from "@/components/magicui/particles"
import AuthHashHandler from "@/components/landing/AuthHashHandler"

export default function LandingPage() {
  return (
    <div className="landing-root landing-v2" style={{ background: '#FFFDF5', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <AuthHashHandler />
      {/* v1.9.135 — Décor éclair jaune doux en background (crème) */}
      <div className="landing-v2-glow-tl" aria-hidden />
      <div className="landing-v2-glow-br" aria-hidden />
      <div className="landing-v2-bolt" aria-hidden>
        <svg viewBox="0 0 200 240" fill="none">
          <path d="M120 10 L40 130 H100 L80 230 L160 110 H100 Z" fill="#EAB308" opacity="0.06"/>
        </svg>
      </div>
      <Particles
        className="z-0"
        quantity={50}
        color="#1C1A14"
        size={0.4}
        staticity={60}
        ease={60}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <Hero />
        <Strip />
        <Features />
        <Beta />
        <Footer />
      </div>
    </div>
  )
}
