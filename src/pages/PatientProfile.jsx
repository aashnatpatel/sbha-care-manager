import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears } from 'date-fns'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  User,
  Pill,
  Activity,
  Stethoscope,
  Users,
  Calendar,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Edit3,
  Clock,
  Shield,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function PatientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [patient, setPatient] = useState(null)
  const [conditions, setConditions] = useState([])
  const [medications, setMedications] = useState([])
  const [providers, setProviders] = useState([])
  const [caretakers, setCaretakers] = useState([])
  const [appointments, setAppointments] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Note input
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // New appointment
  const [showApptForm, setShowApptForm] = useState(false)
  const [newAppt, setNewAppt] = useState({ title: '', provider: '', location: '', appointment_date: '' })

  useEffect(() => {
    loadPatient()
  }, [id])

  async function loadPatient() {
    setLoading(true)
    const [p, c, m, pr, ct, ap, n] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('conditions').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('medications').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('providers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('caretakers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('appointments').select('*').eq('patient_id', id).order('appointment_date'),
      supabase.from('notes').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    ])
    setPatient(p.data)
    setConditions(c.data || [])
    setMedications(m.data || [])
    setProviders(pr.data || [])
    setCaretakers(ct.data || [])
    setAppointments(ap.data || [])
    setNotes(n.data || [])
    setLoading(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    const { data } = await supabase.from('notes').insert({ patient_id: id, content: newNote.trim() }).select().single()
    if (data) setNotes(prev => [data, ...prev])
    setNewNote('')
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function addAppointment() {
    if (!newAppt.title || !newAppt.appointment_date) return
    const { data } = await supabase.from('appointments')
      .insert({ patient_id: id, ...newAppt })
      .select().single()
    if (data) setAppointments(prev => [...prev, data].sort((a, b) =>
      new Date(a.appointment_date) - new Date(b.appointment_date)
    ))
    setNewAppt({ title: '', provider: '', location: '', appointment_date: '' })
    setShowApptForm(false)
  }

  async function generateAISummary() {
    setAiLoading(true)
    setAiSummary('')

    // Build prompt context from patient data
    const conditionsList = conditions.map(c => c.name).join(', ') || 'None listed'
    const medsList = medications.map(m => `${m.name} ${m.dose} ${m.frequency}`).join('; ') || 'None listed'
    const recentNotes = notes.slice(0, 3).map(n => n.content).join(' | ') || 'No recent notes'
    const upcomingAppts = appointments
      .filter(a => new Date(a.appointment_date) >= new Date())
      .slice(0, 3)
      .map(a => `${a.title} on ${format(parseISO(a.appointment_date), 'MMM d')}`)
      .join(', ') || 'None'

    // Generate a contextual summary without an AI API key
    // In production this would call an AI API
    const age = patient?.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : 'unknown age'
    const summary = `${patient?.first_name} ${patient?.last_name} is a ${age}-year-old patient currently managing ${conditionsList}. Current medications include ${medsList}. Recent notes indicate: ${recentNotes}. Upcoming appointments: ${upcomingAppts}. Continue monitoring medication adherence and ensure coordination across care team.`

    // Simulate a brief delay
    await new Promise(r => setTimeout(r, 800))
    setAiSummary(summary)
    setAiLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="p-8 text-center">
        <p className="font-body text-gray-400">Patient not found.</p>
        <button onClick={() => navigate('/')} className="btn-primary mt-4">Back to Dashboard</button>
      </div>
    )
  }

  const age = patient.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : null
  const upcomingAppts = appointments.filter(a => new Date(a.appointment_date) >= new Date())
  const pastAppts = appointments.filter(a => new Date(a.appointment_date) < new Date())

  return (
    <div className="p-8 max-w-7xl">
      {/* Back + Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm font-body text-gray-400 hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          Back to Dashboard
        </button>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-4xl font-semibold text-gray-800">
              {patient.first_name} {patient.last_name}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {age && (
                <span className="font-body text-sm text-gray-500">Age {age}</span>
              )}
              {patient.dob && (
                <span className="font-body text-sm text-gray-400">
                  DOB {format(parseISO(patient.dob), 'MMMM d, yyyy')}
                </span>
              )}
              <span className={`tag ${patient.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                {patient.status}
              </span>
            </div>
          </div>

          {/* AI Briefing button */}
          <button
            onClick={generateAISummary}
            disabled={aiLoading}
            className="flex items-center gap-2 bg-gradient-to-r from-mauve to-primary text-white px-5 py-2.5 rounded-xl font-body text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Sparkles size={15} />
            {aiLoading ? 'Generating...' : 'AI Briefing'}
          </button>
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="mt-4 bg-gradient-to-r from-primary-light to-mauve-light rounded-xl p-4 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <span className="font-body text-xs font-semibold text-primary uppercase tracking-wide">
                AI Briefing
              </span>
            </div>
            <p className="font-body text-sm text-gray-700 leading-relaxed">{aiSummary}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-5">
          {/* Demographics */}
          <ProfileCard title="Demographics" icon={<User size={15} />}>
            <InfoRow icon={<Phone size={13} />} value={patient.phone} placeholder="No phone" />
            <InfoRow icon={<Mail size={13} />} value={patient.email} placeholder="No email" />
            <InfoRow icon={<MapPin size={13} />} value={patient.address} placeholder="No address" />
          </ProfileCard>

          {/* Emergency Contact */}
          {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
            <ProfileCard title="Emergency Contact" icon={<Shield size={15} />} accentColor="mauve">
              <p className="font-body text-sm text-gray-700 font-medium">
                {patient.emergency_contact_name}
                {patient.emergency_contact_relationship && (
                  <span className="text-gray-400 font-normal"> · {patient.emergency_contact_relationship}</span>
                )}
              </p>
              {patient.emergency_contact_phone && (
                <InfoRow icon={<Phone size={13} />} value={patient.emergency_contact_phone} />
              )}
            </ProfileCard>
          )}

          {/* Insurance */}
          <ProfileCard title="Insurance" icon={<Shield size={15} />}>
            {patient.insurance_type && (
              <div className="mb-1">
                <span className="tag bg-primary-light text-primary">{patient.insurance_type}</span>
              </div>
            )}
            {patient.insurance_provider && (
              <p className="font-body text-sm text-gray-600">{patient.insurance_provider}</p>
            )}
            {patient.billing_concerns && (
              <div className="mt-2 p-2.5 bg-amber-50 rounded-lg">
                <p className="font-body text-xs text-amber-700 leading-relaxed">
                  {patient.billing_concerns}
                </p>
              </div>
            )}
            {!patient.insurance_type && !patient.insurance_provider && (
              <p className="font-body text-xs text-gray-400">No insurance info on file</p>
            )}
          </ProfileCard>

          {/* Providers */}
          <ProfileCard title="Care Team" icon={<Stethoscope size={15} />}>
            {providers.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No providers listed</p>
            ) : (
              <div className="space-y-3">
                {providers.map(p => (
                  <div key={p.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <p className="font-body text-sm font-semibold text-gray-700">{p.name}</p>
                    {p.role && (
                      <span className="tag bg-primary-light text-primary text-[10px] mt-0.5">{p.role}</span>
                    )}
                    {p.practice && (
                      <p className="font-body text-xs text-gray-400 mt-0.5">{p.practice}</p>
                    )}
                    {p.phone && (
                      <InfoRow icon={<Phone size={11} />} value={p.phone} small />
                    )}
                  </div>
                ))}
              </div>
            )}
          </ProfileCard>
        </div>

        {/* Middle column */}
        <div className="lg:col-span-1 space-y-5">
          {/* Conditions — PROMINENT */}
          <div className="card border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} className="text-primary" />
              <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Conditions
              </h3>
            </div>
            {conditions.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No conditions listed</p>
            ) : (
              <div className="space-y-1.5">
                {conditions.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-body text-sm font-medium text-gray-700">{c.name}</p>
                      {c.notes && <p className="font-body text-xs text-gray-400">{c.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Medications — PROMINENT */}
          <div className="card border-l-4 border-l-mauve">
            <div className="flex items-center gap-2 mb-3">
              <Pill size={15} className="text-mauve" />
              <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Medications
              </h3>
            </div>
            {medications.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No medications listed</p>
            ) : (
              <div className="space-y-2">
                {medications.map(m => (
                  <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="font-body text-sm font-semibold text-gray-700">{m.name}</p>
                    <p className="font-body text-xs text-gray-500">
                      {[m.dose, m.frequency].filter(Boolean).join(' · ')}
                    </p>
                    {m.concerns && (
                      <p className="font-body text-xs text-amber-600 mt-1">{m.concerns}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Caretakers + Weekly Schedule */}
          <ProfileCard title="Caretakers" icon={<Users size={15} />}>
            {caretakers.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No caretakers listed</p>
            ) : (
              <div className="space-y-4">
                {caretakers.map(ct => (
                  <div key={ct.id}>
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <p className="font-body text-sm font-semibold text-gray-700">{ct.name}</p>
                        {ct.role && (
                          <span className="tag bg-mauve-light text-mauve text-[10px]">{ct.role}</span>
                        )}
                        {ct.phone && (
                          <InfoRow icon={<Phone size={11} />} value={ct.phone} small />
                        )}
                      </div>
                    </div>
                    {/* Weekly grid */}
                    {ct.schedule_days?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-body text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">
                          Schedule
                          {ct.schedule_time && ` · ${ct.schedule_time}`}
                        </p>
                        <div className="flex gap-1">
                          {DAYS.map(day => (
                            <div
                              key={day}
                              className={`flex-1 text-center rounded py-1 text-[10px] font-body font-semibold ${
                                ct.schedule_days.includes(day)
                                  ? 'bg-mauve text-white'
                                  : 'bg-gray-100 text-gray-300'
                              }`}
                            >
                              {day[0]}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ProfileCard>
        </div>

        {/* Right column */}
        <div className="lg:col-span-1 space-y-5">
          {/* Upcoming Appointments */}
          <ProfileCard title="Appointments" icon={<Calendar size={15} />}>
            <div className="space-y-2 mb-3">
              {upcomingAppts.length === 0 ? (
                <p className="font-body text-xs text-gray-400">No upcoming appointments</p>
              ) : (
                upcomingAppts.map(appt => (
                  <div key={appt.id} className="bg-primary-light rounded-lg px-3 py-2">
                    <p className="font-body text-sm font-semibold text-gray-700">{appt.title}</p>
                    <p className="font-body text-xs text-primary font-medium">
                      {format(parseISO(appt.appointment_date), 'MMM d, yyyy · h:mm a')}
                    </p>
                    {appt.provider && (
                      <p className="font-body text-xs text-gray-400">with {appt.provider}</p>
                    )}
                    {appt.location && (
                      <p className="font-body text-xs text-gray-400">{appt.location}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {showApptForm ? (
              <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                <input
                  className="input text-xs py-2"
                  placeholder="Appointment title *"
                  value={newAppt.title}
                  onChange={e => setNewAppt(p => ({ ...p, title: e.target.value }))}
                />
                <input
                  className="input text-xs py-2"
                  type="datetime-local"
                  value={newAppt.appointment_date}
                  onChange={e => setNewAppt(p => ({ ...p, appointment_date: e.target.value }))}
                />
                <input
                  className="input text-xs py-2"
                  placeholder="Provider (optional)"
                  value={newAppt.provider}
                  onChange={e => setNewAppt(p => ({ ...p, provider: e.target.value }))}
                />
                <input
                  className="input text-xs py-2"
                  placeholder="Location (optional)"
                  value={newAppt.location}
                  onChange={e => setNewAppt(p => ({ ...p, location: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button onClick={addAppointment} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
                  <button onClick={() => setShowApptForm(false)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowApptForm(true)}
                className="flex items-center gap-1.5 text-xs font-body text-primary hover:underline"
              >
                <Plus size={12} />
                Add appointment
              </button>
            )}
          </ProfileCard>

          {/* Notes Feed */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} className="text-primary" />
              <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Notes
              </h3>
            </div>

            {/* New note input */}
            <div className="mb-4">
              <textarea
                className="input resize-none text-sm"
                rows={3}
                placeholder="Add a note..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote()
                }}
              />
              <button
                onClick={addNote}
                disabled={savingNote || !newNote.trim()}
                className="btn-primary mt-2 w-full py-2 text-xs disabled:opacity-50"
              >
                {savingNote ? 'Saving...' : 'Add Note'}
              </button>
            </div>

            {/* Notes list */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="font-body text-xs text-gray-400 text-center py-4">No notes yet</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="group bg-gray-50 rounded-xl px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-body text-sm text-gray-700 leading-relaxed flex-1">
                        {note.content}
                      </p>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500 text-gray-300 flex-shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="font-body text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                      <Clock size={9} />
                      {format(parseISO(note.created_at), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileCard({ title, icon, children, accentColor = 'primary' }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className={accentColor === 'mauve' ? 'text-mauve' : 'text-primary'}>{icon}</span>
        <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ icon, value, placeholder, small }) {
  if (!value && !placeholder) return null
  return (
    <div className={`flex items-center gap-1.5 text-gray-500 ${small ? 'mt-0.5' : 'mt-1.5'}`}>
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className={`font-body ${small ? 'text-xs' : 'text-sm'} ${!value ? 'text-gray-300 italic' : ''}`}>
        {value || placeholder}
      </span>
    </div>
  )
}
