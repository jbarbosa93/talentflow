import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Strip from "@/components/landing/Strip"
import Features from "@/components/landing/Features"
import Pricing from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"

export default function LandingPage() {
  return (
    <div className="landing-root landing-v2" style={{ background: '#FFFDF5', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* v1.9.135 — Décor éclair jaune doux en background */}
      <div className="landing-v2-glow-tl" aria-hidden />
      <div className="landing-v2-glow-br" aria-hidden />
      <div className="landing-v2-bolt" aria-hidden>
        <svg viewBox="0 0 200 240" fill="none">
          <path d="M120 10 L40 130 H100 L80 230 L160 110 H100 Z" fill="#EAB308" opacity="0.06"/>
        </svg>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <Hero />
        <Strip />
        <Features />
        <Pricing />
        <Footer />
      </div>
    </div>
  )
}
