import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, isToday, parseISO, isAfter, startOfDay, addDays } from 'date-fns'
import {
  Pin, Calendar, FileText, Plus, Clock,
  ChevronRight, Activity, ChevronDown, ChevronUp, Search, User,
} from 'lucide-react'

const APPT_TYPE_COLORS = {
  'Doctor Appointment': 'bg-blue-50 text-blue-600 border-blue-100',
  'Patient Meeting':    'bg-purple-50 text-purple-600 border-purple-100',
  'Family Meeting':     'bg-amber-50 text-amber-600 border-amber-100',
  'SBHA General Event': 'bg-green-50 text-green-600 border-green-100',
  'Other':              'bg-pink-50 text-pink-600 border-pink-100',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [inactivePatients, setInactivePatients] = useState([])
  const [pinnedDocs, setPinnedDocs] = useState([])
  const [todayAppts, setTodayAppts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingDesc, setEditingDesc] = useState(null) // { id, value }

  useEffect(() => { loadDashboardData() }, [])

  async function loadDashboardData() {
    setLoading(true)
    // Use a 3-day window and filter client-side with isToday() to avoid UTC/local timezone drift
    const windowStart = format(addDays(new Date(), -1), 'yyyy-MM-dd')
    const windowEnd   = format(addDays(new Date(),  2), 'yyyy-MM-dd')

    const [patientsRes, docsRes, apptsRes] = await Promise.all([
      supabase
        .from('patients')
        .select(`*, notes(note_date, created_at), appointments(id, title, appointment_date, completed)`)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('*')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('id, title, appointment_date, appointment_type, patient_id, patients(first_name, last_name)')
        .gte('appointment_date', windowStart)
        .lte('appointment_date', windowEnd)
        .order('appointment_date'),
    ])

    if (patientsRes.error) console.error('[Dashboard] patients query error:', patientsRes.error)
    const allPatients = patientsRes.data || []
    setPatients(allPatients.filter(p => p.status === 'active'))
    setInactivePatients(allPatients.filter(p => p.status !== 'active'))
    setPinnedDocs(docsRes.data || [])
    // Filter server results client-side using local date — fixes UTC offset issues
    setTodayAppts((apptsRes.data || []).filter(a => isToday(parseISO(a.appointment_date))))
    setLoading(false)
  }

  function getLastActivityDate(patient) {
    const dates = (patient.notes || [])
      .map(n => n.note_date || n.created_at)
      .filter(Boolean)
    if (!dates.length) return patient.updated_at || null
    dates.sort((a, b) => new Date(b) - new Date(a))
    return dates[0]
  }

  function getNextAppointment(patient) {
    const now = startOfDay(new Date())
    const upcoming = (patient.appointments || [])
      .filter(a => !a.completed && isAfter(parseISO(a.appointment_date), now))
      .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
    return upcoming[0] || null
  }

  async function saveQuickDescription(patientId, value) {
    await supabase.from('patients').update({ quick_description: value }).eq('id', patientId)
    setPatients(prev => prev.map(p => p.id === patientId ? { ...p, quick_description: value } : p))
    setEditingDesc(null)
  }

  const filteredPatients = searchQuery.trim()
    ? patients.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : patients

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title text-3xl">Dashboard</h1>
          <p className="font-body text-sm text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={() => navigate('/intake')}
          className="btn-primary flex items-center gap-2 py-2.5 px-5"
        >
          <Plus size={16} />
          New Patient
        </button>
      </div>

      {/* Pinned Documents */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Pin size={15} className="text-mauve" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Pinned Documents
          </h2>
        </div>
        {pinnedDocs.length === 0 ? (
          <div
            className="card border-2 border-dashed border-gray-100 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/documents')}
          >
            <FileText size={18} className="text-gray-300" />
            <span className="font-body text-sm text-gray-400">
              Pin frequently accessed documents here — contracts, templates, and more
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {pinnedDocs.map((doc) => (
              <div
                key={doc.id}
                className="card flex items-center gap-3 cursor-pointer hover:shadow-card-hover transition-shadow py-3 px-4"
                onClick={() => navigate('/documents')}
              >
                <div className="w-8 h-8 rounded-lg bg-mauve-light flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-mauve" />
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
        )}
      </section>

      {/* Today's Schedule */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={15} className="text-primary" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Today's Schedule
          </h2>
          <span className="tag bg-primary-light text-primary ml-1">
            {todayAppts.length} appointment{todayAppts.length !== 1 ? 's' : ''}
          </span>
          <button className="ml-auto flex items-center gap-1 font-body text-xs font-medium text-primary hover:text-primary/70 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>

        {todayAppts.length === 0 ? (
          <div className="card text-center py-6 border-gray-50">
            <Calendar size={24} className="text-gray-200 mx-auto mb-2" />
            <p className="font-body text-sm text-gray-400">No appointments scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayAppts.map((appt) => (
              <div
                key={appt.id}
                className="card flex items-center gap-4 py-3.5 cursor-pointer hover:shadow-card-hover transition-shadow"
                onClick={() => navigate(`/patients/${appt.patient_id}`)}
              >
                <div className="flex flex-col items-center w-14 flex-shrink-0">
                  <span className="font-body text-sm font-semibold text-primary leading-none">
                    {format(parseISO(appt.appointment_date), 'h:mm')}
                  </span>
                  <span className="font-body text-[10px] text-gray-400 mt-0.5">
                    {format(parseISO(appt.appointment_date), 'a')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-semibold text-gray-700 truncate">{appt.title}</p>
                  <p className="font-body text-xs text-gray-400 truncate">
                    <User size={10} className="inline mr-1 mb-0.5" />
                    {appt.patients?.first_name} {appt.patients?.last_name}
                  </p>
                </div>
                {appt.appointment_type && (
                  <span className={`tag border text-[10px] flex-shrink-0 ${APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other']}`}>
                    {appt.appointment_type}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Patients */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-primary" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Active Patients
          </h2>
          <span className="tag bg-primary-light text-primary ml-1">{patients.length}</span>
        </div>

        {/* Search bar */}
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

        {patients.length === 0 ? (
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
        ) : filteredPatients.length === 0 ? (
          <div className="card text-center py-8">
            <p className="font-body text-sm text-gray-400">No patients match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredPatients.map((patient) => {
              const lastActivity = getLastActivityDate(patient)
              const nextAppt    = getNextAppointment(patient)

              return (
                <div
                  key={patient.id}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                  className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent hover:border-l-mauve shadow-sm hover:shadow-card-hover transition-all duration-200"
                >
                  <div className="p-5">
                    {/* Name + active badge */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-heading text-xl font-semibold text-gray-800 group-hover:text-primary transition-colors leading-tight">
                        {patient.first_name} {patient.last_name}
                      </h3>
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-body text-[10px] font-semibold uppercase tracking-wide border border-green-100">
                        Active
                      </span>
                    </div>

                    {/* Quick description — editable on click */}
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

                    {/* Next appointment */}
                    <div className="flex items-start gap-1.5 mb-3">
                      <Calendar size={11} className="text-primary mt-0.5 flex-shrink-0" />
                      {nextAppt ? (
                        <span className="font-body text-[11px] text-gray-600 truncate">
                          {format(parseISO(nextAppt.appointment_date), 'MMM d')} · {nextAppt.title}
                        </span>
                      ) : (
                        <span className="font-body text-[11px] text-gray-300 italic">No upcoming appointments</span>
                      )}
                    </div>

                    {/* Footer: last activity */}
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

            {/* Add patient card */}
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

      {/* Inactive Patients */}
      {inactivePatients.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowInactive(p => !p)}
            className="flex items-center gap-2 mb-3 group"
          >
            {showInactive
              ? <ChevronUp size={15} className="text-gray-400" />
              : <ChevronDown size={15} className="text-gray-400" />}
            <h2 className="font-body text-sm font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">
              Inactive Patients
            </h2>
            <span className="tag bg-gray-100 text-gray-400 ml-1">{inactivePatients.length}</span>
          </button>

          {showInactive && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {inactivePatients.map((patient) => {
                const lastActivity = getLastActivityDate(patient)
                const nextAppt    = getNextAppointment(patient)
                return (
                  <div
                    key={patient.id}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="group cursor-pointer rounded-2xl bg-white border border-gray-100 border-l-[3px] border-l-transparent shadow-sm hover:shadow-card-hover opacity-70 hover:opacity-100 transition-all duration-200"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-heading text-xl font-semibold text-gray-600 group-hover:text-primary transition-colors leading-tight">
                          {patient.first_name} {patient.last_name}
                        </h3>
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                          Inactive
                        </span>
                      </div>

                      {patient.quick_description && (
                        <p className="font-body text-xs text-gray-400 mb-3 truncate">
                          {patient.quick_description}
                        </p>
                      )}

                      <div className="flex items-start gap-1.5 mb-3">
                        <Calendar size={11} className="text-gray-300 mt-0.5 flex-shrink-0" />
                        {nextAppt ? (
                          <span className="font-body text-[11px] text-gray-400 truncate">
                            {format(parseISO(nextAppt.appointment_date), 'MMM d')} · {nextAppt.title}
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
                          <span className="font-body text-[11px] text-gray-300 italic">No activity</span>
                        )}
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

    </div>
  )
}
