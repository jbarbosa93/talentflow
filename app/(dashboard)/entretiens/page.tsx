'use client'
import { useState, useMemo } from 'react'
import {
  Calendar, Clock, Video, MapPin, Phone, Plus, Users, Briefcase,
  CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight,
  CalendarDays, LayoutList, Zap, AlertCircle, ExternalLink
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEntretiens, useCreateEntretien, useUpdateEntretien, useDeleteEntretien } from '@/hooks/useEntretiens'
import { useCandidats } from '@/hooks/useCandidats'
import { useOffres } from '@/hooks/useOffres'
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, addDays,
  format, isSameDay, isToday, isBefore, startOfDay, parseISO
} from 'date-fns'
import { fr } from 'date-fns/locale'

/* ─── Config ─── */
const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  planifie: { label: 'Planifi\u00e9',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: Clock },
  confirme: { label: 'Confirm\u00e9',  color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle },
  annule:   { label: 'Annul\u00e9',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  icon: XCircle },
  complete: { label: 'Termin\u00e9',   color: '#6B7280', bg: 'rgba(107,114,128,0.12)', icon: CheckCircle },
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  visio:      { label: 'Visio',       icon: Video,  color: '#3B82F6' },
  presentiel: { label: 'Pr\u00e9sentiel',  icon: MapPin, color: '#8B5CF6' },
  telephone:  { label: 'T\u00e9l\u00e9phone',  icon: Phone,  color: '#10B981' },
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8h to 19h

/* ─── Helpers ─── */
function getEntretienPosition(dateHeure: string, dureeMinutes: number) {
  const date = new Date(dateHeure)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const top = ((hours - 8) * 60 + minutes) / 60 * 64 // 64px per hour
  const height = Math.max(dureeMinutes / 60 * 64, 28)
  return { top, height }
}

/* ─── Calendar Event Card ─── */
function CalendarEventCard({ entretien, onUpdate, onDelete }: {
  entretien: any
  onUpdate: (data: any) => void
  onDelete: (id: string) => void
}) {
  const typeConf = TYPE_CONFIG[entretien.type] || TYPE_CONFIG.visio
  const TypeIcon = typeConf.icon
  const statutConf = STATUT_CONFIG[entretien.statut] || STATUT_CONFIG.planifie
  const date = new Date(entretien.date_heure)
  const { top, height } = getEntretienPosition(entretien.date_heure, entretien.duree_minutes)
  const isCompact = height < 50
  const isPast = isBefore(date, new Date()) && entretien.statut !== 'planifie' && entretien.statut !== 'confirme'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: 'absolute',
        top, left: 4, right: 4,
        height: Math.max(height - 2, 26),
        background: isPast ? 'var(--secondary)' : `linear-gradient(135deg, ${typeConf.color}15, ${typeConf.color}08)`,
        border: `2px solid ${isPast ? 'var(--border)' : typeConf.color + '40'}`,
        borderLeft: `4px solid ${isPast ? 'var(--muted-foreground)' : typeConf.color}`,
        borderRadius: 10,
        padding: isCompact ? '2px 8px' : '8px 10px',
        cursor: 'pointer',
        overflow: 'hidden',
        opacity: isPast ? 0.5 : 1,
        transition: 'all 0.2s',
        zIndex: 2,
      }}
      whileHover={{ scale: 1.02, zIndex: 10, boxShadow: `0 4px 20px ${typeConf.color}30` }}
    >
      {isCompact ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%' }}>
          <TypeIcon size={10} color={typeConf.color} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entretien.titre}
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {entretien.titre}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
              background: statutConf.bg, color: statutConf.color, flexShrink: 0, marginLeft: 4,
            }}>
              {statutConf.label}
            </span>
          </div>
          {entretien.candidats && (
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Users size={9} />
              {entretien.candidats.prenom} {entretien.candidats.nom}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted-foreground)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Clock size={9} />
              {format(date, 'HH:mm')} - {format(new Date(date.getTime() + entretien.duree_minutes * 60000), 'HH:mm')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TypeIcon size={9} color={typeConf.color} />
              {typeConf.label}
            </span>
          </div>
        </>
      )}
    </motion.div>
  )
}

/* ─── Sidebar Interview Card ─── */
function SidebarCard({ entretien, onUpdate, onDelete }: {
  entretien: any
  onUpdate: (data: any) => void
  onDelete: (id: string) => void
}) {
  const typeConf = TYPE_CONFIG[entretien.type] || TYPE_CONFIG.visio
  const TypeIcon = typeConf.icon
  const statutConf = STATUT_CONFIG[entretien.statut] || STATUT_CONFIG.planifie
  const StatutIcon = statutConf.icon
  const date = new Date(entretien.date_heure)
  const isPast = isBefore(date, new Date())

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        background: 'var(--card)',
        border: '2px solid var(--border)',
        borderRadius: 14,
        padding: '14px 16px',
        opacity: isPast && (entretien.statut === 'complete' || entretien.statut === 'annule') ? 0.55 : 1,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: 'pointer',
      }}
      whileHover={{
        borderColor: typeConf.color + '60',
        boxShadow: `0 4px 16px rgba(0,0,0,0.2)`,
      }}
    >
      {/* Header: status badge + type icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${typeConf.color}15`,
            border: `2px solid ${typeConf.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TypeIcon size={15} color={typeConf.color} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', margin: 0, lineHeight: 1.2 }}>
              {entretien.titre}
            </p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
              {format(date, "EEEE d MMM '\u00e0' HH:mm", { locale: fr })}
            </p>
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
          background: statutConf.bg, color: statutConf.color,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <StatutIcon size={10} />
          {statutConf.label}
        </span>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entretien.candidats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
            <Users size={11} />
            <span style={{ fontWeight: 600 }}>{entretien.candidats.prenom} {entretien.candidats.nom}</span>
          </div>
        )}
        {entretien.offres && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
            <Briefcase size={11} />
            {entretien.offres.titre}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
          <Clock size={11} />
          {entretien.duree_minutes} min
        </div>
      </div>

      {/* Actions */}
      {!isPast && entretien.statut !== 'annule' && entretien.statut !== 'complete' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}>
          {entretien.statut === 'planifie' && (
            <button
              onClick={() => onUpdate({ id: entretien.id, statut: 'confirme' })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 8,
                border: '2px solid rgba(16,185,129,0.3)',
                background: 'rgba(16,185,129,0.08)',
                color: '#10B981', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              <CheckCircle size={11} /> Confirmer
            </button>
          )}
          <button
            onClick={() => onUpdate({ id: entretien.id, statut: 'complete' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 8,
              border: '2px solid var(--border)',
              background: 'transparent',
              color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Terminer
          </button>
          {entretien.lien_visio && (
            <a
              href={entretien.lien_visio}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 8,
                border: '2px solid rgba(59,130,246,0.3)',
                background: 'rgba(59,130,246,0.08)',
                color: '#3B82F6', fontSize: 11, fontWeight: 600,
                textDecoration: 'none', cursor: 'pointer',
              }}
            >
              <ExternalLink size={10} /> Rejoindre
            </a>
          )}
          <button
            onClick={() => onDelete(entretien.id)}
            style={{
              marginLeft: 'auto', padding: '5px 8px', borderRadius: 8,
              border: '2px solid rgba(239,68,68,0.2)',
              background: 'rgba(239,68,68,0.06)',
              color: '#EF4444', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function EntretiensPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  const { data: entretiens, isLoading } = useEntretiens()
  const updateEntretien = useUpdateEntretien()
  const deleteEntretien = useDeleteEntretien()

  // Compute week days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: viewMode === 'week' ? 7 : 1 }, (_, i) =>
    viewMode === 'week' ? addDays(weekStart, i) : currentDate
  )

  // Group entretiens by date
  const entretiensByDay = useMemo(() => {
    const map: Record<string, any[]> = {}
    ;(entretiens || []).forEach((e: any) => {
      const key = format(new Date(e.date_heure), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(e)
    })
    return map
  }, [entretiens])

  // Upcoming interviews (sidebar)
  const now = new Date()
  const upcoming = useMemo(() => {
    return (entretiens || [])
      .filter((e: any) => new Date(e.date_heure) >= now && e.statut !== 'annule' && e.statut !== 'complete')
      .sort((a: any, b: any) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime())
      .slice(0, 6)
  }, [entretiens])

  // Stats
  const stats = useMemo(() => {
    const all = entretiens || []
    return {
      total: all.length,
      planifie: all.filter((e: any) => e.statut === 'planifie').length,
      confirme: all.filter((e: any) => e.statut === 'confirme').length,
      thisWeek: all.filter((e: any) => {
        const d = new Date(e.date_heure)
        return d >= weekStart && d <= endOfWeek(weekStart, { weekStartsOn: 1 })
      }).length,
    }
  }, [entretiens, weekStart])

  const handleUpdate = (data: any) => updateEntretien.mutate(data)
  const handleDelete = (id: string) => deleteEntretien.mutate(id)

  const navigateWeek = (direction: number) => {
    if (viewMode === 'week') {
      setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, direction))
    }
  }

  return (
    <div style={{ padding: '20px 24px', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #8B5CF6, rgba(139,92,246,0.6))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarDays size={20} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.02em' }}>
                Entretiens
              </h1>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                {stats.planifie + stats.confirme} \u00e0 venir &middot; {stats.thisWeek} cette semaine
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View toggle */}
            <div style={{
              display: 'flex', background: 'var(--secondary)', borderRadius: 10,
              border: '2px solid var(--border)', padding: 2,
            }}>
              {[
                { id: 'week' as const, label: 'Semaine', icon: CalendarDays },
                { id: 'day' as const, label: 'Jour', icon: LayoutList },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: viewMode === v.id ? 'var(--card)' : 'transparent',
                    color: viewMode === v.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                    boxShadow: viewMode === v.id ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <v.icon size={13} />
                  {v.label}
                </button>
              ))}
            </div>

            <Button onClick={() => setShowCreate(true)} style={{ borderRadius: 10, fontWeight: 700, gap: 6 }}>
              <Plus size={15} />
              Planifier
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Planifi\u00e9s', value: stats.planifie, color: '#F59E0B', icon: Clock },
            { label: 'Confirm\u00e9s', value: stats.confirme, color: '#10B981', icon: CheckCircle },
            { label: 'Cette semaine', value: stats.thisWeek, color: '#8B5CF6', icon: CalendarDays },
            { label: 'Total', value: stats.total, color: '#3B82F6', icon: Briefcase },
          ].map(s => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 14,
                background: `${s.color}08`,
                border: `2px solid ${s.color}20`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${s.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <s.icon size={15} color={s.color} />
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', margin: 0 }}>{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigateWeek(-1)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '2px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              style={{
                padding: '5px 14px', borderRadius: 8,
                border: '2px solid var(--primary)', background: 'rgba(247,201,72,0.08)',
                color: 'var(--primary)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => navigateWeek(1)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '2px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            {viewMode === 'week'
              ? `${format(weekStart, 'd MMM', { locale: fr })} \u2013 ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: fr })}`
              : format(currentDate, "EEEE d MMMM yyyy", { locale: fr })
            }
          </p>
        </div>
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--secondary)', borderRadius: 16, border: '2px solid var(--border)', animation: 'pulse 2s infinite' }} />
          <div style={{ width: 320, background: 'var(--secondary)', borderRadius: 16, border: '2px solid var(--border)', animation: 'pulse 2s infinite' }} />
        </div>
      ) : (entretiens || []).length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{
            textAlign: 'center', padding: 48,
            background: 'var(--card)', borderRadius: 20,
            border: '2px solid var(--border)', maxWidth: 420,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))',
              border: '2px solid rgba(139,92,246,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <CalendarDays size={32} color="#8B5CF6" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 8px' }}>
              Aucun entretien planifi\u00e9
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Planifiez votre premier entretien pour commencer \u00e0 organiser vos rendez-vous de recrutement.
            </p>
            <Button onClick={() => setShowCreate(true)} style={{ borderRadius: 10, fontWeight: 700, gap: 6 }}>
              <Plus size={15} />
              Planifier un entretien
            </Button>
          </div>
        </motion.div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
          {/* Calendar grid */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            background: 'var(--card)', borderRadius: 16,
            border: '2px solid var(--border)', overflow: 'hidden',
          }}>
            {/* Day headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)`,
              borderBottom: '2px solid var(--border)',
            }}>
              <div style={{ padding: 10 }} /> {/* Time column spacer */}
              {weekDays.map((day, i) => {
                const today = isToday(day)
                return (
                  <div
                    key={i}
                    style={{
                      padding: '12px 8px', textAlign: 'center',
                      borderLeft: '1px solid var(--border)',
                      background: today ? 'rgba(247,201,72,0.06)' : 'transparent',
                    }}
                  >
                    <p style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0,
                    }}>
                      {format(day, 'EEE', { locale: fr })}
                    </p>
                    <p style={{
                      fontSize: 20, fontWeight: 800, margin: '2px 0 0',
                      color: today ? 'var(--primary)' : 'var(--foreground)',
                    }}>
                      {format(day, 'd')}
                      {today && (
                        <span style={{
                          display: 'inline-block', width: 6, height: 6,
                          borderRadius: '50%', background: 'var(--primary)',
                          marginLeft: 4, verticalAlign: 'super',
                        }} />
                      )}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)`,
                minHeight: HOURS.length * 64,
              }}>
                {/* Time labels */}
                <div style={{ position: 'relative' }}>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      position: 'absolute', top: (h - 8) * 64 - 7,
                      right: 8, fontSize: 10, fontWeight: 600,
                      color: 'var(--muted-foreground)',
                    }}>
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day, dayIndex) => {
                  const dayKey = format(day, 'yyyy-MM-dd')
                  const dayEntretiens = entretiensByDay[dayKey] || []
                  const today = isToday(day)

                  return (
                    <div
                      key={dayIndex}
                      style={{
                        position: 'relative',
                        borderLeft: '1px solid var(--border)',
                        background: today ? 'rgba(247,201,72,0.03)' : 'transparent',
                      }}
                    >
                      {/* Hour lines */}
                      {HOURS.map(h => (
                        <div key={h} style={{
                          position: 'absolute', top: (h - 8) * 64,
                          left: 0, right: 0, height: 1,
                          background: 'var(--border)',
                        }} />
                      ))}

                      {/* Current time indicator */}
                      {today && (() => {
                        const now = new Date()
                        const currentHour = now.getHours()
                        const currentMin = now.getMinutes()
                        if (currentHour < 8 || currentHour > 19) return null
                        const top = ((currentHour - 8) * 60 + currentMin) / 60 * 64
                        return (
                          <div style={{
                            position: 'absolute', top, left: 0, right: 0,
                            height: 2, background: '#EF4444', zIndex: 5,
                            boxShadow: '0 0 6px rgba(239,68,68,0.5)',
                          }}>
                            <div style={{
                              position: 'absolute', left: -4, top: -3,
                              width: 8, height: 8, borderRadius: '50%',
                              background: '#EF4444',
                            }} />
                          </div>
                        )
                      })()}

                      {/* Events */}
                      {dayEntretiens.map((e: any) => (
                        <CalendarEventCard
                          key={e.id}
                          entretien={e}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: upcoming interviews */}
          <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', flexShrink: 0 }}>
            <div style={{
              background: 'var(--card)', borderRadius: 16,
              border: '2px solid var(--border)', padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Zap size={14} color="var(--primary)" />
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                  Prochains entretiens
                </h3>
              </div>
              {upcoming.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <AlertCircle size={20} color="var(--muted-foreground)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                    Aucun entretien \u00e0 venir
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcoming.map((e: any) => (
                    <SidebarCard
                      key={e.id}
                      entretien={e}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Create Dialog ─── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontWeight: 800 }}>Planifier un entretien</DialogTitle>
          </DialogHeader>
          <CreateEntretienForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Create Form ─── */
function CreateEntretienForm({ onSuccess }: { onSuccess: () => void }) {
  const [titre, setTitre] = useState('')
  const [candidatId, setCandidatId] = useState('')
  const [offreId, setOffreId] = useState('')
  const [dateHeure, setDateHeure] = useState('')
  const [duree, setDuree] = useState('60')
  const [type, setType] = useState<'visio' | 'presentiel' | 'telephone'>('visio')
  const [lienVisio, setLienVisio] = useState('')
  const [lieu, setLieu] = useState('')
  const [notes, setNotes] = useState('')
  const [intervieweur, setIntervieweur] = useState('')

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const { data: offres } = useOffres()
  const createEntretien = useCreateEntretien()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createEntretien.mutate({
      titre,
      candidat_id: candidatId || null,
      offre_id: offreId || null,
      date_heure: new Date(dateHeure).toISOString(),
      duree_minutes: parseInt(duree) || 60,
      type,
      lien_visio: lienVisio || null,
      lieu: lieu || null,
      notes: notes || null,
      intervieweur: intervieweur || null,
      statut: 'planifie',
    }, { onSuccess })
  }

  const labelStyle = {
    display: 'block' as const, fontSize: 11, fontWeight: 700,
    color: 'var(--muted-foreground)', textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', marginBottom: 6,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Titre de l&apos;entretien *</label>
        <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Entretien RH -- D\u00e9veloppeur Frontend" required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Candidat</label>
          <Select value={candidatId} onValueChange={setCandidatId}>
            <SelectTrigger style={{ height: 38 }}>
              <SelectValue placeholder="S\u00e9lectionner..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={labelStyle}>Offre</label>
          <Select value={offreId} onValueChange={setOffreId}>
            <SelectTrigger style={{ height: 38 }}>
              <SelectValue placeholder="S\u00e9lectionner..." />
            </SelectTrigger>
            <SelectContent>
              {offres?.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Date et heure *</label>
          <Input type="datetime-local" value={dateHeure} onChange={e => setDateHeure(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Dur\u00e9e (minutes)</label>
          <Input type="number" min="15" step="15" value={duree} onChange={e => setDuree(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Format</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['visio', 'presentiel', 'telephone'] as const).map(t => {
            const conf = TYPE_CONFIG[t]
            const selected = type === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 700, borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${selected ? conf.color + '60' : 'var(--border)'}`,
                  background: selected ? conf.color + '10' : 'transparent',
                  color: selected ? conf.color : 'var(--muted-foreground)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                <conf.icon size={14} />
                {conf.label}
              </button>
            )
          })}
        </div>
      </div>

      {type === 'visio' && (
        <div>
          <label style={labelStyle}>Lien visio</label>
          <Input value={lienVisio} onChange={e => setLienVisio(e.target.value)} placeholder="https://meet.google.com/..." />
        </div>
      )}
      {type === 'presentiel' && (
        <div>
          <label style={labelStyle}>Lieu</label>
          <Input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Rue du Rh\u00f4ne 12, Gen\u00e8ve" />
        </div>
      )}

      <div>
        <label style={labelStyle}>Intervieweur</label>
        <Input value={intervieweur} onChange={e => setIntervieweur(e.target.value)} placeholder="ex: J. Barbosa" />
      </div>

      <div>
        <label style={labelStyle}>Notes</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points \u00e0 aborder, documents \u00e0 pr\u00e9parer..." rows={2} style={{ resize: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <Button type="submit" disabled={!titre || !dateHeure || createEntretien.isPending} style={{ borderRadius: 10, fontWeight: 700 }}>
          {createEntretien.isPending ? 'Planification...' : "Planifier l'entretien"}
        </Button>
      </div>
    </form>
  )
}
