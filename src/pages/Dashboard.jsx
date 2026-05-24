import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, isToday, parseISO } from 'date-fns'
import {
  Pin,
  Calendar,
  FileText,
  Plus,
  Clock,
  ChevronRight,
  User,
  Pill,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [inactivePatients, setInactivePatients] = useState([])
  const [pinnedDocs, setPinnedDocs] = useState([])
  const [todayAppts, setTodayAppts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    const [patientsRes, docsRes, apptsRes] = await Promise.all([
      supabase
        .from('patients')
        .select(`
          id, first_name, last_name, dob, status,
          conditions(name),
          notes(content, created_at)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('*')
        .eq('is_pinned', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('*, patients(first_name, last_name)')
        .gte('appointment_date', new Date().toISOString().slice(0, 10))
        .lt('appointment_date', new Date(Date.now() + 86400000).toISOString().slice(0, 10))
        .order('appointment_date'),
    ])

    const allPatients = patientsRes.data || []
    setPatients(allPatients.filter(p => p.status === 'active'))
    setInactivePatients(allPatients.filter(p => p.status !== 'active'))
    setPinnedDocs(docsRes.data || [])
    setTodayAppts(apptsRes.data || [])
    setLoading(false)
  }

  function calcAge(dob) {
    if (!dob) return null
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  }

  function getLastNoteDate(notes) {
    if (!notes?.length) return null
    const sorted = [...notes].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )
    return sorted[0].created_at
  }

  function getStatusNote(notes) {
    if (!notes?.length) return 'No notes yet'
    const sorted = [...notes].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )
    const text = sorted[0].content
    return text.length > 80 ? text.slice(0, 80) + '…' : text
  }

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
        </div>

        {todayAppts.length === 0 ? (
          <div className="card border-gray-50 text-center py-6">
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
                <div className="flex items-center gap-2 w-20 flex-shrink-0">
                  <Clock size={13} className="text-primary" />
                  <span className="font-body text-xs font-semibold text-primary">
                    {format(parseISO(appt.appointment_date), 'h:mm a')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-semibold text-gray-700 truncate">
                    {appt.title}
                  </p>
                  {appt.provider && (
                    <p className="font-body text-xs text-gray-400 truncate">
                      with {appt.provider}
                      {appt.location && ` · ${appt.location}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 font-body flex-shrink-0">
                  <User size={12} />
                  {appt.patients?.first_name} {appt.patients?.last_name}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Patient Cards Grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-primary" />
          <h2 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Active Patients
          </h2>
          <span className="tag bg-primary-light text-primary ml-1">
            {patients.length}
          </span>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {patients.map((patient) => {
              const age = calcAge(patient.dob)
              const lastNote = getLastNoteDate(patient.notes)
              const primaryCondition = patient.conditions?.[0]?.name

              return (
                <div
                  key={patient.id}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                  className="group cursor-pointer rounded-2xl overflow-hidden border border-amber-100 bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                >
                  {/* Folder color tab */}
                  <div className="h-1.5 bg-gradient-to-r from-amber-200 via-orange-100 to-mauve/30" />

                  <div className="p-5">
                    {/* Name + status badge */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-heading text-xl font-semibold text-gray-800 group-hover:text-primary transition-colors leading-tight">
                        {patient.first_name} {patient.last_name}
                      </h3>
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-body text-[10px] font-semibold uppercase tracking-wide border border-green-100">
                        Active
                      </span>
                    </div>

                    {age && (
                      <p className="font-body text-xs text-gray-400 mb-3">Age {age}</p>
                    )}

                    {/* Primary condition */}
                    {primaryCondition ? (
                      <div className="flex items-center gap-1.5 mb-4">
                        <Activity size={11} className="text-mauve flex-shrink-0" />
                        <span className="font-body text-xs text-mauve font-medium truncate">
                          {primaryCondition}
                          {patient.conditions.length > 1 &&
                            ` +${patient.conditions.length - 1} more`}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-4" />
                    )}

                    {/* Footer: last note date */}
                    <div className="flex items-center justify-between pt-3 border-t border-amber-50">
                      {lastNote ? (
                        <span className="font-body text-[11px] text-gray-400 flex items-center gap-1.5">
                          <Clock size={10} />
                          Last note {format(parseISO(lastNote), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        <span className="font-body text-[11px] text-gray-300 italic">No notes yet</span>
                      )}
                      <ChevronRight
                        size={14}
                        className="text-gray-300 group-hover:text-primary transition-colors flex-shrink-0"
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Add patient card */}
            <div
              onClick={() => navigate('/intake')}
              className="card cursor-pointer border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center py-8 hover:border-primary/30 hover:shadow-card-hover transition-all duration-200 min-h-[140px]"
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
            {showInactive ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            <h2 className="font-body text-sm font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">
              Inactive Patients
            </h2>
            <span className="tag bg-gray-100 text-gray-400 ml-1">{inactivePatients.length}</span>
          </button>

          {showInactive && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {inactivePatients.map((patient) => {
                const age = calcAge(patient.dob)
                const lastNote = getLastNoteDate(patient.notes)
                const primaryCondition = patient.conditions?.[0]?.name
                return (
                  <div
                    key={patient.id}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="group cursor-pointer rounded-2xl overflow-hidden border border-gray-100 bg-white opacity-70 hover:opacity-100 shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <div className="h-1.5 bg-gray-200" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-heading text-xl font-semibold text-gray-600 group-hover:text-primary transition-colors leading-tight">
                          {patient.first_name} {patient.last_name}
                        </h3>
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-body text-[10px] font-semibold uppercase tracking-wide border border-gray-200">
                          Inactive
                        </span>
                      </div>
                      {age && <p className="font-body text-xs text-gray-400 mb-3">Age {age}</p>}
                      {primaryCondition ? (
                        <div className="flex items-center gap-1.5 mb-4">
                          <Activity size={11} className="text-gray-400 flex-shrink-0" />
                          <span className="font-body text-xs text-gray-400 truncate">{primaryCondition}</span>
                        </div>
                      ) : <div className="mb-4" />}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                        {lastNote ? (
                          <span className="font-body text-[11px] text-gray-400 flex items-center gap-1.5">
                            <Clock size={10} />
                            Last note {format(parseISO(lastNote), 'MMM d, yyyy')}
                          </span>
                        ) : (
                          <span className="font-body text-[11px] text-gray-300 italic">No notes</span>
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
