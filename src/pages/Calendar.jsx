import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks,
  isSameDay, isSameMonth, isToday, addDays,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, Edit3, Trash2, ExternalLink, CalendarPlus } from 'lucide-react'

const APPT_TYPES = ['Doctor Appointment', 'Patient Meeting', 'Family Meeting', 'SBHA General Event', 'Other']

const APPT_SELECT = 'id, title, appointment_date, appointment_type, patient_id, provider, location, notes, completed, patients(id, first_name, last_name, status, deleted_at)'

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

function parseApptDateLocal(dateStr) {
  if (!dateStr) return new Date(0)
  return parseISO(dateStr.slice(0, 16))
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [view, setView] = useState('month')
  const [colorMode, setColorMode] = useState('type') // 'type' | 'patient'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [apptModal, setApptModal] = useState(null)
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
    const payload = {
      title: draft.title,
      appointment_type: draft.appointment_type || null,
      appointment_date: draft.appointment_date,
      patient_id: draft.patient_id || null,
      provider: draft.provider || null,
      location: draft.location || null,
      notes: draft.notes || null,
    }
    const { data } = await supabase.from('appointments').insert(payload).select(APPT_SELECT).single()
    if (data) {
      const p = data.patients
      const valid = !data.patient_id || !p || (!p.deleted_at && p.status === 'active')
      if (valid) {
        setAppointments(prev =>
          [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
        )
      }
    }
    setSavingEvent(false)
    setShowAddModal(false)
  }

  async function updateAppt(apptId, fields) {
    setSavingApptUpdate(true)
    const { data } = await supabase.from('appointments').update(fields).eq('id', apptId).select(APPT_SELECT).single()
    if (data) {
      setAppointments(prev =>
        prev.map(a => a.id === apptId ? data : a)
          .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
      )
      setApptModal(data)
    }
    setSavingApptUpdate(false)
  }

  async function deleteAppt(apptId) {
    await supabase.from('appointments').delete().eq('id', apptId)
    setAppointments(prev => prev.filter(a => a.id !== apptId))
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
    <div className="p-8 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <button
              onClick={navigatePrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={navigateNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <h1 className="font-heading text-2xl font-semibold text-gray-800">{headerTitle}</h1>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 rounded-lg border border-gray-200 font-body text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Color mode toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
            {[{ val: 'type', label: 'Color by Type' }, { val: 'patient', label: 'Color by Patient' }].map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setColorMode(val)}
                className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold transition-all ${
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
                className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold capitalize transition-all ${
                  view === v
                    ? 'bg-white text-primary shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
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
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2.5 text-center font-body text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {d}
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
                  className={`min-h-[110px] p-1.5 ${!inMonth ? 'bg-gray-50/60' : ''}`}
                >
                  <div className={`w-7 h-7 mb-1 flex items-center justify-center rounded-full font-body text-sm font-medium ${
                    today ? 'bg-primary text-white' : inMonth ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayAppts.slice(0, 3).map(appt => {
                      const c = getApptColor(appt)
                      return (
                        <button
                          key={appt.id}
                          onClick={() => setApptModal(appt)}
                          className="w-full text-left rounded px-1.5 py-0.5 font-body text-[11px] leading-tight truncate transition-opacity hover:opacity-75"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          <span className="font-semibold">{appt.title}</span>
                          {appt.patients && (
                            <span className="opacity-70"> · {appt.patients.first_name} {appt.patients.last_name}</span>
                          )}
                        </button>
                      )
                    })}
                    {dayAppts.length > 3 && (
                      <p className="font-body text-[10px] text-gray-400 pl-1.5">+{dayAppts.length - 3} more</p>
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
                        <p className="font-body text-[11px] text-gray-700 leading-snug truncate mt-0.5">
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

// ── ApptDetailModal ─────────────────────────────────────────────────────────────
function ApptDetailModal({ appt, onClose, onUpdate, onDelete, onViewPatient, saving, patients }) {
  const [mode, setMode] = useState('view')
  const [draft, setDraft] = useState({ ...appt })
  const knownTypes = APPT_TYPES.slice(0, -1)
  const initIsOther = !!appt.appointment_type && !knownTypes.includes(appt.appointment_type)
  const [typeIsOther, setTypeIsOther] = useState(initIsOther)
  const [otherTypeText, setOtherTypeText] = useState(initIsOther ? appt.appointment_type : '')

  useEffect(() => {
    setDraft({ ...appt })
    const isOther = !!appt.appointment_type && !knownTypes.includes(appt.appointment_type)
    setTypeIsOther(isOther)
    setOtherTypeText(isOther ? appt.appointment_type : '')
    setMode('view')
  }, [appt.id])

  function handleSave() {
    const finalType = typeIsOther ? otherTypeText.trim() : draft.appointment_type
    const { patients: _p, created_at: _ca, ...fields } = draft
    onUpdate(appt.id, { ...fields, appointment_type: finalType || null })
  }

  const typeColor = appt.appointment_type ? getTypeColor(appt.appointment_type) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[560px] flex flex-col overflow-hidden">

        {mode === 'view' ? (
          <>
            <div className="flex items-start gap-4 px-7 pt-6 pb-5">
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-2xl font-semibold text-gray-800 leading-snug">
                  {appt.title || 'Appointment'}
                </h2>
                {typeColor && (
                  <span
                    className="inline-flex mt-2 px-2.5 py-0.5 rounded-full font-body text-[10px] font-semibold border"
                    style={{ backgroundColor: typeColor.bg, color: typeColor.text, borderColor: typeColor.border }}
                  >
                    {appt.appointment_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button onClick={() => setMode('edit')} title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors">
                  <Edit3 size={15} />
                </button>
                <button onClick={() => onDelete(appt.id)} title="Delete"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
                <button onClick={onClose} title="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="px-7 pb-5 space-y-4 border-t border-gray-100 pt-5 overflow-y-auto">
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

            <div className="flex items-center gap-3 px-7 py-5 border-t border-gray-100 flex-shrink-0">
              <div className="flex-1">
                {appt.patient_id && (
                  <button
                    onClick={() => onViewPatient(appt.patient_id)}
                    className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
                  >
                    <ExternalLink size={13} />
                    View Patient Profile
                  </button>
                )}
              </div>
              <button
                onClick={() => generateICS(appt)}
                className="btn-ghost flex items-center gap-2 py-2.5 px-5 text-sm flex-shrink-0"
                title="Sync to Calendar"
              >
                <CalendarPlus size={13} />
                Sync to Calendar
              </button>
              <button onClick={onClose} className="btn-ghost py-2.5 px-5 text-sm flex-shrink-0">Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-heading text-xl font-semibold text-gray-800">Edit Appointment</h2>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-7 py-5 space-y-3.5 overflow-y-auto max-h-[60vh]">
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

  function handleSave() {
    const finalType = typeIsOther ? otherTypeText.trim() : draft.appointment_type
    onSave({ ...draft, appointment_type: finalType || null, patient_id: draft.patient_id || null })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-heading text-xl font-semibold text-gray-800">Add Event</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3 overflow-y-auto max-h-[70vh]">
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
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !draft.title?.trim() || !draft.appointment_date}
            className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Event'}
          </button>
        </div>

      </div>
    </div>
  )
}
