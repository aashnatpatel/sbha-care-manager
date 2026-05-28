import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format, isToday, parseISO, isAfter, startOfDay, addDays, isSameDay } from 'date-fns'
import {
  Pin, Calendar, FileText, File, Image, Plus, Clock,
  ChevronRight, ChevronLeft, Users, ChevronDown, ChevronUp,
  Search, User, X, Edit3, Trash2, ExternalLink, CalendarPlus,
} from 'lucide-react'

const APPT_TYPES = ['Doctor Appointment', 'Patient Meeting', 'Family Meeting', 'SBHA General Event', 'Other']

function getDocIcon(fileType) {
  if (!fileType) return <File size={14} className="text-gray-500" />
  if (fileType.startsWith('image/')) return <Image size={14} className="text-primary" />
  if (fileType === 'application/pdf') return <FileText size={14} className="text-mauve" />
  return <File size={14} className="text-gray-500" />
}

// Parse appointment datetime as local time — strips tz offset so stored times display as entered
function parseApptDateLocal(dateStr) {
  if (!dateStr) return new Date(0)
  return parseISO(dateStr.slice(0, 16))
}

// Returns the most recent PAST activity timestamp.
// Uses note created_at (not note_date — that's user-specified and often backdated).
// Excludes future appointments so they don't pollute the "last activity" date.
function getMostRecentActivity(patient) {
  const now = Date.now()
  const candidates = [
    // When the note was actually entered in the system (not the user-chosen note_date)
    ...(patient.notes || []).map(n => n.created_at).filter(Boolean),
    // Past appointments only
    ...(patient.appointments || [])
      .map(a => a.appointment_date)
      .filter(d => d && new Date(d.slice(0, 16)).getTime() < now),
    patient.updated_at,
  ].filter(Boolean)
  if (!candidates.length) return null
  // Compare as timestamps to avoid ISO string edge cases
  return candidates.reduce((latest, d) =>
    new Date(d).getTime() > new Date(latest).getTime() ? d : latest
  )
}
const APPT_TYPE_COLORS = {
  'Doctor Appointment': 'bg-blue-50 text-blue-600 border-blue-100',
  'Patient Meeting':    'bg-purple-50 text-purple-600 border-purple-100',
  'Family Meeting':     'bg-amber-50 text-amber-600 border-amber-100',
  'SBHA General Event': 'bg-green-50 text-green-600 border-green-100',
  'Other':              'bg-pink-50 text-pink-600 border-pink-100',
}

const APPT_SELECT = 'id, title, appointment_date, appointment_type, patient_id, provider, location, notes, patients(first_name, last_name)'

export default function Dashboard() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [archivedPatients, setArchivedPatients] = useState([])
  const [deletedPatients, setDeletedPatients] = useState([])
  const [pinnedDocs, setPinnedDocs] = useState([])
  const [viewedAppts, setViewedAppts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPinnedDocs, setShowPinnedDocs] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [confirmPermDelete, setConfirmPermDelete] = useState(null) // patient object | null
  const [searchQuery, setSearchQuery] = useState('')
  const [editingDesc, setEditingDesc] = useState(null) // { id, value }
  const [viewDate, setViewDate] = useState(startOfDay(new Date()))
  const [showAddModal, setShowAddModal] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [apptModal, setApptModal] = useState(null) // null | appt object
  const [savingApptUpdate, setSavingApptUpdate] = useState(false)

  useEffect(() => { loadDashboardData() }, [])
  useEffect(() => { loadApptsForDate(viewDate) }, [viewDate])

  async function loadDashboardData() {
    setLoading(true)
    const [patientsRes, docsRes] = await Promise.all([
      supabase
        .from('patients')
        .select(`*, notes(note_date, created_at), appointments(id, title, appointment_date, completed)`)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('*')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false }),
    ])

    if (patientsRes.error) console.error('[Dashboard] patients query error:', patientsRes.error)
    const allPatients = patientsRes.data || []
    const nonDeleted = allPatients.filter(p => !p.deleted_at)
    const active = nonDeleted.filter(p => p.status === 'active')

    // Debug: log activity dates so we can verify sorting inputs
    console.log('[Dashboard] patient activity dates:')
    active.forEach(p => {
      const d = getMostRecentActivity(p)
      console.log(`  ${p.first_name} ${p.last_name}: ${d ?? 'none'} | notes: ${(p.notes || []).length} | appts: ${(p.appointments || []).length}`)
    })

    active.sort((a, b) => {
      const aMs = getMostRecentActivity(a) ? new Date(getMostRecentActivity(a)).getTime() : 0
      const bMs = getMostRecentActivity(b) ? new Date(getMostRecentActivity(b)).getTime() : 0
      return bMs - aMs // descending: most recent first
    })
    setPatients(active)
    setArchivedPatients(nonDeleted.filter(p => p.status !== 'active'))
    setDeletedPatients(allPatients.filter(p => !!p.deleted_at))
    setPinnedDocs(docsRes.data || [])
    setLoading(false)
  }

  async function loadApptsForDate(date) {
    const windowStart = format(addDays(date, -1), 'yyyy-MM-dd')
    const windowEnd   = format(addDays(date,  2), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('appointments')
      .select(APPT_SELECT)
      .gte('appointment_date', windowStart)
      .lte('appointment_date', windowEnd)
      .order('appointment_date')
    setViewedAppts((data || []).filter(a => isSameDay(parseApptDateLocal(a.appointment_date), date)))
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
      user_id: session.user.id,
    }
    const { data } = await supabase
      .from('appointments')
      .insert(payload)
      .select(APPT_SELECT)
      .single()
    if (data && isSameDay(parseApptDateLocal(data.appointment_date), viewDate)) {
      setViewedAppts(prev =>
        [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
      )
    }
    setSavingEvent(false)
    setShowAddModal(false)
  }

  async function updateAppt(apptId, fields) {
    setSavingApptUpdate(true)
    const { data } = await supabase
      .from('appointments')
      .update(fields)
      .eq('id', apptId)
      .select(APPT_SELECT)
      .single()
    if (data) {
      if (isSameDay(parseApptDateLocal(data.appointment_date), viewDate)) {
        setViewedAppts(prev =>
          prev.map(a => a.id === apptId ? data : a)
            .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
        )
      } else {
        // Moved to a different day — remove from current view
        setViewedAppts(prev => prev.filter(a => a.id !== apptId))
      }
      setApptModal(data)
    }
    setSavingApptUpdate(false)
  }

  async function deleteAppt(apptId) {
    await supabase.from('appointments').delete().eq('id', apptId)
    setViewedAppts(prev => prev.filter(a => a.id !== apptId))
    setApptModal(null)
  }

  function getNextAppointment(patient) {
    const now = startOfDay(new Date())
    const upcoming = (patient.appointments || [])
      .filter(a => !a.completed && isAfter(parseApptDateLocal(a.appointment_date), now))
      .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
    return upcoming[0] || null
  }

  async function saveQuickDescription(patientId, value) {
    const { error } = await supabase
      .from('patients')
      .update({ quick_description: value })
      .eq('id', patientId)
    if (error) console.error('[Dashboard] saveQuickDescription error:', error)
    setPatients(prev => prev.map(p => p.id === patientId ? { ...p, quick_description: value } : p))
    setEditingDesc(null)
  }

  async function reactivatePatient(patient) {
    console.log('[reactivatePatient] Unarchiving patient:', patient.id, patient.first_name, patient.last_name)
    const { error } = await supabase.from('patients').update({ status: 'active', archived_at: null }).eq('id', patient.id)
    if (error) { console.error('[reactivatePatient] Error:', error); return }
    console.log('[reactivatePatient] Success — moving to active list')
    setArchivedPatients(prev => prev.filter(p => p.id !== patient.id))
    setPatients(prev => [...prev, { ...patient, status: 'active', archived_at: null }])
  }

  async function restorePatient(patient) {
    await supabase.from('patients').update({ deleted_at: null }).eq('id', patient.id)
    setDeletedPatients(prev => prev.filter(p => p.id !== patient.id))
    const restored = { ...patient, deleted_at: null }
    if (restored.status === 'active') {
      setPatients(prev => [...prev, restored])
    } else {
      setArchivedPatients(prev => [...prev, restored])
    }
  }

  async function permanentlyDeletePatient(patientId) {
    await supabase.from('patients').delete().eq('id', patientId)
    setDeletedPatients(prev => prev.filter(p => p.id !== patientId))
    setConfirmPermDelete(null)
  }

  const q = searchQuery.trim().toLowerCase()
  const isSearching = !!q
  const filteredActive   = q ? patients.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) : patients
  const filteredArchived = q ? archivedPatients.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) : archivedPatients
  const filteredDeleted  = q ? deletedPatients.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) : deletedPatients

  const isViewingToday = isToday(viewDate)
  const scheduleTitle = isViewingToday
    ? "Today's Schedule"
    : format(viewDate, 'EEEE, MMMM d')

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <h1 className="section-title text-2xl sm:text-3xl">Dashboard</h1>
          <p className="font-body text-xs sm:text-sm text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={() => navigate('/intake')}
          className="btn-primary flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-5 text-sm"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">New Patient</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Pinned Documents */}
      <section className="mb-6 md:mb-8">
        <button
          onClick={() => setShowPinnedDocs(v => !v)}
          className="flex items-center gap-2 mb-3 group"
        >
          {showPinnedDocs
            ? <ChevronDown size={15} className="text-gray-400" />
            : <ChevronRight size={15} className="text-gray-400" />}
          <Pin size={15} className="text-gray-500" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Pinned Documents
          </h2>
          {pinnedDocs.length > 0 && (
            <span className="font-body text-xs text-gray-400">({pinnedDocs.length})</span>
          )}
        </button>
        {showPinnedDocs && pinnedDocs.length === 0 ? (
          <div
            className="card border-2 border-dashed border-gray-100 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/documents')}
          >
            <FileText size={18} className="text-gray-300" />
            <span className="font-body text-sm text-gray-400">
              Pin frequently accessed documents here — contracts, templates, and more
            </span>
          </div>
        ) : showPinnedDocs ? (
          <div className="flex gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
            {pinnedDocs.map((doc) => (
              <div
                key={doc.id}
                className="card flex items-center gap-3 cursor-pointer hover:shadow-card-hover transition-shadow py-3 px-4"
                onClick={() => navigate('/documents')}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  {getDocIcon(doc.file_type)}
                </div>
                <div>
                  <p className="font-body text-sm font-medium text-gray-700">{doc.name}</p>
                  <p className="font-body text-xs text-gray-400">
                    {format(parseISO(doc.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            ))}
            <div
              className="card flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-100 hover:border-primary/30 transition-colors py-3 px-4"
              onClick={() => navigate('/documents')}
            >
              <Plus size={14} className="text-gray-300" />
              <span className="font-body text-sm text-gray-400">Add document</span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Schedule */}
      <section className="mb-6 md:mb-8">
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <Calendar size={15} className="text-primary" />

          <button
            onClick={() => setViewDate(d => startOfDay(addDays(d, -1)))}
            className="p-0.5 text-gray-400 hover:text-primary transition-colors rounded"
            title="Previous day"
          >
            <ChevronLeft size={15} />
          </button>

          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {scheduleTitle}
          </h2>

          <button
            onClick={() => setViewDate(d => startOfDay(addDays(d, 1)))}
            className="p-0.5 text-gray-400 hover:text-primary transition-colors rounded"
            title="Next day"
          >
            <ChevronRight size={15} />
          </button>

          {!isViewingToday && (
            <button
              onClick={() => setViewDate(startOfDay(new Date()))}
              className="font-body text-xs text-primary hover:text-primary/70 transition-colors px-1.5 py-0.5 rounded bg-primary-light"
            >
              Today
            </button>
          )}

          <span className="tag bg-primary-light text-primary ml-1">
            {viewedAppts.length} appointment{viewedAppts.length !== 1 ? 's' : ''}
          </span>

          <button
            onClick={() => setShowAddModal(true)}
            className="ml-auto flex items-center gap-1 font-body text-xs font-medium text-primary hover:text-primary/70 transition-colors"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {viewedAppts.length === 0 ? (
          <div className="card text-center py-6 border-gray-50">
            <Calendar size={24} className="text-gray-200 mx-auto mb-2" />
            <p className="font-body text-sm text-gray-400">
              No appointments scheduled for {isViewingToday ? 'today' : format(viewDate, 'MMMM d')}
            </p>
          </div>
        ) : (() => {
          const blocks = [
            { label: 'Morning',   appts: viewedAppts.filter(a => parseApptDateLocal(a.appointment_date).getHours() < 12) },
            { label: 'Afternoon', appts: viewedAppts.filter(a => { const h = parseApptDateLocal(a.appointment_date).getHours(); return h >= 12 && h < 17 }) },
            { label: 'Evening',   appts: viewedAppts.filter(a => parseApptDateLocal(a.appointment_date).getHours() >= 17) },
          ].filter(b => b.appts.length > 0)
          return (
            <div className="space-y-4">
              {blocks.map(({ label, appts }) => (
                <div key={label}>
                  <p className="font-body text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-0.5">{label}</p>
                  <div className="space-y-2">
                    {appts.map((appt) => (
                      <div
                        key={appt.id}
                        className="card rounded-xl flex items-center gap-4 py-3.5 cursor-pointer hover:shadow-card-hover transition-shadow"
                        onClick={() => setApptModal(appt)}
                      >
                        <div className="flex flex-col items-center w-14 flex-shrink-0">
                          <span className="font-body text-sm font-semibold text-primary leading-none">
                            {format(parseApptDateLocal(appt.appointment_date), 'h:mm')}
                          </span>
                          <span className="font-body text-[10px] text-gray-400 mt-0.5">
                            {format(parseApptDateLocal(appt.appointment_date), 'a')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-semibold text-gray-700 truncate">{appt.title}</p>
                          {appt.patients ? (
                            <p className="font-body text-xs text-gray-400 truncate">
                              <User size={10} className="inline mr-1 mb-0.5" />
                              {appt.patients.first_name} {appt.patients.last_name}
                            </p>
                          ) : appt.location ? (
                            <p className="font-body text-xs text-gray-400 truncate">{appt.location}</p>
                          ) : null}
                        </div>
                        {appt.appointment_type && (
                          <span className={`tag border text-[10px] flex-shrink-0 ${APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other']}`}>
                            {appt.appointment_type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* Active Patients */}
      <section id="patients-section">
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-gray-500" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {isSearching ? 'Search Results' : 'Active Patients'}
          </h2>
          {!isSearching && <span className="tag bg-primary-light text-primary ml-1">{patients.length}</span>}
        </div>

        <div className="relative mb-5">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patients…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-white transition-all"
          />
        </div>

        {isSearching ? (
          filteredActive.length === 0 && filteredArchived.length === 0 && filteredDeleted.length === 0 ? (
            <div className="card text-center py-8">
              <p className="font-body text-sm text-gray-400">No patients match "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredActive.length > 0 && (
                <div>
                  <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active ({filteredActive.length})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredActive.map((patient) => {
                      const lastActivity = getMostRecentActivity(patient)
                      const nextAppt    = getNextAppointment(patient)
                      return (
                        <div
                          key={patient.id}
                          onClick={() => navigate(`/patients/${patient.id}`)}
                          className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover transition-all duration-200"
                        >
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-14 h-14 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0">
                                  {patient.avatar_url
                                    ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                                    : <span className="font-body text-sm font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                                  }
                                </div>
                                <h3 className="font-heading text-2xl font-semibold text-gray-800 group-hover:text-primary transition-colors leading-tight">
                                  {patient.first_name} {patient.last_name}
                                </h3>
                              </div>
                              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-body text-[10px] font-semibold uppercase tracking-wide border border-green-100">
                                Active
                              </span>
                            </div>
                            <p className="font-body text-xs text-gray-500 mb-3 truncate">{patient.quick_description || ''}</p>
                            <div className="flex items-start gap-1.5 mb-3">
                              <Calendar size={11} className="text-primary mt-0.5 flex-shrink-0" />
                              {getNextAppointment(patient) ? (
                                <span className="font-body text-[11px] text-gray-600 truncate">
                                  {format(parseApptDateLocal(getNextAppointment(patient).appointment_date), 'MMM d')} · {getNextAppointment(patient).title}
                                </span>
                              ) : (
                                <span className="font-body text-[11px] text-gray-300 italic">No upcoming appointments</span>
                              )}
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                              {lastActivity ? (
                                <span className="font-body text-[11px] text-gray-400 flex items-center gap-1.5">
                                  <Clock size={10} />
                                  Last activity {format(parseISO(lastActivity), 'MMM d, yyyy')}
                                </span>
                              ) : (
                                <span className="font-body text-[11px] text-gray-300 italic">No activity yet</span>
                              )}
                              <ChevronRight size={14} className="text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {filteredArchived.length > 0 && (
                <div>
                  <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Archived ({filteredArchived.length})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredArchived.map((patient) => (
                      <div
                        key={patient.id}
                        onClick={() => navigate(`/patients/${patient.id}`)}
                        className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover opacity-70 hover:opacity-100 transition-all duration-200"
                      >
                        <div className="px-4 py-3 flex gap-2.5">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
                            {patient.avatar_url
                              ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                              : <span className="font-body text-xs font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-heading text-base font-semibold text-gray-600 group-hover:text-primary transition-colors leading-tight truncate flex-1">
                                {patient.first_name} {patient.last_name}
                              </h3>
                              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                                Archived
                              </span>
                            </div>
                            {patient.quick_description && (
                              <p className="font-body text-xs text-gray-400 truncate mb-1.5">{patient.quick_description}</p>
                            )}
                            <div className="flex items-center justify-between mt-1">
                              {patient.archived_at ? (
                                <p className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                                  <Clock size={10} />
                                  Archived {format(parseISO(patient.archived_at), 'MMM d, yyyy')}
                                </p>
                              ) : <div />}
                              <button
                                onClick={e => { e.stopPropagation(); reactivatePatient(patient) }}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white font-body text-[11px] font-semibold hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-all flex-shrink-0"
                              >
                                Unarchive
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {filteredDeleted.length > 0 && (
                <div>
                  <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Deleted ({filteredDeleted.length})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDeleted.map((patient) => (
                      <div
                        key={patient.id}
                        className="group rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover opacity-60 hover:opacity-100 transition-all duration-200"
                      >
                        <div className="px-4 py-3 flex flex-col gap-3">
                          <div className="flex gap-2.5">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
                              {patient.avatar_url
                                ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                                : <span className="font-body text-xs font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="font-heading text-base font-semibold text-gray-500 group-hover:text-primary transition-colors leading-tight truncate flex-1">
                                  {patient.first_name} {patient.last_name}
                                </h3>
                                <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                                  Deleted
                                </span>
                              </div>
                              {patient.deleted_at && (
                                <p className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                                  <Trash2 size={10} />
                                  Deleted {format(parseISO(patient.deleted_at), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => restorePatient(patient)}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white font-body text-[11px] font-semibold hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-all"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => setConfirmPermDelete(patient)}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-500 bg-white font-body text-[11px] font-semibold hover:bg-red-50 hover:border-red-600 hover:text-red-800 transition-all"
                            >
                              Permanently Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : patients.length === 0 ? (
          <div className="card text-center py-12 border-2 border-dashed border-gray-100">
            <User size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="font-heading text-xl text-gray-400 mb-1">No active patients yet</p>
            <p className="font-body text-sm text-gray-400 mb-4">
              Get started by completing an intake form
            </p>
            <button
              onClick={() => navigate('/intake')}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus size={14} />
              New Patient Intake
            </button>
          </div>
        ) : filteredActive.length === 0 ? (
          <div className="card text-center py-8">
            <p className="font-body text-sm text-gray-400">No patients match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredActive.map((patient) => {
              const lastActivity = getMostRecentActivity(patient)
              const nextAppt    = getNextAppointment(patient)

              return (
                <div
                  key={patient.id}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                  className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover transition-all duration-200"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0">
                          {patient.avatar_url
                            ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                            : <span className="font-body text-sm font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                          }
                        </div>
                        <h3 className="font-heading text-2xl font-semibold text-gray-800 group-hover:text-primary transition-colors leading-tight">
                          {patient.first_name} {patient.last_name}
                        </h3>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-body text-[10px] font-semibold uppercase tracking-wide border border-green-100">
                        Active
                      </span>
                    </div>

                    {/* Quick description — inline editable */}
                    {editingDesc?.id === patient.id ? (
                      <input
                        autoFocus
                        className="w-full font-body text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 mb-3 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10 transition-all"
                        value={editingDesc.value}
                        onChange={e => setEditingDesc({ id: patient.id, value: e.target.value })}
                        onBlur={() => saveQuickDescription(patient.id, editingDesc.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveQuickDescription(patient.id, editingDesc.value)
                          if (e.key === 'Escape') setEditingDesc(null)
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <p
                        className={`font-body text-xs mb-3 truncate cursor-text transition-colors ${
                          patient.quick_description
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-gray-300 italic hover:text-gray-400'
                        }`}
                        onClick={e => {
                          e.stopPropagation()
                          setEditingDesc({ id: patient.id, value: patient.quick_description || '' })
                        }}
                        title="Click to edit"
                      >
                        {patient.quick_description || 'Add a quick note…'}
                      </p>
                    )}

                    <div className="flex items-start gap-1.5 mb-3">
                      <Calendar size={11} className="text-primary mt-0.5 flex-shrink-0" />
                      {nextAppt ? (
                        <span className="font-body text-[11px] text-gray-600 truncate">
                          {format(parseApptDateLocal(nextAppt.appointment_date), 'MMM d')} · {nextAppt.title}
                        </span>
                      ) : (
                        <span className="font-body text-[11px] text-gray-300 italic">No upcoming appointments</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      {lastActivity ? (
                        <span className="font-body text-[11px] text-gray-400 flex items-center gap-1.5">
                          <Clock size={10} />
                          Last activity {format(parseISO(lastActivity), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        <span className="font-body text-[11px] text-gray-300 italic">No activity yet</span>
                      )}
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </div>
              )
            })}

            <div
              onClick={() => navigate('/intake')}
              className="card cursor-pointer border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center py-8 hover:border-primary/30 hover:shadow-card-hover transition-all duration-200 min-h-[180px]"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mb-3">
                <Plus size={20} className="text-primary" />
              </div>
              <p className="font-body text-sm font-medium text-gray-500">New Patient</p>
              <p className="font-body text-xs text-gray-400 mt-0.5">Start intake form</p>
            </div>
          </div>
        )}
      </section>

      {/* Archived Patients */}
      {!isSearching && archivedPatients.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowArchived(p => !p)}
            className="flex items-center gap-2 mb-3 group"
          >
            {showArchived
              ? <ChevronUp size={15} className="text-gray-400" />
              : <ChevronDown size={15} className="text-gray-400" />}
            <h2 className="font-body text-sm font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">
              Archived Patients
            </h2>
            <span className="tag bg-gray-100 text-gray-400 ml-1">{archivedPatients.length}</span>
          </button>

          {showArchived && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedPatients.map((patient) => {
                return (
                  <div
                    key={patient.id}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover opacity-70 hover:opacity-100 transition-all duration-200"
                  >
                    <div className="px-4 py-3 flex gap-2.5">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
                        {patient.avatar_url
                          ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <span className="font-body text-xs font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                        }
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-heading text-base font-semibold text-gray-600 group-hover:text-primary transition-colors leading-tight truncate flex-1">
                            {patient.first_name} {patient.last_name}
                          </h3>
                          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                            Archived
                          </span>
                        </div>
                        {patient.quick_description && (
                          <p className="font-body text-xs text-gray-400 truncate mb-1.5">
                            {patient.quick_description}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          {patient.archived_at ? (
                            <p className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                              <Clock size={10} />
                              Archived {format(parseISO(patient.archived_at), 'MMM d, yyyy')}
                            </p>
                          ) : <div />}
                          <button
                            onClick={e => { e.stopPropagation(); reactivatePatient(patient) }}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white font-body text-[11px] font-semibold hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-all flex-shrink-0"
                          >
                            Unarchive
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Deleted Patients */}
      {!isSearching && deletedPatients.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowDeleted(p => !p)}
            className="flex items-center gap-2 mb-3 group"
          >
            {showDeleted
              ? <ChevronUp size={15} className="text-gray-400" />
              : <ChevronDown size={15} className="text-gray-400" />}
            <h2 className="font-body text-sm font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">
              Deleted Patients
            </h2>
            <span className="tag bg-gray-100 text-gray-400 ml-1">{deletedPatients.length}</span>
          </button>

          {showDeleted && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deletedPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="group rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover opacity-60 hover:opacity-100 transition-all duration-200"
                >
                  <div className="px-4 py-3 flex flex-col gap-3">
                    {/* Avatar + text */}
                    <div className="flex gap-2.5">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
                        {patient.avatar_url
                          ? <img src={patient.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <span className="font-body text-xs font-semibold text-primary select-none">{patient.first_name?.[0]}{patient.last_name?.[0]}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-heading text-base font-semibold text-gray-500 group-hover:text-primary transition-colors leading-tight truncate flex-1">
                            {patient.first_name} {patient.last_name}
                          </h3>
                          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                            Deleted
                          </span>
                        </div>
                        {patient.deleted_at && (
                          <p className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                            <Trash2 size={10} />
                            Deleted {format(parseISO(patient.deleted_at), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => restorePatient(patient)}
                        className="flex-1 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white font-body text-[11px] font-semibold hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-all"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmPermDelete(patient)}
                        className="flex-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-500 bg-white font-body text-[11px] font-semibold hover:bg-red-50 hover:border-red-600 hover:text-red-800 transition-all"
                      >
                        Permanently Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Permanent Delete Confirmation */}
      {confirmPermDelete && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmPermDelete(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-100 p-6 w-full sm:max-w-sm">
            <h3 className="font-heading text-xl text-gray-800 mb-2">Permanently Delete?</h3>
            <p className="font-body text-sm text-gray-500 mb-6">
              This will permanently delete <strong>{confirmPermDelete.first_name} {confirmPermDelete.last_name}</strong> and all their data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPermDelete(null)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => permanentlyDeletePatient(confirmPermDelete.id)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-body text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <AddEventModal
          onClose={() => setShowAddModal(false)}
          onSave={saveEvent}
          saving={savingEvent}
          defaultDate={viewDate}
          patients={patients}
        />
      )}

      {/* Appointment Detail Modal */}
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

// ── ApptDetailModal ────────────────────────────────────────────────────────────
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

  const typeColor = appt.appointment_type
    ? (APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other'])
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[560px] flex flex-col overflow-hidden max-h-[95vh] sm:max-h-none">

        {mode === 'view' ? (
          <>
            {/* View header — title + icon buttons */}
            <div className="flex items-start gap-4 px-7 pt-6 pb-5">
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-2xl font-semibold text-gray-800 leading-snug">
                  {appt.title || 'Appointment'}
                </h2>
                {typeColor && (
                  <span className={`inline-flex mt-2 tag border text-[10px] ${typeColor}`}>
                    {appt.appointment_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button
                  onClick={() => setMode('edit')}
                  title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => onDelete(appt.id)}
                  title="Delete"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={onClose}
                  title="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* View content */}
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
                  <p className="font-body text-sm text-gray-700 mt-0.5 leading-relaxed whitespace-pre-line">
                    {appt.notes}
                  </p>
                </div>
              )}
              {!appt.appointment_date && !appt.patients && !appt.provider && !appt.location && !appt.notes && (
                <p className="font-body text-sm text-gray-400 italic">No additional details.</p>
              )}
            </div>

            {/* View footer */}
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
              <button
                onClick={onClose}
                className="btn-ghost py-2.5 px-5 text-sm flex-shrink-0"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Edit header */}
            <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-heading text-xl font-semibold text-gray-800">Edit Appointment</h2>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Edit fields */}
            <div className="px-7 pt-5 pb-20 sm:pb-5 space-y-3.5 overflow-y-auto flex-1">
              <div>
                <label className="label">Title *</label>
                <input
                  className="input mt-1"
                  value={draft.title || ''}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  className="input mt-1"
                  value={typeIsOther ? 'Other' : (draft.appointment_type || '')}
                  onChange={e => {
                    if (e.target.value === 'Other') {
                      setTypeIsOther(true)
                      setDraft(d => ({ ...d, appointment_type: '' }))
                    } else {
                      setTypeIsOther(false)
                      setOtherTypeText('')
                      setDraft(d => ({ ...d, appointment_type: e.target.value }))
                    }
                  }}
                >
                  <option value="">Select type…</option>
                  {APPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {typeIsOther && (
                  <input
                    className="input mt-1.5"
                    placeholder="Describe the type…"
                    value={otherTypeText}
                    onChange={e => setOtherTypeText(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="label">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={draft.appointment_date ? draft.appointment_date.slice(0, 16) : ''}
                  onChange={e => setDraft(d => ({ ...d, appointment_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">
                  Assign to Patient <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <select
                  className="input mt-1"
                  value={draft.patient_id || ''}
                  onChange={e => setDraft(d => ({ ...d, patient_id: e.target.value || null }))}
                >
                  <option value="">No patient assigned</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Provider</label>
                <input
                  className="input mt-1"
                  placeholder="Provider name"
                  value={draft.provider || ''}
                  onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  className="input mt-1"
                  placeholder="Location"
                  value={draft.location || ''}
                  onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input mt-1 resize-none"
                  rows={3}
                  value={draft.notes || ''}
                  onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Edit footer */}
            <div className="flex gap-2.5 px-7 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setMode('view')} className="btn-ghost flex-1 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.title?.trim() || !draft.appointment_date}
                className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── AddEventModal ──────────────────────────────────────────────────────────────
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden max-h-[95vh] sm:max-h-none">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-heading text-xl font-semibold text-gray-800">Add Event</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-5 pb-20 sm:pb-5 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              placeholder="Event title"
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={typeIsOther ? 'Other' : draft.appointment_type}
              onChange={e => {
                if (e.target.value === 'Other') {
                  setTypeIsOther(true)
                  setDraft(d => ({ ...d, appointment_type: '' }))
                } else {
                  setTypeIsOther(false)
                  setOtherTypeText('')
                  setDraft(d => ({ ...d, appointment_type: e.target.value }))
                }
              }}
            >
              <option value="">Select type…</option>
              {APPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {typeIsOther && (
              <input
                className="input mt-1.5"
                placeholder="Describe the type…"
                value={otherTypeText}
                onChange={e => setOtherTypeText(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">Date &amp; Time</label>
            <input
              type="datetime-local"
              className="input"
              value={draft.appointment_date}
              onChange={e => setDraft(d => ({ ...d, appointment_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Assign to Patient <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              className="input"
              value={draft.patient_id}
              onChange={e => setDraft(d => ({ ...d, patient_id: e.target.value }))}
            >
              <option value="">No patient assigned</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Provider</label>
            <input
              className="input"
              placeholder="Provider name"
              value={draft.provider}
              onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              placeholder="Location"
              value={draft.location}
              onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Additional notes…"
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.title?.trim() || !draft.appointment_date}
            className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Event'}
          </button>
        </div>

      </div>
    </div>
  )
}
