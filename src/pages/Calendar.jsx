import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks,
  isSameDay, isSameMonth, isToday, addDays, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, Edit3, Trash2, ExternalLink, CalendarPlus, Repeat, ToggleLeft, ToggleRight } from 'lucide-react'

const APPT_TYPES = ['Doctor Appointment', 'Patient Meeting', 'Family Meeting', 'SBHA General Event', 'Other']

const APPT_SELECT = 'id, title, appointment_date, appointment_type, patient_id, provider, location, notes, completed, series_id, is_recurring, patients(id, first_name, last_name, status, deleted_at)'

// Hex-based colors for calendar pills (consistent across month + week views)
const TYPE_COLORS = {
  'Doctor Appointment': { bg: '#EEF2FB', text: '#4F7EE0', border: '#C7D7F5' },
  'Patient Meeting':    { bg: '#F5EFF6', text: '#A671AA', border: '#E3CFEA' },
  'Family Meeting':     { bg: '#DCFCE7', text: '#16A34A', border: '#BBF7D0' },
  'SBHA General Event': { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  'Other':              { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
}

const GRAY_COLOR = { bg: '#F3F4F6', text: '#9CA3AF', border: '#E5E7EB' }

// 10 distinct patient colors that pair well visually
const PATIENT_PALETTE = [
  { bg: '#EEF2FB', text: '#4F7EE0', border: '#C7D7F5' }, // blue
  { bg: '#F5EFF6', text: '#A671AA', border: '#E3CFEA' }, // mauve
  { bg: '#DCFCE7', text: '#16A34A', border: '#BBF7D0' }, // green
  { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' }, // amber
  { bg: '#FFE4E6', text: '#E11D48', border: '#FECDD3' }, // rose
  { bg: '#E0F2FE', text: '#0284C7', border: '#BAE6FD' }, // sky
  { bg: '#F3E8FF', text: '#9333EA', border: '#E9D5FF' }, // purple
  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' }, // emerald
  { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' }, // orange
  { bg: '#F0FDFA', text: '#0D9488', border: '#99F6E4' }, // teal
]

function getTypeColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS['Other']
}

// Generate all dates for a recurring series
function buildRecurringDates(startStr, freq, weekDayNums, endType, count, endDateStr) {
  const base = parseISO(startStr.slice(0, 16))
  const timeStr = startStr.length >= 16 ? startStr.slice(11, 16) : '09:00'
  const dates = []

  const maxCount =
    endType === 'never'
      ? (freq === 'daily' ? 365 : freq === 'weekly' ? 104 : 36)
      : endType === 'count'
      ? Math.min(Number(count) || 1, 500)
      : 500

  const endLimit =
    endType === 'date' && endDateStr
      ? new Date(endDateStr + 'T23:59:59')
      : null

  function push(d) {
    if (endLimit && d > endLimit) return false
    if (dates.length >= maxCount) return false
    dates.push(format(d, "yyyy-MM-dd") + 'T' + timeStr)
    return true
  }

  if (freq === 'daily') {
    let cur = base
    while (push(cur)) cur = addDays(cur, 1)
  } else if (freq === 'weekly') {
    const sortedDays = [...new Set(weekDayNums)].sort((a, b) => a - b)
    if (!sortedDays.length) return [startStr]
    let weekBase = startOfWeek(base, { weekStartsOn: 0 })
    outer: while (true) {
      for (const dow of sortedDays) {
        const candidate = addDays(weekBase, dow)
        if (candidate < base) continue
        if (!push(candidate)) break outer
      }
      weekBase = addDays(weekBase, 7)
    }
  } else if (freq === 'monthly') {
    let cur = base
    while (push(cur)) cur = addMonths(cur, 1)
  }

  return dates
}

function parseApptDateLocal(dateStr) {
  if (!dateStr) return new Date(0)
  return parseISO(dateStr.slice(0, 16))
}

export default function CalendarPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState('month')
  const [colorMode, setColorMode] = useState('type') // 'type' | 'patient'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [apptModal, setApptModal] = useState(null)
  const [dayModal, setDayModal] = useState(null) // null | { day: Date, appts: [] }
  const [showAddModal, setShowAddModal] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [savingApptUpdate, setSavingApptUpdate] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [apptRes, patientRes] = await Promise.all([
      supabase.from('appointments').select(APPT_SELECT).order('appointment_date'),
      supabase.from('patients').select('id, first_name, last_name').eq('status', 'active').is('deleted_at', null),
    ])

    const rawAppts = apptRes.data || []
    // Exclude appointments belonging to inactive or deleted patients
    const filtered = rawAppts.filter(a => {
      if (!a.patient_id) return true
      if (!a.patients) return true
      if (a.patients.deleted_at) return false
      if (a.patients.status !== 'active') return false
      return true
    })

    setAppointments(filtered)
    setPatients(patientRes.data || [])
    setLoading(false)
  }

  async function saveEvent(draft) {
    setSavingEvent(true)
    const base = {
      title: draft.title,
      appointment_type: draft.appointment_type || null,
      patient_id: draft.patient_id || null,
      provider: draft.provider || null,
      location: draft.location || null,
      notes: draft.notes || null,
      user_id: session.user.id,
    }

    if (draft.recur?.enabled) {
      const dates = buildRecurringDates(
        draft.appointment_date,
        draft.recur.freq,
        draft.recur.weekDays,
        draft.recur.endType,
        draft.recur.count,
        draft.recur.endDate,
      )
      const seriesId = crypto.randomUUID()
      const rows = dates.map(d => ({ ...base, appointment_date: d, series_id: seriesId, is_recurring: true }))
      const { data } = await supabase.from('appointments').insert(rows).select(APPT_SELECT)
      if (data) {
        const valid = data.filter(a => !a.patient_id || !a.patients || (!a.patients.deleted_at && a.patients.status === 'active'))
        setAppointments(prev => [...prev, ...valid].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
      }
    } else {
      const payload = { ...base, appointment_date: draft.appointment_date }
      const { data } = await supabase.from('appointments').insert(payload).select(APPT_SELECT).single()
      if (data) {
        const p = data.patients
        const valid = !data.patient_id || !p || (!p.deleted_at && p.status === 'active')
        if (valid) setAppointments(prev => [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
      }
    }

    setSavingEvent(false)
    setShowAddModal(false)
  }

  async function updateAppt(apptId, fields, scope = 'one') {
    setSavingApptUpdate(true)
    if (scope === 'future') {
      const appt = appointments.find(a => a.id === apptId)
      if (appt?.series_id) {
        // Update shared fields (not appointment_date — each occurrence keeps its own date)
        const { appointment_date: _d, id: _id, patients: _p, created_at: _ca, series_id: _s, is_recurring: _ir, ...sharedFields } = fields
        await supabase.from('appointments').update(sharedFields).eq('series_id', appt.series_id).gte('appointment_date', appt.appointment_date)
        const { data: refreshed } = await supabase.from('appointments').select(APPT_SELECT).order('appointment_date')
        if (refreshed) {
          const filtered = refreshed.filter(a => !a.patient_id || !a.patients || (!a.patients.deleted_at && a.patients.status === 'active'))
          setAppointments(filtered)
        }
      }
    } else {
      const { data } = await supabase.from('appointments').update(fields).eq('id', apptId).select(APPT_SELECT).single()
      if (data) {
        setAppointments(prev =>
          prev.map(a => a.id === apptId ? data : a)
            .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
        )
        setApptModal(data)
      }
    }
    setSavingApptUpdate(false)
  }

  async function deleteAppt(apptId, scope = 'one') {
    if (scope === 'future') {
      const appt = appointments.find(a => a.id === apptId)
      if (appt?.series_id) {
        await supabase.from('appointments').delete().eq('series_id', appt.series_id).gte('appointment_date', appt.appointment_date)
        setAppointments(prev => prev.filter(a => !(a.series_id === appt.series_id && a.appointment_date >= appt.appointment_date)))
      } else {
        await supabase.from('appointments').delete().eq('id', apptId)
        setAppointments(prev => prev.filter(a => a.id !== apptId))
      }
    } else {
      await supabase.from('appointments').delete().eq('id', apptId)
      setAppointments(prev => prev.filter(a => a.id !== apptId))
    }
    setApptModal(null)
  }

  function getMonthDays() {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }

  function getWeekDays() {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
  }

  function getApptsForDay(day) {
    return appointments.filter(a => isSameDay(parseApptDateLocal(a.appointment_date), day))
  }

  function navigatePrev() {
    if (view === 'month') setCurrentDate(d => subMonths(d, 1))
    else setCurrentDate(d => subWeeks(d, 1))
  }

  function navigateNext() {
    if (view === 'month') setCurrentDate(d => addMonths(d, 1))
    else setCurrentDate(d => addWeeks(d, 1))
  }

  const weekDays = getWeekDays()

  // Build patient → color map from sorted patients list (stable order by id)
  const patientColorMap = {}
  ;[...patients].sort((a, b) => a.id.localeCompare(b.id)).forEach((p, i) => {
    patientColorMap[p.id] = PATIENT_PALETTE[i % PATIENT_PALETTE.length]
  })

  function getApptColor(appt) {
    if (colorMode === 'type') return getTypeColor(appt.appointment_type)
    if (!appt.patient_id) return GRAY_COLOR
    return patientColorMap[appt.patient_id] || GRAY_COLOR
  }

  // Patients who actually have appointments (for legend)
  const patientsWithAppts = patients.filter(p =>
    appointments.some(a => a.patient_id === p.id)
  ).sort((a, b) => a.id.localeCompare(b.id))

  const headerTitle = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : isSameMonth(weekDays[0], weekDays[6])
      ? `${format(weekDays[0], 'MMMM d')} – ${format(weekDays[6], 'd, yyyy')}`
      : `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'MMM d, yyyy')}`

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl">

      {/* ── Header ── */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        {/* Row 1 on mobile / Left on desktop: nav arrows + month/year + Today */}
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-0.5">
              <button
                onClick={navigatePrev}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={navigateNext}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <h1 className="font-heading text-2xl sm:text-2xl font-semibold text-gray-800">{headerTitle}</h1>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 rounded-lg border border-gray-200 font-body text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors min-h-[36px]"
          >
            Today
          </button>
        </div>

        {/* Row 2+3 on mobile / Right on desktop: toggles + Add Event */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Row 2 on mobile: By Type/Patient + Month/Week toggles (centered) */}
          <div className="flex items-center justify-center sm:justify-start gap-2">
            {/* Color mode toggle */}
            <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
              {[{ val: 'type', label: 'By Type' }, { val: 'patient', label: 'By Patient' }].map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setColorMode(val)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-body text-[11px] sm:text-xs font-semibold transition-all min-h-[32px] sm:min-h-[36px] ${
                    colorMode === val
                      ? 'bg-white text-primary shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Month / Week toggle */}
            <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
              {['month', 'week'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-body text-[11px] sm:text-xs font-semibold capitalize transition-all min-h-[32px] sm:min-h-[36px] ${
                    view === v
                      ? 'bg-white text-primary shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3 on mobile: Add Event (full width) */}
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm min-h-[36px]"
          >
            <Plus size={15} />
            Add Event
          </button>
        </div>
      </div>

      {/* ── Type legend (Color by Type mode) ── */}
      {colorMode === 'type' && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 px-1">
          {[
            { label: 'Doctor Appointment', color: '#4F7EE0' },
            { label: 'Patient Meeting',    color: '#A671AA' },
            { label: 'Family Meeting',     color: '#22C55E' },
            { label: 'SBHA General Event', color: '#F59E0B' },
            { label: 'Other',              color: '#9CA3AF' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="font-body text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Patient legend (Color by Patient mode) ── */}
      {colorMode === 'patient' && patientsWithAppts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 px-1">
          {patientsWithAppts.map(p => {
            const c = patientColorMap[p.id] || GRAY_COLOR
            return (
              <div key={p.id} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.text }}
                />
                <span className="font-body text-xs text-gray-500">
                  {p.first_name} {p.last_name}
                </span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-300" />
            <span className="font-body text-xs text-gray-400">No patient</span>
          </div>
        </div>
      )}

      {/* ── Month View ── */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {[['Sun','S'],['Mon','M'],['Tue','T'],['Wed','W'],['Thu','T'],['Fri','F'],['Sat','S']].map(([full, short]) => (
              <div key={full} className="py-2 sm:py-2.5 text-center font-body text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <span className="hidden sm:inline">{full}</span>
                <span className="sm:hidden">{short}</span>
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
            {getMonthDays().map(day => {
              const dayAppts = getApptsForDay(day)
              const inMonth = isSameMonth(day, currentDate)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[60px] sm:min-h-[110px] p-1 sm:p-1.5 ${!inMonth ? 'bg-gray-50/60' : ''}`}
                >
                  <button
                    onClick={() => dayAppts.length > 0 ? setDayModal({ day, appts: dayAppts }) : null}
                    className={`w-5 h-5 sm:w-7 sm:h-7 mb-0.5 sm:mb-1 flex items-center justify-center rounded-full font-body text-xs sm:text-sm font-medium transition-colors ${
                      today ? 'bg-primary text-white' : inMonth ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                  <div className="space-y-0.5">
                    {dayAppts.slice(0, 2).map(appt => {
                      const c = getApptColor(appt)
                      return (
                        <button
                          key={appt.id}
                          onClick={() => setApptModal(appt)}
                          className="w-full text-left rounded px-1 sm:px-1.5 py-0.5 font-body text-[9px] sm:text-[11px] leading-tight truncate transition-opacity hover:opacity-75"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          <span className="font-semibold inline-flex items-center gap-0.5">
                            {appt.is_recurring && <Repeat size={8} className="flex-shrink-0 opacity-70" />}
                            <span className="truncate">{appt.title}</span>
                          </span>
                          <span className="hidden sm:inline opacity-70">
                            {appt.patients && ` · ${appt.patients.first_name} ${appt.patients.last_name}`}
                          </span>
                        </button>
                      )
                    })}
                    {dayAppts.length > 2 && (
                      <button
                        onClick={() => setDayModal({ day, appts: dayAppts })}
                        className="font-body text-[9px] sm:text-[10px] text-primary/70 hover:text-primary pl-1 sm:pl-1.5 transition-colors"
                      >
                        +{dayAppts.length - 2} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Week View ── */}
      {view === 'week' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <div style={{ minWidth: '560px' }}>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 divide-x divide-gray-50">
            {weekDays.map(day => {
              const today = isToday(day)
              return (
                <div key={day.toISOString()} className="py-3 flex flex-col items-center gap-1">
                  <span className="font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {format(day, 'EEE')}
                  </span>
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-body text-sm font-semibold ${
                    today ? 'bg-primary text-white' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Appointment columns */}
          <div className="grid grid-cols-7 divide-x divide-gray-50 min-h-[480px]">
            {weekDays.map(day => {
              const dayAppts = getApptsForDay(day)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`p-2 space-y-1.5 ${today ? 'bg-primary-light/20' : ''}`}
                >
                  {dayAppts.length === 0 && (
                    <div className="flex items-start justify-center pt-6">
                      <span className="font-body text-xs text-gray-200">—</span>
                    </div>
                  )}
                  {dayAppts.map(appt => {
                    const c = getTypeColor(appt.appointment_type)
                    return (
                      <button
                        key={appt.id}
                        onClick={() => setApptModal(appt)}
                        className="w-full text-left rounded-lg p-2 transition-opacity hover:opacity-75"
                        style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.text}` }}
                      >
                        <p className="font-body text-[11px] font-semibold leading-snug" style={{ color: c.text }}>
                          {format(parseApptDateLocal(appt.appointment_date), 'h:mm a')}
                        </p>
                        <p className="font-body text-[11px] text-gray-700 leading-snug truncate mt-0.5 flex items-center gap-1">
                          {appt.is_recurring && <Repeat size={9} className="flex-shrink-0 text-gray-400" />}
                          {appt.title}
                        </p>
                        {appt.patients && (
                          <p className="font-body text-[10px] text-gray-400 truncate mt-0.5">
                            {appt.patients.first_name} {appt.patients.last_name}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          </div>
          </div>
        </div>
      )}

      {/* ── Day Events Modal ── */}
      {dayModal && (
        <DayModal
          day={dayModal.day}
          appts={dayModal.appts}
          onClose={() => setDayModal(null)}
          onOpenAppt={appt => { setDayModal(null); setApptModal(appt) }}
          getApptColor={getApptColor}
        />
      )}

      {/* ── Appointment Detail Modal ── */}
      {apptModal && (
        <ApptDetailModal
          appt={apptModal}
          onClose={() => setApptModal(null)}
          onUpdate={updateAppt}
          onDelete={deleteAppt}
          onViewPatient={pid => navigate(`/patients/${pid}`)}
          saving={savingApptUpdate}
          patients={patients}
        />
      )}

      {/* ── Add Event Modal ── */}
      {showAddModal && (
        <AddEventModal
          onClose={() => setShowAddModal(false)}
          onSave={saveEvent}
          saving={savingEvent}
          defaultDate={currentDate}
          patients={patients}
        />
      )}
    </div>
  )
}

// ── ICS generator ──────────────────────────────────────────────────────────────
function generateICS(appt) {
  const start = parseISO(appt.appointment_date.slice(0, 16))
  const end   = new Date(start.getTime() + 60 * 60 * 1000)
  const pad   = n => String(n).padStart(2, '0')
  const fmtDT = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const esc   = s => (s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')

  const descParts = []
  if (appt.patients) descParts.push(`Patient: ${appt.patients.first_name} ${appt.patients.last_name}`)
  if (appt.notes)    descParts.push(appt.notes)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//South Bay Health Advocates//Care Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@sbha`,
    `DTSTAMP:${fmtDT(new Date())}`,
    `DTSTART:${fmtDT(start)}`,
    `DTEND:${fmtDT(end)}`,
    `SUMMARY:${esc(appt.title || 'Appointment')}`,
    appt.location ? `LOCATION:${esc(appt.location)}` : null,
    descParts.length ? `DESCRIPTION:${esc(descParts.join('\n'))}` : null,
    'ORGANIZER;CN=South Bay Health Advocates:mailto:noreply@sbha.org',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${(appt.title || 'Appointment').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── DayModal ────────────────────────────────────────────────────────────────────
function DayModal({ day, appts, onClose, onOpenAppt, getApptColor }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-heading text-xl font-semibold text-gray-800">
              {format(day, 'EEEE, MMMM d')}
            </h2>
            <p className="font-body text-xs text-gray-400 mt-0.5">
              {appts.length} event{appts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable event list */}
        <div className="overflow-y-auto flex-1 px-3 py-3 pb-6 sm:pb-3">
          <div className="space-y-1">
            {appts.map(appt => {
              const c = getApptColor(appt)
              return (
                <button
                  key={appt.id}
                  onClick={() => onOpenAppt(appt)}
                  className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-3"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.text }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-body text-sm font-semibold text-gray-800 truncate flex items-center gap-1">
                        {appt.is_recurring && <Repeat size={10} className="opacity-40 flex-shrink-0" />}
                        {appt.title}
                      </span>
                      {appt.appointment_type && (
                        <span
                          className="font-body text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {appt.appointment_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-body text-xs text-gray-400">
                        {format(parseApptDateLocal(appt.appointment_date), 'h:mm a')}
                      </span>
                      {appt.patients && (
                        <span className="font-body text-xs text-gray-400">
                          · {appt.patients.first_name} {appt.patients.last_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── ApptDetailModal ─────────────────────────────────────────────────────────────
function ApptDetailModal({ appt, onClose, onUpdate, onDelete, onViewPatient, saving, patients }) {
  const [mode, setMode] = useState('view')
  const [draft, setDraft] = useState({ ...appt })
  const knownTypes = APPT_TYPES.slice(0, -1)
  const initIsOther = !!appt.appointment_type && !knownTypes.includes(appt.appointment_type)
  const [typeIsOther, setTypeIsOther] = useState(initIsOther)
  const [otherTypeText, setOtherTypeText] = useState(initIsOther ? appt.appointment_type : '')
  const [seriesPrompt, setSeriesPrompt] = useState(null) // null | 'edit' | 'delete'
  const [editScope, setEditScope] = useState('one') // 'one' | 'future'

  useEffect(() => {
    setDraft({ ...appt })
    const isOther = !!appt.appointment_type && !knownTypes.includes(appt.appointment_type)
    setTypeIsOther(isOther)
    setOtherTypeText(isOther ? appt.appointment_type : '')
    setMode('view')
    setSeriesPrompt(null)
    setEditScope('one')
  }, [appt.id])

  function handleEditClick() {
    if (appt.is_recurring) setSeriesPrompt('edit')
    else setMode('edit')
  }

  function handleDeleteClick() {
    if (appt.is_recurring) setSeriesPrompt('delete')
    else onDelete(appt.id, 'one')
  }

  function handleSave() {
    const finalType = typeIsOther ? otherTypeText.trim() : draft.appointment_type
    const { patients: _p, created_at: _ca, ...fields } = draft
    onUpdate(appt.id, { ...fields, appointment_type: finalType || null }, editScope)
  }

  const typeColor = appt.appointment_type ? getTypeColor(appt.appointment_type) : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[560px] flex flex-col overflow-hidden max-h-[95vh] sm:max-h-none">

        {mode === 'view' ? (
          <>
            <div className="flex items-start gap-4 px-7 pt-6 pb-5">
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-2xl font-semibold text-gray-800 leading-snug">
                  {appt.title || 'Appointment'}
                </h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {typeColor && (
                    <span
                      className="inline-flex px-2.5 py-0.5 rounded-full font-body text-[10px] font-semibold border"
                      style={{ backgroundColor: typeColor.bg, color: typeColor.text, borderColor: typeColor.border }}
                    >
                      {appt.appointment_type}
                    </span>
                  )}
                  {appt.is_recurring && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-body text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                      <Repeat size={9} /> Recurring
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button onClick={handleEditClick} title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors">
                  <Edit3 size={15} />
                </button>
                <button onClick={handleDeleteClick} title="Delete"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
                <button onClick={onClose} title="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="px-7 pt-5 pb-20 sm:pb-5 space-y-4 border-t border-gray-100 overflow-y-auto flex-1">
              {appt.appointment_date && (
                <div>
                  <p className="label">Date &amp; Time</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">
                    {format(parseApptDateLocal(appt.appointment_date), 'MMMM d, yyyy')}
                    <span className="text-gray-400 mx-1.5">·</span>
                    {format(parseApptDateLocal(appt.appointment_date), 'h:mm a')}
                  </p>
                </div>
              )}
              {appt.patients && (
                <div>
                  <p className="label">Patient</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">
                    {appt.patients.first_name} {appt.patients.last_name}
                  </p>
                </div>
              )}
              {appt.provider && (
                <div>
                  <p className="label">Provider</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">{appt.provider}</p>
                </div>
              )}
              {appt.location && (
                <div>
                  <p className="label">Location</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">{appt.location}</p>
                </div>
              )}
              {appt.notes && (
                <div>
                  <p className="label">Notes</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5 leading-relaxed whitespace-pre-line">{appt.notes}</p>
                </div>
              )}
              {!appt.appointment_date && !appt.patients && !appt.provider && !appt.location && !appt.notes && (
                <p className="font-body text-sm text-gray-400 italic">No additional details.</p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-7 pt-4 pb-8 sm:py-5 border-t border-gray-100 flex-shrink-0">
              {appt.patient_id && (
                <button
                  onClick={() => onViewPatient(appt.patient_id)}
                  className="btn-primary flex items-center justify-center gap-2 py-2.5 px-5 text-sm w-full sm:w-auto sm:flex-1"
                >
                  <ExternalLink size={13} />
                  View Patient Profile
                </button>
              )}
              <button
                onClick={() => generateICS(appt)}
                className="btn-ghost flex items-center justify-center gap-2 py-2.5 px-5 text-sm w-full sm:w-auto"
                title="Sync to Calendar"
              >
                <CalendarPlus size={13} />
                Sync to Calendar
              </button>
              <button onClick={onClose} className="btn-ghost py-2.5 px-5 text-sm w-full sm:w-auto">Close</button>
            </div>

            {/* Series scope prompt — slides up as an overlay when triggered */}
            {seriesPrompt && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 rounded-t-2xl sm:rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center mb-4">
                  <Repeat size={18} className="text-primary" />
                </div>
                <p className="font-heading text-xl font-semibold text-gray-800 mb-1 text-center">
                  {seriesPrompt === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
                </p>
                <p className="font-body text-sm text-gray-400 mb-6 text-center">
                  This event is part of a recurring series.
                </p>
                <div className="w-full space-y-2 max-w-xs">
                  <button
                    onClick={() => {
                      if (seriesPrompt === 'edit') { setEditScope('one'); setMode('edit'); setSeriesPrompt(null) }
                      else { onDelete(appt.id, 'one') }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    Just this event
                  </button>
                  <button
                    onClick={() => {
                      if (seriesPrompt === 'edit') { setEditScope('future'); setMode('edit'); setSeriesPrompt(null) }
                      else { onDelete(appt.id, 'future') }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl font-body text-sm font-semibold transition-colors text-left ${
                      seriesPrompt === 'delete'
                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        : 'bg-primary-light text-primary border border-primary/20 hover:bg-primary/20'
                    }`}
                  >
                    This and all future events
                  </button>
                  <button
                    onClick={() => setSeriesPrompt(null)}
                    className="w-full px-4 py-2 font-body text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-heading text-xl font-semibold text-gray-800">Edit Appointment</h2>
                {editScope === 'future' && (
                  <p className="font-body text-xs text-primary mt-0.5 flex items-center gap-1">
                    <Repeat size={10} /> Editing this and all future events
                  </p>
                )}
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-7 pt-5 pb-20 sm:pb-5 space-y-3.5 overflow-y-auto flex-1">
              <div>
                <label className="label">Title *</label>
                <input className="input mt-1" value={draft.title || ''} autoFocus
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input mt-1"
                  value={typeIsOther ? 'Other' : (draft.appointment_type || '')}
                  onChange={e => {
                    if (e.target.value === 'Other') { setTypeIsOther(true); setDraft(d => ({ ...d, appointment_type: '' })) }
                    else { setTypeIsOther(false); setOtherTypeText(''); setDraft(d => ({ ...d, appointment_type: e.target.value })) }
                  }}>
                  <option value="">Select type…</option>
                  {APPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {typeIsOther && (
                  <input className="input mt-1.5" placeholder="Describe the type…" value={otherTypeText}
                    onChange={e => setOtherTypeText(e.target.value)} />
                )}
              </div>
              <div>
                <label className="label">Date &amp; Time</label>
                <input type="datetime-local" className="input mt-1"
                  value={draft.appointment_date ? draft.appointment_date.slice(0, 16) : ''}
                  onChange={e => setDraft(d => ({ ...d, appointment_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">
                  Assign to Patient <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <select className="input mt-1" value={draft.patient_id || ''}
                  onChange={e => setDraft(d => ({ ...d, patient_id: e.target.value || null }))}>
                  <option value="">No patient assigned</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Provider</label>
                <input className="input mt-1" placeholder="Provider name" value={draft.provider || ''}
                  onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))} />
              </div>
              <div>
                <label className="label">Location</label>
                <input className="input mt-1" placeholder="Location" value={draft.location || ''}
                  onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input mt-1 resize-none" rows={3} value={draft.notes || ''}
                  onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2.5 px-7 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setMode('view')} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !draft.title?.trim() || !draft.appointment_date}
                className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── AddEventModal ───────────────────────────────────────────────────────────────
function AddEventModal({ onClose, onSave, saving, defaultDate, patients }) {
  const defaultDateStr = format(defaultDate, "yyyy-MM-dd'T'09:00")
  const [draft, setDraft] = useState({
    title: '',
    appointment_type: '',
    appointment_date: defaultDateStr,
    patient_id: '',
    provider: '',
    location: '',
    notes: '',
  })
  const [typeIsOther, setTypeIsOther] = useState(false)
  const [otherTypeText, setOtherTypeText] = useState('')

  // Recurring state
  const [recurEnabled, setRecurEnabled] = useState(false)
  const [recurFreq, setRecurFreq] = useState('weekly')
  const [recurWeekDays, setRecurWeekDays] = useState(() => [getDay(defaultDate)])
  const [recurEndType, setRecurEndType] = useState('count')
  const [recurCount, setRecurCount] = useState(10)
  const [recurEndDate, setRecurEndDate] = useState('')

  function toggleWeekDay(d) {
    setRecurWeekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function handleSave() {
    const finalType = typeIsOther ? otherTypeText.trim() : draft.appointment_type
    const recur = recurEnabled
      ? { enabled: true, freq: recurFreq, weekDays: recurWeekDays, endType: recurEndType, count: recurCount, endDate: recurEndDate }
      : { enabled: false }
    onSave({ ...draft, appointment_type: finalType || null, patient_id: draft.patient_id || null, recur })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">

        {/* Header — always visible */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-heading text-xl font-semibold text-gray-800">Add Event</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-6 pt-5 pb-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="Event title" value={draft.title} autoFocus
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={typeIsOther ? 'Other' : draft.appointment_type}
              onChange={e => {
                if (e.target.value === 'Other') { setTypeIsOther(true); setDraft(d => ({ ...d, appointment_type: '' })) }
                else { setTypeIsOther(false); setOtherTypeText(''); setDraft(d => ({ ...d, appointment_type: e.target.value })) }
              }}>
              <option value="">Select type…</option>
              {APPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {typeIsOther && (
              <input className="input mt-1.5" placeholder="Describe the type…" value={otherTypeText}
                onChange={e => setOtherTypeText(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Date &amp; Time</label>
            <input type="datetime-local" className="input" value={draft.appointment_date}
              onChange={e => setDraft(d => ({ ...d, appointment_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">
              Assign to Patient <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select className="input" value={draft.patient_id}
              onChange={e => setDraft(d => ({ ...d, patient_id: e.target.value }))}>
              <option value="">No patient assigned</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Provider</label>
            <input className="input" placeholder="Provider name" value={draft.provider}
              onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" placeholder="Location" value={draft.location}
              onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={3} placeholder="Additional notes…" value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
          </div>

          {/* Repeat section */}
          <div className="pt-1 border-t border-gray-100">
            <div className="flex items-center justify-between py-1">
              <label className="label mb-0 flex items-center gap-1.5">
                <Repeat size={13} className="text-gray-400" /> Repeat
              </label>
              <button
                type="button"
                onClick={() => setRecurEnabled(e => !e)}
                className="flex items-center transition-colors"
              >
                {recurEnabled
                  ? <ToggleRight size={24} className="text-primary" />
                  : <ToggleLeft size={24} className="text-gray-300" />}
              </button>
            </div>

            {recurEnabled && (
              <div className="mt-2 space-y-3 bg-gray-50 rounded-xl p-3">
                {/* Frequency */}
                <div>
                  <label className="label text-[11px]">Frequency</label>
                  <select className="input mt-0.5 text-sm" value={recurFreq} onChange={e => setRecurFreq(e.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Weekly: day-of-week checkboxes */}
                {recurFreq === 'weekly' && (
                  <div>
                    <label className="label text-[11px]">On these days</label>
                    <div className="flex gap-1.5 mt-1.5">
                      {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleWeekDay(i)}
                          className={`w-8 h-8 rounded-full font-body text-[11px] font-semibold transition-colors ${
                            recurWeekDays.includes(i)
                              ? 'bg-primary text-white'
                              : 'bg-white text-gray-500 border border-gray-200 hover:border-primary/40'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monthly: informational */}
                {recurFreq === 'monthly' && draft.appointment_date && (
                  <p className="font-body text-xs text-gray-500">
                    On day {format(parseISO(draft.appointment_date.slice(0, 10)), 'd')} of every month
                  </p>
                )}

                {/* End condition */}
                <div>
                  <label className="label text-[11px]">Ends</label>
                  <select className="input mt-0.5 text-sm" value={recurEndType} onChange={e => setRecurEndType(e.target.value)}>
                    <option value="count">After X occurrences</option>
                    <option value="date">On a date</option>
                    <option value="never">Never (max 2 years)</option>
                  </select>
                  {recurEndType === 'count' && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        type="number" min={1} max={500} className="input w-20 text-sm"
                        value={recurCount}
                        onChange={e => setRecurCount(Number(e.target.value))}
                      />
                      <span className="font-body text-sm text-gray-500">occurrences</span>
                    </div>
                  )}
                  {recurEndType === 'date' && (
                    <input type="date" className="input mt-1.5 text-sm" value={recurEndDate}
                      onChange={e => setRecurEndDate(e.target.value)} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — always visible */}
        <div className="flex gap-2 px-6 pt-4 pb-6 sm:pb-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !draft.title?.trim() || !draft.appointment_date || (recurEnabled && recurFreq === 'weekly' && recurWeekDays.length === 0)}
            className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : recurEnabled ? 'Add Recurring Event' : 'Add Event'}
          </button>
        </div>

      </div>
    </div>
  )
}
