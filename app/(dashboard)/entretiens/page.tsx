'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Calendar, Clock, Video, MapPin, Phone, Plus, Users, Briefcase,
  CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight,
  CalendarDays, LayoutList, Zap, AlertCircle, ExternalLink,
  Eye, Edit3, Search, X, Grid3X3
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
  startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, getDay,
  format, isSameDay, isToday, isSameMonth, isBefore, isAfter,
  startOfDay, parseISO, differenceInDays
} from 'date-fns'
import { fr } from 'date-fns/locale'

/* ─── Types ─── */
type ViewMode = 'jour' | 'semaine' | 'mois'

/* ─── Config ─── */
const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  planifie: { label: 'Planifié', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: Clock },
  confirme: { label: 'Confirmé', color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle },
  annule:   { label: 'Annulé', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', icon: XCircle },
  complete: { label: 'Terminé', color: '#6B7280', bg: 'rgba(107,114,128,0.12)', icon: CheckCircle },
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  visio:      { label: 'Visio', icon: Video, color: '#3B82F6' },
  presentiel: { label: 'Présentiel', icon: MapPin, color: '#8B5CF6' },
  telephone:  { label: 'Téléphone', icon: Phone, color: '#10B981' },
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8h to 19h
const HOUR_HEIGHT = 64

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1h' },
  { value: '90', label: '1h30' },
  { value: '120', label: '2h' },
]

/* ─── Helpers ─── */
function getEntretienPosition(dateHeure: string, dureeMinutes: number) {
  const date = new Date(dateHeure)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const top = ((hours - 8) * 60 + minutes) / 60 * HOUR_HEIGHT
  const height = Math.max(dureeMinutes / 60 * HOUR_HEIGHT, 28)
  return { top, height }
}

function formatHeure(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function getMonthCalendarDays(date: Date): Date[] {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  // Monday = 1, so we need the previous Monday
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days: Date[] = []
  let current = calStart
  while (current <= calEnd) {
    days.push(current)
    current = addDays(current, 1)
  }
  return days
}

/* ─── Calendar Event Card (Week/Day) ─── */
function CalendarEventCard({ entretien, onClick }: {
  entretien: any
  onClick: (e: any) => void
}) {
  const typeConf = TYPE_CONFIG[entretien.type] || TYPE_CONFIG.visio
  const TypeIcon = typeConf.icon
  const statutConf = STATUT_CONFIG[entretien.statut] || STATUT_CONFIG.planifie
  const date = new Date(entretien.date_heure)
  const endDate = new Date(date.getTime() + entretien.duree_minutes * 60000)
  const { top, height } = getEntretienPosition(entretien.date_heure, entretien.duree_minutes)
  const isCompact = height < 50
  const isPast = isBefore(date, new Date()) && entretien.statut !== 'planifie' && entretien.statut !== 'confirme'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={(e) => { e.stopPropagation(); onClick(entretien) }}
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
              {formatHeure(date)} - {formatHeure(endDate)}
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

/* ─── Detail/Edit Dialog ─── */
function EntretienDetailDialog({ entretien, open, onOpenChange, onUpdate, onDelete }: {
  entretien: any
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdate: (data: any) => void
  onDelete: (id: string) => void
}) {
  if (!entretien) return null
  const typeConf = TYPE_CONFIG[entretien.type] || TYPE_CONFIG.visio
  const TypeIcon = typeConf.icon
  const statutConf = STATUT_CONFIG[entretien.statut] || STATUT_CONFIG.planifie
  const StatutIcon = statutConf.icon
  const date = new Date(entretien.date_heure)
  const endDate = new Date(date.getTime() + entretien.duree_minutes * 60000)
  const isPast = isBefore(date, new Date())

  const canAct = !isPast || (entretien.statut === 'planifie' || entretien.statut === 'confirme')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${typeConf.color}15`, border: `2px solid ${typeConf.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <TypeIcon size={17} color={typeConf.color} />
            </div>
            <span style={{ flex: 1 }}>{entretien.titre}</span>
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
              background: statutConf.bg, color: statutConf.color,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <StatutIcon size={12} />
              {statutConf.label}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 8,
              background: `${typeConf.color}10`, color: typeConf.color,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <TypeIcon size={12} />
              {typeConf.label}
            </span>
          </div>

          {/* Details grid */}
          <div style={{
            background: 'var(--secondary)', borderRadius: 14,
            border: '2px solid var(--border)', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Calendar size={14} color="var(--muted-foreground)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {format(date, "EEEE d MMMM yyyy", { locale: fr })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={14} color="var(--muted-foreground)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {formatHeure(date)} - {formatHeure(endDate)} ({entretien.duree_minutes} min)
              </span>
            </div>
            {entretien.candidats && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={14} color="var(--muted-foreground)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                  {entretien.candidats.prenom} {entretien.candidats.nom}
                </span>
              </div>
            )}
            {entretien.offres && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Briefcase size={14} color="var(--muted-foreground)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                  {entretien.offres.titre}
                </span>
              </div>
            )}
            {entretien.intervieweur && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={14} color="var(--muted-foreground)" />
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                  Intervieweur : {entretien.intervieweur}
                </span>
              </div>
            )}
            {entretien.lieu && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapPin size={14} color="var(--muted-foreground)" />
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                  {entretien.lieu}
                </span>
              </div>
            )}
            {entretien.lien_visio && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Video size={14} color="#3B82F6" />
                <a href={entretien.lien_visio} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'underline', fontWeight: 600 }}>
                  Rejoindre la visio
                </a>
              </div>
            )}
          </div>

          {/* Notes */}
          {entretien.notes && (
            <div style={{
              background: 'rgba(247,201,72,0.06)', borderRadius: 14,
              border: '2px solid rgba(247,201,72,0.15)', padding: 16,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Notes
              </p>
              <p style={{ fontSize: 13, color: 'var(--foreground)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {entretien.notes}
              </p>
            </div>
          )}

          {/* Actions */}
          {canAct && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              paddingTop: 8, borderTop: '2px solid var(--border)',
            }}>
              {entretien.statut === 'planifie' && (
                <Button
                  onClick={() => { onUpdate({ id: entretien.id, statut: 'confirme' }); onOpenChange(false) }}
                  style={{
                    borderRadius: 10, fontWeight: 700, gap: 6, fontSize: 12,
                    background: 'rgba(16,185,129,0.1)', color: '#10B981',
                    border: '2px solid rgba(16,185,129,0.3)',
                  }}
                  variant="outline"
                >
                  <CheckCircle size={13} /> Confirmer
                </Button>
              )}
              <Button
                onClick={() => { onUpdate({ id: entretien.id, statut: 'complete' }); onOpenChange(false) }}
                variant="outline"
                style={{ borderRadius: 10, fontWeight: 700, gap: 6, fontSize: 12 }}
              >
                Terminer
              </Button>
              <Button
                onClick={() => { onUpdate({ id: entretien.id, statut: 'annule' }); onOpenChange(false) }}
                variant="outline"
                style={{ borderRadius: 10, fontWeight: 700, gap: 6, fontSize: 12, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                <XCircle size={13} /> Annuler
              </Button>
              <div style={{ flex: 1 }} />
              <Button
                onClick={() => { onDelete(entretien.id); onOpenChange(false) }}
                variant="outline"
                style={{ borderRadius: 10, fontWeight: 700, gap: 6, fontSize: 12, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                <Trash2 size={13} /> Supprimer
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Month View ─── */
function MonthView({ currentDate, entretiensByDay, onDayClick, onEventClick }: {
  currentDate: Date
  entretiensByDay: Record<string, any[]>
  onDayClick: (day: Date) => void
  onEventClick: (e: any) => void
}) {
  const calendarDays = useMemo(() => getMonthCalendarDays(currentDate), [currentDate])
  const weeks = useMemo(() => {
    const w: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      w.push(calendarDays.slice(i, i + 7))
    }
    return w
  }, [calendarDays])

  const dayNames = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)', overflow: 'hidden',
      }}
    >
      {/* Day name headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '2px solid var(--border)',
      }}>
        {dayNames.map(d => (
          <div key={d} style={{
            padding: '10px 8px', textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{
            flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: wi < weeks.length - 1 ? '1px solid var(--border)' : 'none',
            minHeight: 0,
          }}>
            {week.map((day, di) => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayEntretiens = entretiensByDay[dayKey] || []
              const today = isToday(day)
              const inMonth = isSameMonth(day, currentDate)
              const hasEvents = dayEntretiens.length > 0

              // Group by type for colored dots
              const typeCounts: Record<string, number> = {}
              dayEntretiens.forEach((e: any) => {
                const t = e.type || 'visio'
                typeCounts[t] = (typeCounts[t] || 0) + 1
              })

              return (
                <motion.div
                  key={di}
                  onClick={() => onDayClick(day)}
                  whileHover={{ backgroundColor: 'rgba(247,201,72,0.06)' }}
                  style={{
                    borderLeft: di > 0 ? '1px solid var(--border)' : 'none',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    opacity: inMonth ? 1 : 0.35,
                    background: today ? 'rgba(247,201,72,0.08)' : 'transparent',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                >
                  {/* Day number */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 4,
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: today ? 800 : 600,
                      color: today ? 'var(--card)' : 'var(--foreground)',
                      width: today ? 26 : 'auto', height: today ? 26 : 'auto',
                      borderRadius: '50%',
                      background: today ? 'var(--primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {format(day, 'd')}
                    </span>
                    {hasEvents && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: 'var(--primary)',
                        background: 'rgba(247,201,72,0.15)', borderRadius: 6,
                        padding: '1px 5px',
                      }}>
                        {dayEntretiens.length}
                      </span>
                    )}
                  </div>

                  {/* Type dots */}
                  {hasEvents && (
                    <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
                      {Object.entries(typeCounts).map(([type, count]) => {
                        const tc = TYPE_CONFIG[type] || TYPE_CONFIG.visio
                        return Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                          <div key={`${type}-${i}`} style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: tc.color, flexShrink: 0,
                          }} />
                        ))
                      })}
                    </div>
                  )}

                  {/* Event previews (compact) */}
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayEntretiens.slice(0, 3).map((e: any) => {
                      const tc = TYPE_CONFIG[e.type] || TYPE_CONFIG.visio
                      return (
                        <div
                          key={e.id}
                          onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}
                          style={{
                            fontSize: 10, fontWeight: 600,
                            padding: '2px 5px', borderRadius: 4,
                            background: `${tc.color}12`,
                            borderLeft: `2px solid ${tc.color}`,
                            color: 'var(--foreground)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                        >
                          {formatHeure(new Date(e.date_heure))} {e.titre}
                        </div>
                      )
                    })}
                    {dayEntretiens.length > 3 && (
                      <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 600, paddingLeft: 5 }}>
                        +{dayEntretiens.length - 3} de plus
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Time Grid View (Week/Day) ─── */
function TimeGridView({ weekDays, entretiensByDay, onEventClick, onSlotClick }: {
  weekDays: Date[]
  entretiensByDay: Record<string, any[]>
  onEventClick: (e: any) => void
  onSlotClick: (date: Date, hour: number) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)', overflow: 'hidden',
      }}
    >
      {/* Day headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)`,
        borderBottom: '2px solid var(--border)',
      }}>
        <div style={{ padding: 10 }} />
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
          minHeight: HOURS.length * HOUR_HEIGHT,
        }}>
          {/* Time labels */}
          <div style={{ position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h} style={{
                position: 'absolute', top: (h - 8) * HOUR_HEIGHT - 7,
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
                {/* Hour lines (clickable slots) */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    onClick={() => onSlotClick(day, h)}
                    style={{
                      position: 'absolute', top: (h - 8) * HOUR_HEIGHT,
                      left: 0, right: 0, height: HOUR_HEIGHT,
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Half-hour click zone */}
                    <div
                      onClick={(e) => { e.stopPropagation(); onSlotClick(day, h + 0.5) }}
                      style={{
                        position: 'absolute', top: HOUR_HEIGHT / 2,
                        left: 0, right: 0, height: HOUR_HEIGHT / 2,
                        borderTop: '1px dashed rgba(128,128,128,0.15)',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                ))}

                {/* Current time indicator */}
                {today && (() => {
                  const now = new Date()
                  const currentHour = now.getHours()
                  const currentMin = now.getMinutes()
                  if (currentHour < 8 || currentHour > 19) return null
                  const top = ((currentHour - 8) * 60 + currentMin) / 60 * HOUR_HEIGHT
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
                    onClick={onEventClick}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Sidebar ─── */
function Sidebar({ entretiens, stats, onEventClick }: {
  entretiens: any[]
  stats: { today: number; thisWeek: number; thisMonth: number }
  onEventClick: (e: any) => void
}) {
  const now = new Date()
  const in7Days = addDays(now, 7)

  const upcoming = useMemo(() => {
    return (entretiens || [])
      .filter((e: any) => {
        const d = new Date(e.date_heure)
        return d >= now && d <= in7Days && e.statut !== 'annule' && e.statut !== 'complete'
      })
      .sort((a: any, b: any) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime())
      .slice(0, 8)
  }, [entretiens])

  return (
    <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', flexShrink: 0 }}>
      {/* Quick Stats */}
      <div style={{
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)', padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <CalendarDays size={14} color="var(--primary)" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Statistiques
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: "Aujourd'hui", value: stats.today, color: '#F59E0B' },
            { label: 'Cette semaine', value: stats.thisWeek, color: '#8B5CF6' },
            { label: 'Ce mois', value: stats.thisMonth, color: '#3B82F6' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 10,
              background: `${s.color}08`, border: `1px solid ${s.color}15`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>{s.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Color Legend */}
      <div style={{
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)', padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Eye size={14} color="var(--muted-foreground)" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Légende
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(TYPE_CONFIG).map(([key, conf]) => {
            const Icon = conf.icon
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: conf.color, flexShrink: 0,
                }} />
                <Icon size={12} color={conf.color} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{conf.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming interviews */}
      <div style={{
        background: 'var(--card)', borderRadius: 16,
        border: '2px solid var(--border)', padding: 16,
        flex: 1, overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Zap size={14} color="var(--primary)" />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Prochains 7 jours
          </h3>
          {upcoming.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(247,201,72,0.15)', color: 'var(--primary)',
            }}>
              {upcoming.length}
            </span>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertCircle size={20} color="var(--muted-foreground)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Aucun entretien à venir
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map((e: any) => {
              const typeConf = TYPE_CONFIG[e.type] || TYPE_CONFIG.visio
              const TypeIcon = typeConf.icon
              const date = new Date(e.date_heure)
              const isNow = isToday(date)
              return (
                <motion.div
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ borderColor: typeConf.color + '60', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
                  style={{
                    padding: '10px 12px', borderRadius: 12,
                    border: `2px solid ${isNow ? 'rgba(247,201,72,0.3)' : 'var(--border)'}`,
                    background: isNow ? 'rgba(247,201,72,0.04)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 7,
                      background: `${typeConf.color}15`, border: `1.5px solid ${typeConf.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <TypeIcon size={11} color={typeConf.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--foreground)', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {e.titre}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                        {isNow ? "Aujourd'hui" : format(date, 'EEE d MMM', { locale: fr })} &middot; {formatHeure(date)}
                      </p>
                    </div>
                  </div>
                  {e.candidats && (
                    <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0, paddingLeft: 32 }}>
                      {e.candidats.prenom} {e.candidats.nom}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Create Form ─── */
function CreateEntretienForm({ onSuccess, defaultDate, defaultHour }: {
  onSuccess: () => void
  defaultDate?: Date
  defaultHour?: number
}) {
  const [titre, setTitre] = useState('')
  const [candidatSearch, setCandidatSearch] = useState('')
  const [candidatId, setCandidatId] = useState('')
  const [offreId, setOffreId] = useState('')
  const [dateHeure, setDateHeure] = useState(() => {
    if (defaultDate && defaultHour !== undefined) {
      const d = new Date(defaultDate)
      const h = Math.floor(defaultHour)
      const m = (defaultHour % 1) * 60
      d.setHours(h, m, 0, 0)
      return format(d, "yyyy-MM-dd'T'HH:mm")
    }
    return ''
  })
  const [duree, setDuree] = useState('60')
  const [type, setType] = useState<'visio' | 'presentiel' | 'telephone'>('visio')
  const [lienVisio, setLienVisio] = useState('')
  const [lieu, setLieu] = useState('')
  const [notes, setNotes] = useState('')
  const [intervieweur, setIntervieweur] = useState('')
  const [showCandidatDropdown, setShowCandidatDropdown] = useState(false)

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
  const { data: offres } = useOffres()
  const createEntretien = useCreateEntretien()

  // Filter candidats by search
  const filteredCandidats = useMemo(() => {
    if (!candidats) return []
    if (!candidatSearch.trim()) return candidats.slice(0, 10)
    const q = candidatSearch.toLowerCase()
    return candidats.filter((c: any) =>
      `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    ).slice(0, 10)
  }, [candidats, candidatSearch])

  const selectedCandidat = useMemo(() => {
    return candidats?.find((c: any) => c.id === candidatId)
  }, [candidats, candidatId])

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
    display: 'block' as const, fontSize: 11, fontWeight: 700 as const,
    color: 'var(--muted-foreground)', textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', marginBottom: 6,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Title */}
      <div>
        <label style={labelStyle}>Titre de l&apos;entretien *</label>
        <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Entretien RH — Développeur Frontend" required />
      </div>

      {/* Candidat search */}
      <div style={{ position: 'relative' }}>
        <label style={labelStyle}>Candidat</label>
        {selectedCandidat ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            border: '2px solid var(--border)', background: 'var(--secondary)',
          }}>
            <Users size={13} color="var(--muted-foreground)" />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              {selectedCandidat.prenom} {selectedCandidat.nom}
            </span>
            <button type="button" onClick={() => { setCandidatId(''); setCandidatSearch('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted-foreground)' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input
              value={candidatSearch}
              onChange={e => { setCandidatSearch(e.target.value); setShowCandidatDropdown(true) }}
              onFocus={() => setShowCandidatDropdown(true)}
              onBlur={() => setTimeout(() => setShowCandidatDropdown(false), 200)}
              placeholder="Rechercher un candidat..."
              style={{ paddingLeft: 32 }}
            />
            {showCandidatDropdown && filteredCandidats.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                marginTop: 4, background: 'var(--card)', borderRadius: 10,
                border: '2px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                maxHeight: 200, overflow: 'auto',
              }}>
                {filteredCandidats.map((c: any) => (
                  <div
                    key={c.id}
                    onMouseDown={() => {
                      setCandidatId(c.id)
                      setCandidatSearch('')
                      setShowCandidatDropdown(false)
                    }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Users size={12} color="var(--muted-foreground)" />
                    <span style={{ fontWeight: 600 }}>{c.prenom} {c.nom}</span>
                    {c.email && <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{c.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Offre */}
      <div>
        <label style={labelStyle}>Offre / Poste</label>
        <Select value={offreId} onValueChange={setOffreId}>
          <SelectTrigger style={{ height: 38 }}>
            <SelectValue placeholder="Sélectionner une offre..." />
          </SelectTrigger>
          <SelectContent>
            {offres?.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date/Time & Duration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Date et heure *</label>
          <Input type="datetime-local" value={dateHeure} onChange={e => setDateHeure(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Durée</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuree(opt.value)}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${duree === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                  background: duree === opt.value ? 'rgba(247,201,72,0.1)' : 'transparent',
                  color: duree === opt.value ? 'var(--primary)' : 'var(--muted-foreground)',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Type selector */}
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

      {/* Conditional fields */}
      {type === 'visio' && (
        <div>
          <label style={labelStyle}>Lien visio</label>
          <Input value={lienVisio} onChange={e => setLienVisio(e.target.value)} placeholder="https://meet.google.com/..." />
        </div>
      )}
      {type === 'presentiel' && (
        <div>
          <label style={labelStyle}>Lieu</label>
          <Input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Rue du Rhône 12, Genève" />
        </div>
      )}

      {/* Interviewer */}
      <div>
        <label style={labelStyle}>Intervieweur</label>
        <Input value={intervieweur} onChange={e => setIntervieweur(e.target.value)} placeholder="ex: J. Barbosa" />
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points à aborder, documents à préparer..." rows={2} style={{ resize: 'none' }} />
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <Button type="submit" disabled={!titre || !dateHeure || createEntretien.isPending} style={{ borderRadius: 10, fontWeight: 700 }}>
          {createEntretien.isPending ? 'Planification...' : "Planifier l'entretien"}
        </Button>
      </div>
    </form>
  )
}

/* ─── Main Page ─── */
export default function EntretiensPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('semaine')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showCreate, setShowCreate] = useState(false)
  const [createDefaults, setCreateDefaults] = useState<{ date?: Date; hour?: number }>({})
  const [selectedEntretien, setSelectedEntretien] = useState<any>(null)
  const [showDetail, setShowDetail] = useState(false)

  const { data: entretiens, isLoading } = useEntretiens()
  const updateEntretien = useUpdateEntretien()
  const deleteEntretien = useDeleteEntretien()

  // Compute days for current view
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = useMemo(() => {
    if (viewMode === 'jour') return [currentDate]
    if (viewMode === 'semaine') return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    return []
  }, [viewMode, currentDate, weekStart])

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

  // Stats
  const stats = useMemo(() => {
    const all = (entretiens || []).filter((e: any) => e.statut !== 'annule')
    const todayDate = new Date()
    const ws = startOfWeek(todayDate, { weekStartsOn: 1 })
    const we = endOfWeek(todayDate, { weekStartsOn: 1 })
    const ms = startOfMonth(todayDate)
    const me = endOfMonth(todayDate)
    return {
      today: all.filter((e: any) => isSameDay(new Date(e.date_heure), todayDate)).length,
      thisWeek: all.filter((e: any) => {
        const d = new Date(e.date_heure)
        return d >= ws && d <= we
      }).length,
      thisMonth: all.filter((e: any) => {
        const d = new Date(e.date_heure)
        return d >= ms && d <= me
      }).length,
      total: all.length,
      planifie: all.filter((e: any) => e.statut === 'planifie').length,
      confirme: all.filter((e: any) => e.statut === 'confirme').length,
    }
  }, [entretiens])

  const handleUpdate = (data: any) => updateEntretien.mutate(data)
  const handleDelete = (id: string) => deleteEntretien.mutate(id)

  const handleEventClick = (e: any) => {
    setSelectedEntretien(e)
    setShowDetail(true)
  }

  const handleSlotClick = (date: Date, hour: number) => {
    setCreateDefaults({ date, hour })
    setShowCreate(true)
  }

  const handleDayClickInMonth = (day: Date) => {
    setCurrentDate(day)
    setViewMode('semaine')
  }

  const navigate = (direction: number) => {
    if (viewMode === 'mois') {
      setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    } else if (viewMode === 'semaine') {
      setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, direction))
    }
  }

  const headerLabel = useMemo(() => {
    if (viewMode === 'mois') return format(currentDate, 'MMMM yyyy', { locale: fr })
    if (viewMode === 'semaine') {
      return `${format(weekStart, 'd MMM', { locale: fr })} – ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: fr })}`
    }
    return format(currentDate, "EEEE d MMMM yyyy", { locale: fr })
  }, [viewMode, currentDate, weekStart])

  return (
    <div style={{ padding: '20px 24px', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
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
                {stats.planifie + stats.confirme} à venir &middot; {stats.thisWeek} cette semaine
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View toggle: Jour | Semaine | Mois */}
            <div style={{
              display: 'flex', background: 'var(--secondary)', borderRadius: 10,
              border: '2px solid var(--border)', padding: 2,
            }}>
              {([
                { id: 'jour' as const, label: 'Jour', icon: LayoutList },
                { id: 'semaine' as const, label: 'Semaine', icon: CalendarDays },
                { id: 'mois' as const, label: 'Mois', icon: Grid3X3 },
              ]).map(v => (
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

            <Button onClick={() => { setCreateDefaults({}); setShowCreate(true) }} style={{ borderRadius: 10, fontWeight: 700, gap: 6 }}>
              <Plus size={15} />
              Planifier
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Planifiés', value: stats.planifie, color: '#F59E0B', icon: Clock },
            { label: 'Confirmés', value: stats.confirme, color: '#10B981', icon: CheckCircle },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate(-1)}
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
              onClick={() => navigate(1)}
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
          <p style={{
            fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: 0,
            textTransform: viewMode === 'mois' ? 'capitalize' : 'none',
          }}>
            {headerLabel}
          </p>
        </div>
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--secondary)', borderRadius: 16, border: '2px solid var(--border)', animation: 'pulse 2s infinite' }} />
          <div style={{ width: 300, background: 'var(--secondary)', borderRadius: 16, border: '2px solid var(--border)', animation: 'pulse 2s infinite' }} />
        </div>
      ) : (entretiens || []).length === 0 && viewMode !== 'mois' ? (
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
              Aucun entretien planifié
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Planifiez votre premier entretien pour commencer à organiser vos rendez-vous de recrutement.
            </p>
            <Button onClick={() => { setCreateDefaults({}); setShowCreate(true) }} style={{ borderRadius: 10, fontWeight: 700, gap: 6 }}>
              <Plus size={15} />
              Planifier un entretien
            </Button>
          </div>
        </motion.div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
          {/* Main calendar area */}
          <AnimatePresence mode="wait">
            {viewMode === 'mois' ? (
              <MonthView
                key="mois"
                currentDate={currentDate}
                entretiensByDay={entretiensByDay}
                onDayClick={handleDayClickInMonth}
                onEventClick={handleEventClick}
              />
            ) : (
              <TimeGridView
                key={viewMode}
                weekDays={weekDays}
                entretiensByDay={entretiensByDay}
                onEventClick={handleEventClick}
                onSlotClick={handleSlotClick}
              />
            )}
          </AnimatePresence>

          {/* Sidebar */}
          <Sidebar
            entretiens={entretiens || []}
            stats={stats}
            onEventClick={handleEventClick}
          />
        </div>
      )}

      {/* ─── Create Dialog ─── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg" style={{ maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle style={{ fontWeight: 800 }}>Planifier un entretien</DialogTitle>
          </DialogHeader>
          <CreateEntretienForm
            onSuccess={() => setShowCreate(false)}
            defaultDate={createDefaults.date}
            defaultHour={createDefaults.hour}
          />
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <EntretienDetailDialog
        entretien={selectedEntretien}
        open={showDetail}
        onOpenChange={setShowDetail}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  )
}
