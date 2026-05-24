import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears, isAfter, startOfDay } from 'date-fns'
import {
  ArrowLeft, Phone, Mail, MapPin, User, Pill, Activity, Stethoscope,
  Users, Calendar, FileText, Plus, Sparkles, Trash2, Edit3, Clock,
  Shield, X, Check, ChevronDown, ChevronUp, Target, Paperclip,
  Download, List, ToggleLeft, ToggleRight,
} from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NOTE_TYPES = ['Call Summary', 'Appointment Note', 'Action Item', 'Family Communication', 'General', 'Other']
const NOTE_TYPE_COLORS = {
  'Call Summary':         'bg-blue-50 text-blue-600 border-blue-100',
  'Appointment Note':     'bg-purple-50 text-purple-600 border-purple-100',
  'Action Item':          'bg-amber-50 text-amber-600 border-amber-100',
  'Family Communication': 'bg-green-50 text-green-600 border-green-100',
  'General':              'bg-gray-100 text-gray-500 border-gray-200',
  'Other':                'bg-pink-50 text-pink-600 border-pink-100',
}
const today = format(new Date(), 'yyyy-MM-dd')
function stripHtml(html) { return (html || '').replace(/<[^>]+>/g, '').trim() }

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
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  // AI
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Section editing (demographics / emergency / insurance / goals)
  const [editingSection, setEditingSection] = useState(null)
  const [draftPatient, setDraftPatient] = useState({})
  const [saving, setSaving] = useState(false)

  // Inline item editing
  const [editingItem, setEditingItem] = useState(null) // { type, id, draft }
  const [addingItem, setAddingItem] = useState(null)   // { type, draft }

  // Per-item collapsible notes
  const [expandedItemNotes, setExpandedItemNotes] = useState({})
  const [savingItemNote, setSavingItemNote] = useState(null)

  // Rich notes system
  const [noteModal, setNoteModal] = useState(null) // null | { mode: 'new' } | { mode: 'view', note }
  const [noteFilter, setNoteFilter] = useState('All')
  const [savingNote, setSavingNote] = useState(false)

  // Appointments
  const [showApptForm, setShowApptForm] = useState(false)
  const [showPastAppts, setShowPastAppts] = useState(false)
  const [newAppt, setNewAppt] = useState({ title: '', provider: '', location: '', appointment_date: '' })

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { loadPatient() }, [id])

  async function loadPatient() {
    setLoading(true)
    const [p, c, m, pr, ct, ap, n, docs] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('conditions').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('medications').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('providers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('caretakers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('appointments').select('*').eq('patient_id', id).order('appointment_date'),
      supabase.from('notes').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    ])
    setPatient(p.data)
    setConditions(c.data || [])
    setMedications(m.data || [])
    setProviders(pr.data || [])
    setCaretakers(ct.data || [])
    setAppointments(ap.data || [])
    setNotes(n.data || [])
    setDocuments(docs.data || [])
    setLoading(false)
  }

  // ── Patient section edit ──────────────────────────────────────
  function startEditSection(section) {
    setEditingSection(section)
    setDraftPatient({ ...patient })
  }

  async function saveSection() {
    setSaving(true)
    const { data } = await supabase.from('patients').update(draftPatient).eq('id', id).select().single()
    if (data) setPatient(data)
    setEditingSection(null)
    setSaving(false)
  }

  async function toggleStatus() {
    const next = patient.status === 'active' ? 'inactive' : 'active'
    const { data } = await supabase.from('patients').update({ status: next }).eq('id', id).select().single()
    if (data) setPatient(data)
  }

  // ── Per-item CRUD ─────────────────────────────────────────────
  const TABLE = { conditions: 'conditions', medications: 'medications', providers: 'providers', caretakers: 'caretakers' }
  const SETTER = { conditions: setConditions, medications: setMedications, providers: setProviders, caretakers: setCaretakers }

  function startEditItem(type, item) { setEditingItem({ type, id: item.id, draft: { ...item } }) }

  async function saveItem() {
    if (!editingItem) return
    const { type, id: itemId, draft } = editingItem
    const { data } = await supabase.from(TABLE[type]).update(draft).eq('id', itemId).select().single()
    if (data) SETTER[type](prev => prev.map(x => x.id === itemId ? data : x))
    setEditingItem(null)
  }

  async function deleteItem(type, itemId) {
    await supabase.from(TABLE[type]).delete().eq('id', itemId)
    SETTER[type](prev => prev.filter(x => x.id !== itemId))
  }

  async function saveNewItem() {
    if (!addingItem) return
    const { type, draft } = addingItem
    const { data } = await supabase.from(TABLE[type]).insert({ patient_id: id, ...draft }).select().single()
    if (data) SETTER[type](prev => [...prev, data])
    setAddingItem(null)
  }

  // ── Per-item notes ────────────────────────────────────────────
  async function saveItemNote(type, item, text) {
    const key = `${type}-${item.id}`
    setSavingItemNote(key)
    const { data } = await supabase.from(TABLE[type]).update({ notes: text }).eq('id', item.id).select().single()
    if (data) SETTER[type](prev => prev.map(x => x.id === item.id ? data : x))
    setSavingItemNote(null)
  }

  // ── Rich notes ────────────────────────────────────────────────
  async function refreshNotes() {
    const { data, error } = await supabase
      .from('notes').select('*').eq('patient_id', id).order('created_at', { ascending: false })
    if (error) { console.error('[Notes] refreshNotes error:', error); return }
    console.log('[Notes] refreshNotes first row:', data?.[0])
    setNotes(data || [])
  }

  // Receives explicit field values — no shared form object
  async function saveNote({ title, noteType, customLabel, noteDate, body }) {
    if (!title.trim()) return
    setSavingNote(true)
    const plainBody = stripHtml(body)
    const contentFallback = title.trim() + (plainBody ? ': ' + plainBody : '')
    const fullPayload = {
      patient_id: id,
      content: contentFallback,
      title: title.trim(),
      note_type: noteType,
      custom_type_label: noteType === 'Other' ? customLabel : null,
      note_date: noteDate || today,
      body: body || null,
    }
    console.log('[Notes] saveNote payload:', fullPayload)
    let { data, error } = await supabase.from('notes').insert(fullPayload).select().single()
    console.log('[Notes] saveNote result — data:', data, 'error:', error?.message)
    if (error) {
      // Fallback 1: body column missing — keep title/note_type/note_date
      const { body: _b, ...noBody } = fullPayload
      const r2 = await supabase.from('notes').insert(noBody).select().single()
      console.log('[Notes] saveNote attempt 2:', r2.error ? r2.error.message : 'ok')
      if (!r2.error) { data = r2.data }
      else {
        // Fallback 2: all new columns missing — legacy content-only
        const r3 = await supabase.from('notes').insert({ patient_id: id, content: contentFallback }).select().single()
        console.log('[Notes] saveNote attempt 3 (legacy):', r3.error ? r3.error.message : 'ok')
        if (r3.error) { console.error('[Notes] All inserts failed'); setSavingNote(false); return }
        data = r3.data
        console.warn('[Notes] ⚠️ Legacy mode — run supabase-migrations.sql to persist title/type/body.')
      }
    }
    if (data) await refreshNotes()
    setNoteModal(null)
    setSavingNote(false)
  }

  // Receives explicit field values — no shared form object
  async function updateNote(noteId, { title, noteType, customLabel, noteDate, body }) {
    if (!title.trim()) return
    setSavingNote(true)
    const plainBody = stripHtml(body)
    const contentFallback = title.trim() + (plainBody ? ': ' + plainBody : '')
    const fullPayload = {
      content: contentFallback,
      title: title.trim(),
      note_type: noteType,
      custom_type_label: noteType === 'Other' ? customLabel : null,
      note_date: noteDate || today,
      body: body || null,
    }
    console.log('[Notes] updateNote payload:', fullPayload)
    let { error } = await supabase.from('notes').update(fullPayload).eq('id', noteId)
    console.log('[Notes] updateNote result — error:', error?.message)
    if (error) {
      const { body: _b, ...noBody } = fullPayload
      const r2 = await supabase.from('notes').update(noBody).eq('id', noteId)
      console.log('[Notes] updateNote attempt 2:', r2.error ? r2.error.message : 'ok')
      if (r2.error) {
        const r3 = await supabase.from('notes').update({ content: contentFallback }).eq('id', noteId)
        console.log('[Notes] updateNote attempt 3 (legacy):', r3.error ? r3.error.message : 'ok')
        if (r3.error) { console.error('[Notes] All updates failed'); setSavingNote(false); return }
        console.warn('[Notes] ⚠️ Legacy mode — run supabase-migrations.sql to persist title/type/body.')
      }
    }
    await refreshNotes()
    setNoteModal(null)
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  // ── Appointments ──────────────────────────────────────────────
  async function addAppointment() {
    if (!newAppt.title || !newAppt.appointment_date) return
    const { data } = await supabase.from('appointments').insert({ patient_id: id, ...newAppt }).select().single()
    if (data) setAppointments(prev => [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
    setNewAppt({ title: '', provider: '', location: '', appointment_date: '' })
    setShowApptForm(false)
  }

  async function deleteAppointment(apptId) {
    await supabase.from('appointments').delete().eq('id', apptId)
    setAppointments(prev => prev.filter(a => a.id !== apptId))
  }

  // ── Documents ─────────────────────────────────────────────────
  async function uploadDocument(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingDoc(true)
    const path = `patients/${id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (!error) {
      const { data } = await supabase.from('documents')
        .insert({ patient_id: id, name: file.name, file_url: path, file_type: file.type })
        .select().single()
      if (data) setDocuments(prev => [data, ...prev])
    }
    setUploadingDoc(false)
    e.target.value = ''
  }

  async function downloadDocument(doc) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function deleteDocument(doc) {
    await supabase.storage.from('documents').remove([doc.file_url])
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  // ── AI Briefing ───────────────────────────────────────────────
  async function generateAISummary() {
    setAiLoading(true)
    setAiSummary('')
    const age = patient?.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : 'unknown age'
    const condList = conditions.map(c => c.name).join(', ') || 'None'
    const medList = medications.map(m => [m.name, m.dose, m.frequency].filter(Boolean).join(' ')).join('; ') || 'None'
    const recentNotes = notes.slice(0, 3).map(n => n.title || '').filter(Boolean).join(', ') || 'No recent notes'
    const upcoming = appointments.filter(a => new Date(a.appointment_date) >= new Date()).slice(0, 3)
      .map(a => `${a.title} on ${format(parseISO(a.appointment_date), 'MMM d')}`).join(', ') || 'None'
    await new Promise(r => setTimeout(r, 600))
    setAiSummary(`${patient?.first_name} ${patient?.last_name} is a ${age}-year-old patient managing ${condList}. Current medications: ${medList}. Recent notes: ${recentNotes}. Upcoming appointments: ${upcoming}.`)
    setAiLoading(false)
  }

  // ── Derived ───────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!patient) return (
    <div className="p-8 text-center">
      <p className="font-body text-gray-400">Patient not found.</p>
      <button onClick={() => navigate('/')} className="btn-primary mt-4">Back to Dashboard</button>
    </div>
  )

  const age = patient.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : null
  const now = startOfDay(new Date())
  const upcomingAppts = appointments.filter(a => isAfter(new Date(a.appointment_date), now))
  const pastAppts = [...appointments.filter(a => !isAfter(new Date(a.appointment_date), now))].reverse()
  const filteredNotes = noteFilter === 'All'
    ? notes
    : notes.filter(n => (n.note_type || 'General') === noteFilter)

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-7xl">
      {/* Back */}
      <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm font-body text-gray-400 hover:text-primary transition-colors mb-6">
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      {/* ── HEADER ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-4xl font-semibold text-gray-800">
              {patient.first_name} {patient.last_name}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {age && <span className="font-body text-sm text-gray-500">Age {age}</span>}
              {patient.dob && (
                <span className="font-body text-sm text-gray-400">
                  DOB {format(parseISO(patient.dob), 'MMMM d, yyyy')}
                </span>
              )}
              {patient.client_since && (
                <span className="font-body text-sm text-gray-400">
                  Client since {format(parseISO(patient.client_since), 'MMMM yyyy')}
                </span>
              )}
              <span className={`tag ${patient.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                {patient.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleStatus}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-medium border transition-all ${
                patient.status === 'active'
                  ? 'border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50'
                  : 'border-green-200 text-green-600 bg-green-50 hover:bg-green-100'
              }`}
            >
              {patient.status === 'active' ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
              {patient.status === 'active' ? 'Inactivate Patient' : 'Reactivate Patient'}
            </button>
            <button
              onClick={generateAISummary}
              disabled={aiLoading}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-body text-sm font-semibold shadow-sm hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              <Sparkles size={15} />
              {aiLoading ? 'Generating…' : 'AI Briefing'}
            </button>
          </div>
        </div>

        {aiSummary && (
          <div className="mt-5 bg-gradient-to-r from-primary-light to-mauve-light rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <span className="font-body text-xs font-semibold text-primary uppercase tracking-wide">AI Briefing</span>
            </div>
            <p className="font-body text-sm text-gray-700 leading-relaxed">{aiSummary}</p>
          </div>
        )}
      </div>

      {/* ── THREE-COLUMN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">

        {/* ── LEFT: Demographics / Emergency / Insurance ── */}
        <div className="space-y-6">

          {/* Demographics */}
          <SectionCard
            title="Demographics" icon={<User size={15} />}
            onEdit={() => startEditSection('demographics')}
            editing={editingSection === 'demographics'}
            onSave={saveSection} onCancel={() => setEditingSection(null)} saving={saving}
          >
            {editingSection === 'demographics' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="First Name">
                    <input className="input" value={draftPatient.first_name || ''} onChange={e => setDraftPatient(p => ({ ...p, first_name: e.target.value }))} />
                  </Field>
                  <Field label="Last Name">
                    <input className="input" value={draftPatient.last_name || ''} onChange={e => setDraftPatient(p => ({ ...p, last_name: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Date of Birth">
                  <input type="date" className="input" value={draftPatient.dob || ''} onChange={e => setDraftPatient(p => ({ ...p, dob: e.target.value }))} />
                </Field>
                <Field label="Client Since">
                  <input type="date" className="input" value={draftPatient.client_since || ''} onChange={e => setDraftPatient(p => ({ ...p, client_since: e.target.value }))} />
                </Field>
                <Field label="Phone">
                  <input className="input" value={draftPatient.phone || ''} onChange={e => setDraftPatient(p => ({ ...p, phone: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <input className="input" value={draftPatient.email || ''} onChange={e => setDraftPatient(p => ({ ...p, email: e.target.value }))} />
                </Field>
                <Field label="Address">
                  <input className="input" value={draftPatient.address || ''} onChange={e => setDraftPatient(p => ({ ...p, address: e.target.value }))} />
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                <InfoRow icon={<Phone size={13} />} value={patient.phone} placeholder="No phone" />
                <InfoRow icon={<Mail size={13} />} value={patient.email} placeholder="No email" />
                <InfoRow icon={<MapPin size={13} />} value={patient.address} placeholder="No address" />
              </div>
            )}
          </SectionCard>

          {/* Emergency Contact */}
          <SectionCard
            title="Emergency Contact" icon={<Shield size={15} />} accentColor="mauve"
            onEdit={() => startEditSection('emergency')}
            editing={editingSection === 'emergency'}
            onSave={saveSection} onCancel={() => setEditingSection(null)} saving={saving}
          >
            {editingSection === 'emergency' ? (
              <div className="space-y-3">
                <Field label="Name">
                  <input className="input" value={draftPatient.emergency_contact_name || ''} onChange={e => setDraftPatient(p => ({ ...p, emergency_contact_name: e.target.value }))} />
                </Field>
                <Field label="Relationship">
                  <input className="input" value={draftPatient.emergency_contact_relationship || ''} onChange={e => setDraftPatient(p => ({ ...p, emergency_contact_relationship: e.target.value }))} />
                </Field>
                <Field label="Phone">
                  <input className="input" value={draftPatient.emergency_contact_phone || ''} onChange={e => setDraftPatient(p => ({ ...p, emergency_contact_phone: e.target.value }))} />
                </Field>
              </div>
            ) : (
              <div>
                {patient.emergency_contact_name ? (
                  <>
                    <p className="font-body text-sm text-gray-700 font-medium">
                      {patient.emergency_contact_name}
                      {patient.emergency_contact_relationship && (
                        <span className="text-gray-400 font-normal"> · {patient.emergency_contact_relationship}</span>
                      )}
                    </p>
                    {patient.emergency_contact_phone && (
                      <InfoRow icon={<Phone size={13} />} value={patient.emergency_contact_phone} />
                    )}
                  </>
                ) : (
                  <p className="font-body text-xs text-gray-400">No emergency contact on file</p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Insurance */}
          <SectionCard
            title="Insurance" icon={<Shield size={15} />}
            onEdit={() => startEditSection('insurance')}
            editing={editingSection === 'insurance'}
            onSave={saveSection} onCancel={() => setEditingSection(null)} saving={saving}
          >
            {editingSection === 'insurance' ? (
              <div className="space-y-3">
                <Field label="Insurance Type">
                  <input className="input" value={draftPatient.insurance_type || ''} onChange={e => setDraftPatient(p => ({ ...p, insurance_type: e.target.value }))} />
                </Field>
                <Field label="Insurance Provider">
                  <input className="input" value={draftPatient.insurance_provider || ''} onChange={e => setDraftPatient(p => ({ ...p, insurance_provider: e.target.value }))} />
                </Field>
                <Field label="Billing Concerns">
                  <textarea className="input resize-none" rows={3} value={draftPatient.billing_concerns || ''} onChange={e => setDraftPatient(p => ({ ...p, billing_concerns: e.target.value }))} />
                </Field>
              </div>
            ) : (
              <div>
                {patient.insurance_type && (
                  <div className="mb-2"><span className="tag bg-primary-light text-primary">{patient.insurance_type}</span></div>
                )}
                {patient.insurance_provider && (
                  <p className="font-body text-sm text-gray-600">{patient.insurance_provider}</p>
                )}
                {patient.billing_concerns && (
                  <div className="mt-2.5 p-3 bg-amber-50 rounded-lg">
                    <p className="font-body text-xs text-amber-700 leading-relaxed">{patient.billing_concerns}</p>
                  </div>
                )}
                {!patient.insurance_type && !patient.insurance_provider && (
                  <p className="font-body text-xs text-gray-400">No insurance info on file</p>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── MIDDLE: Goals / Conditions / Medications / Caretakers ── */}
        <div className="space-y-6">

          {/* Goals */}
          <SectionCard
            title="Goals" icon={<Target size={15} />}
            onEdit={() => startEditSection('goals')}
            editing={editingSection === 'goals'}
            onSave={saveSection} onCancel={() => setEditingSection(null)} saving={saving}
          >
            {editingSection === 'goals' ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map(i => (
                  <Field key={i} label={`Goal ${i + 1}`}>
                    <input
                      className="input"
                      placeholder={`Goal ${i + 1}`}
                      value={(draftPatient.top_goals || [])[i] || ''}
                      onChange={e => {
                        const goals = [...(draftPatient.top_goals || ['', '', ''])]
                        goals[i] = e.target.value
                        setDraftPatient(p => ({ ...p, top_goals: goals }))
                      }}
                    />
                  </Field>
                ))}
              </div>
            ) : (
              <div>
                {patient.top_goals?.filter(Boolean).length ? (
                  <ol className="space-y-2.5">
                    {patient.top_goals.filter(Boolean).map((g, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-light text-primary text-[11px] font-body font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <p className="font-body text-sm text-gray-700 leading-snug">{g}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="font-body text-xs text-gray-400">No goals recorded</p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Conditions */}
          <div className="card border-l-4 border-l-primary p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Conditions</h3>
              </div>
              <button
                onClick={() => setAddingItem({ type: 'conditions', draft: { name: '', notes: '' } })}
                className="p-1 text-gray-300 hover:text-primary transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>

            {addingItem?.type === 'conditions' && (
              <ItemForm
                fields={[{ key: 'name', label: 'Condition Name', required: true }, { key: 'notes', label: 'Notes', multiline: true }]}
                draft={addingItem.draft}
                onChange={d => setAddingItem(p => ({ ...p, draft: d }))}
                onSave={saveNewItem} onCancel={() => setAddingItem(null)}
              />
            )}

            {conditions.length === 0 && !addingItem ? (
              <p className="font-body text-xs text-gray-400">No conditions listed</p>
            ) : (
              <div className="space-y-3">
                {conditions.map(c => (
                  <div key={c.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    {editingItem?.type === 'conditions' && editingItem.id === c.id ? (
                      <ItemForm
                        fields={[{ key: 'name', label: 'Condition Name', required: true }, { key: 'notes', label: 'Notes', multiline: true }]}
                        draft={editingItem.draft}
                        onChange={d => setEditingItem(p => ({ ...p, draft: d }))}
                        onSave={saveItem} onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                            <p className="font-body text-sm font-medium text-gray-700">{c.name}</p>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => startEditItem('conditions', c)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                            <button onClick={() => deleteItem('conditions', c.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <ItemNotesField
                          itemKey={`conditions-${c.id}`}
                          notes={c.notes || ''}
                          expanded={!!expandedItemNotes[`conditions-${c.id}`]}
                          onToggle={() => setExpandedItemNotes(p => ({ ...p, [`conditions-${c.id}`]: !p[`conditions-${c.id}`] }))}
                          onSave={text => saveItemNote('conditions', c, text)}
                          saving={savingItemNote === `conditions-${c.id}`}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Medications */}
          <div className="card border-l-4 border-l-mauve p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pill size={15} className="text-mauve" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Medications</h3>
              </div>
              <button
                onClick={() => setAddingItem({ type: 'medications', draft: { name: '', dose: '', frequency: '', concerns: '', notes: '' } })}
                className="p-1 text-gray-300 hover:text-mauve transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>

            {addingItem?.type === 'medications' && (
              <ItemForm
                fields={[
                  { key: 'name', label: 'Medication Name', required: true },
                  { key: 'dose', label: 'Dose' },
                  { key: 'frequency', label: 'Frequency' },
                  { key: 'concerns', label: 'Concerns' },
                ]}
                draft={addingItem.draft}
                onChange={d => setAddingItem(p => ({ ...p, draft: d }))}
                onSave={saveNewItem} onCancel={() => setAddingItem(null)}
              />
            )}

            {medications.length === 0 && !addingItem ? (
              <p className="font-body text-xs text-gray-400">No medications listed</p>
            ) : (
              <div className="space-y-3">
                {medications.map(m => (
                  <div key={m.id} className="bg-gray-50 rounded-xl px-4 py-3">
                    {editingItem?.type === 'medications' && editingItem.id === m.id ? (
                      <ItemForm
                        fields={[
                          { key: 'name', label: 'Medication Name', required: true },
                          { key: 'dose', label: 'Dose' },
                          { key: 'frequency', label: 'Frequency' },
                          { key: 'concerns', label: 'Concerns' },
                        ]}
                        draft={editingItem.draft}
                        onChange={d => setEditingItem(p => ({ ...p, draft: d }))}
                        onSave={saveItem} onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-body text-sm font-semibold text-gray-700">{m.name}</p>
                            {(m.dose || m.frequency) && (
                              <p className="font-body text-xs text-gray-500 mt-0.5">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</p>
                            )}
                            {m.concerns && <p className="font-body text-xs text-amber-600 mt-1">{m.concerns}</p>}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => startEditItem('medications', m)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                            <button onClick={() => deleteItem('medications', m.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <ItemNotesField
                          itemKey={`medications-${m.id}`}
                          notes={m.notes || ''}
                          expanded={!!expandedItemNotes[`medications-${m.id}`]}
                          onToggle={() => setExpandedItemNotes(p => ({ ...p, [`medications-${m.id}`]: !p[`medications-${m.id}`] }))}
                          onSave={text => saveItemNote('medications', m, text)}
                          saving={savingItemNote === `medications-${m.id}`}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Caretakers */}
          <SectionCard
            title="Caretakers" icon={<Users size={15} />}
            addButton={{ onClick: () => setAddingItem({ type: 'caretakers', draft: { name: '', role: '', phone: '', schedule_days: [], schedule_time: '', notes: '' } }) }}
          >
            {addingItem?.type === 'caretakers' && (
              <CaretakerForm
                draft={addingItem.draft}
                onChange={d => setAddingItem(p => ({ ...p, draft: d }))}
                onSave={saveNewItem} onCancel={() => setAddingItem(null)}
              />
            )}
            {caretakers.length === 0 && !addingItem ? (
              <p className="font-body text-xs text-gray-400">No caretakers listed</p>
            ) : (
              <div className="space-y-5">
                {caretakers.map(ct => (
                  <div key={ct.id} className="border-b border-gray-50 pb-5 last:border-0 last:pb-0">
                    {editingItem?.type === 'caretakers' && editingItem.id === ct.id ? (
                      <CaretakerForm
                        draft={editingItem.draft}
                        onChange={d => setEditingItem(p => ({ ...p, draft: d }))}
                        onSave={saveItem} onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-body text-sm font-semibold text-gray-700">{ct.name}</p>
                            {ct.role && <span className="tag bg-mauve-light text-mauve text-[10px] mt-0.5">{ct.role}</span>}
                            {ct.phone && <InfoRow icon={<Phone size={11} />} value={ct.phone} small />}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => startEditItem('caretakers', ct)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                            <button onClick={() => deleteItem('caretakers', ct.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <div>
                          <p className="font-body text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">
                            Schedule{ct.schedule_time && ` · ${ct.schedule_time}`}
                          </p>
                          <div className="flex gap-1">
                            {DAYS.map(day => (
                              <div key={day} className={`flex-1 text-center rounded-md py-1.5 text-[10px] font-body font-semibold ${ct.schedule_days?.includes(day) ? 'bg-mauve text-white' : 'bg-gray-100 text-gray-300'}`}>
                                {day[0]}
                              </div>
                            ))}
                          </div>
                        </div>
                        <ItemNotesField
                          itemKey={`caretakers-${ct.id}`}
                          notes={ct.notes || ''}
                          expanded={!!expandedItemNotes[`caretakers-${ct.id}`]}
                          onToggle={() => setExpandedItemNotes(p => ({ ...p, [`caretakers-${ct.id}`]: !p[`caretakers-${ct.id}`] }))}
                          onSave={text => saveItemNote('caretakers', ct, text)}
                          saving={savingItemNote === `caretakers-${ct.id}`}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── RIGHT: Care Team / Appointments / Documents ── */}
        <div className="space-y-6">

          {/* Care Team */}
          <SectionCard
            title="Care Team" icon={<Stethoscope size={15} />}
            addButton={{ onClick: () => setAddingItem({ type: 'providers', draft: { name: '', role: '', practice: '', phone: '', notes: '' } }) }}
          >
            {addingItem?.type === 'providers' && (
              <ItemForm
                fields={[
                  { key: 'name', label: 'Provider Name', required: true },
                  { key: 'role', label: 'Role (PCP, Cardiologist…)' },
                  { key: 'practice', label: 'Practice' },
                  { key: 'phone', label: 'Phone' },
                ]}
                draft={addingItem.draft}
                onChange={d => setAddingItem(p => ({ ...p, draft: d }))}
                onSave={saveNewItem} onCancel={() => setAddingItem(null)}
              />
            )}
            {providers.length === 0 && !addingItem ? (
              <p className="font-body text-xs text-gray-400">No providers listed</p>
            ) : (
              <div className="space-y-4">
                {providers.map(p => (
                  <div key={p.id} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                    {editingItem?.type === 'providers' && editingItem.id === p.id ? (
                      <ItemForm
                        fields={[
                          { key: 'name', label: 'Provider Name', required: true },
                          { key: 'role', label: 'Role' },
                          { key: 'practice', label: 'Practice' },
                          { key: 'phone', label: 'Phone' },
                        ]}
                        draft={editingItem.draft}
                        onChange={d => setEditingItem(prev => ({ ...prev, draft: d }))}
                        onSave={saveItem} onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-body text-sm font-semibold text-gray-700">{p.name}</p>
                            {p.role && <span className="tag bg-primary-light text-primary text-[10px] mt-0.5">{p.role}</span>}
                            {p.practice && <p className="font-body text-xs text-gray-400 mt-0.5">{p.practice}</p>}
                            {p.phone && <InfoRow icon={<Phone size={11} />} value={p.phone} small />}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => startEditItem('providers', p)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                            <button onClick={() => deleteItem('providers', p.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <ItemNotesField
                          itemKey={`providers-${p.id}`}
                          notes={p.notes || ''}
                          expanded={!!expandedItemNotes[`providers-${p.id}`]}
                          onToggle={() => setExpandedItemNotes(prev => ({ ...prev, [`providers-${p.id}`]: !prev[`providers-${p.id}`] }))}
                          onSave={text => saveItemNote('providers', p, text)}
                          saving={savingItemNote === `providers-${p.id}`}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Appointments */}
          <SectionCard title="Appointments" icon={<Calendar size={15} />}>
            <div className="space-y-2 mb-4">
              {upcomingAppts.length === 0 ? (
                <p className="font-body text-xs text-gray-400">No upcoming appointments</p>
              ) : (
                upcomingAppts.map(appt => (
                  <div key={appt.id} className="bg-primary-light rounded-xl px-4 py-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-body text-sm font-semibold text-gray-700">{appt.title}</p>
                      <p className="font-body text-xs text-primary font-medium mt-0.5">
                        {format(parseISO(appt.appointment_date), 'MMM d, yyyy · h:mm a')}
                      </p>
                      {appt.provider && <p className="font-body text-xs text-gray-400">with {appt.provider}</p>}
                      {appt.location && <p className="font-body text-xs text-gray-400">{appt.location}</p>}
                    </div>
                    <button onClick={() => deleteAppointment(appt.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {showApptForm ? (
              <div className="border border-gray-100 rounded-xl p-4 space-y-2.5 mb-3">
                <input className="input text-sm" placeholder="Title *" value={newAppt.title} onChange={e => setNewAppt(p => ({ ...p, title: e.target.value }))} />
                <input className="input text-sm" type="datetime-local" value={newAppt.appointment_date} onChange={e => setNewAppt(p => ({ ...p, appointment_date: e.target.value }))} />
                <input className="input text-sm" placeholder="Provider" value={newAppt.provider} onChange={e => setNewAppt(p => ({ ...p, provider: e.target.value }))} />
                <input className="input text-sm" placeholder="Location" value={newAppt.location} onChange={e => setNewAppt(p => ({ ...p, location: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={addAppointment} className="btn-primary flex-1 py-2 text-xs">Save</button>
                  <button onClick={() => setShowApptForm(false)} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowApptForm(true)} className="flex items-center gap-1.5 text-xs font-body text-primary hover:underline mb-3">
                <Plus size={12} /> Add appointment
              </button>
            )}

            {pastAppts.length > 0 && (
              <div className="border-t border-gray-50 pt-3">
                <button
                  onClick={() => setShowPastAppts(p => !p)}
                  className="flex items-center gap-1.5 text-xs font-body text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPastAppts ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Past Appointments ({pastAppts.length})
                </button>
                {showPastAppts && (
                  <div className="mt-2 space-y-2">
                    {pastAppts.map(appt => (
                      <div key={appt.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-start justify-between gap-2 opacity-70">
                        <div>
                          <p className="font-body text-sm font-medium text-gray-600">{appt.title}</p>
                          <p className="font-body text-xs text-gray-400">{format(parseISO(appt.appointment_date), 'MMM d, yyyy')}</p>
                          {appt.provider && <p className="font-body text-xs text-gray-400">with {appt.provider}</p>}
                        </div>
                        <button onClick={() => deleteAppointment(appt.id)} className="p-1 text-gray-200 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Documents */}
          <SectionCard title="Documents" icon={<Paperclip size={15} />}>
            <div className="mb-3">
              <input ref={fileInputRef} type="file" className="hidden" onChange={uploadDocument} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDoc}
                className="flex items-center gap-1.5 text-xs font-body text-primary hover:underline disabled:opacity-50"
              >
                <Plus size={12} />
                {uploadingDoc ? 'Uploading…' : 'Upload document'}
              </button>
            </div>
            {documents.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No documents uploaded</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-body text-xs font-medium text-gray-700 truncate">{doc.name}</p>
                        <p className="font-body text-[10px] text-gray-400">{format(parseISO(doc.created_at), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => downloadDocument(doc)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Download size={13} /></button>
                      <button onClick={() => deleteDocument(doc)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── NOTES — full width ── */}
      <div className="mt-8 card p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-primary" />
            <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
            <span className="tag bg-primary-light text-primary">{notes.length}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {['All', ...NOTE_TYPES].map(t => (
                <button
                  key={t}
                  onClick={() => setNoteFilter(t)}
                  className={`px-2.5 py-1 rounded-lg font-body text-[11px] font-medium transition-all ${
                    noteFilter === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => setNoteModal({ mode: 'new' })}
              className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5"
            >
              <Plus size={12} /> New Note
            </button>
          </div>
        </div>

        {/* Notes list */}
        {filteredNotes.length === 0 ? (
          <p className="font-body text-xs text-gray-400 text-center py-6">
            {noteFilter !== 'All' ? `No notes of type "${noteFilter}"` : 'No notes yet — click New Note to add one'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredNotes.map(note => {
              const typeKey = note.note_type || 'General'
              const typeLabel = typeKey === 'Other' && note.custom_type_label ? note.custom_type_label : typeKey
              const colorClass = NOTE_TYPE_COLORS[typeKey] || NOTE_TYPE_COLORS['General']
              const noteDate = (note.note_date || note.created_at || '').slice(0, 10)
              // title fallback: parse "Title: body" from legacy content field
              const displayTitle = note.title
                || (note.content?.includes(':') ? note.content.split(':')[0].trim() : note.content)
                || '(Untitled)'
              console.log('[Notes] rendering note:', { id: note.id, title: note.title, note_type: note.note_type, note_date: note.note_date, body: note.body?.slice?.(0, 30) })
              return (
                <div
                  key={note.id}
                  onClick={() => setNoteModal({ mode: 'view', note })}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50/60 hover:border-gray-200 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`tag border text-[10px] flex-shrink-0 ${colorClass}`}>{typeLabel}</span>
                    <p className="font-body text-sm font-medium text-gray-700 truncate">
                      {displayTitle}
                    </p>
                  </div>
                  <span className="font-body text-xs text-gray-400 flex-shrink-0">
                    {noteDate ? format(parseISO(noteDate), 'MMM d, yyyy') : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Note modal */}
        {noteModal && (
          <NoteModal
            modal={noteModal}
            onClose={() => setNoteModal(null)}
            onSave={saveNote}
            onUpdate={updateNote}
            onDelete={deleteNote}
            saving={savingNote}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, accentColor = 'primary', onEdit, editing, onSave, onCancel, saving, addButton }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={accentColor === 'mauve' ? 'text-mauve' : 'text-primary'}>{icon}</span>
          <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {addButton && !editing && (
            <button onClick={addButton.onClick} className="p-1.5 text-gray-300 hover:text-primary transition-colors">
              <Plus size={14} />
            </button>
          )}
          {onEdit && !editing && (
            <button onClick={onEdit} className="p-1.5 text-gray-300 hover:text-primary transition-colors">
              <Edit3 size={14} />
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1 text-xs font-body text-white bg-primary rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                <Check size={11} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ icon, value, placeholder, small }) {
  if (!value && !placeholder) return null
  return (
    <div className={`flex items-center gap-1.5 ${small ? 'mt-0.5' : 'mt-1.5'}`}>
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className={`font-body ${small ? 'text-xs' : 'text-sm'} ${!value ? 'text-gray-300 italic' : 'text-gray-500'}`}>
        {value || placeholder}
      </span>
    </div>
  )
}

function ItemForm({ fields, draft, onChange, onSave, onCancel }) {
  return (
    <div className="border border-dashed border-primary/30 rounded-xl p-3 space-y-2 mb-3 bg-primary-light/20">
      {fields.map(f => (
        <div key={f.key}>
          <label className="label">{f.label}{f.required ? ' *' : ''}</label>
          {f.multiline ? (
            <textarea
              className="input resize-none text-xs"
              rows={2}
              value={draft[f.key] || ''}
              onChange={e => onChange({ ...draft, [f.key]: e.target.value })}
            />
          ) : (
            <input
              className="input text-xs"
              value={draft[f.key] || ''}
              onChange={e => onChange({ ...draft, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
        <button onClick={onCancel} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
      </div>
    </div>
  )
}

function CaretakerForm({ draft, onChange, onSave, onCancel }) {
  const toggleDay = day => {
    const days = draft.schedule_days || []
    onChange({ ...draft, schedule_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
  }
  return (
    <div className="border border-dashed border-mauve/30 rounded-xl p-3 space-y-2.5 mb-3 bg-mauve-light/20">
      <div>
        <label className="label">Name *</label>
        <input className="input text-xs" value={draft.name || ''} onChange={e => onChange({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Role</label>
        <input className="input text-xs" value={draft.role || ''} onChange={e => onChange({ ...draft, role: e.target.value })} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input text-xs" value={draft.phone || ''} onChange={e => onChange({ ...draft, phone: e.target.value })} />
      </div>
      <div>
        <label className="label">Schedule Time</label>
        <input className="input text-xs" placeholder="e.g. 9:00 AM – 1:00 PM" value={draft.schedule_time || ''} onChange={e => onChange({ ...draft, schedule_time: e.target.value })} />
      </div>
      <div>
        <label className="label">Schedule Days</label>
        <div className="flex gap-1 mt-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`flex-1 text-center rounded-md py-1.5 text-[10px] font-body font-semibold transition-colors ${
                (draft.schedule_days || []).includes(day) ? 'bg-mauve text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              {day[0]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
        <button onClick={onCancel} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
      </div>
    </div>
  )
}

function ItemNotesField({ itemKey, notes, expanded, onToggle, onSave, saving }) {
  const [draft, setDraft] = useState(notes)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(notes)
    setDirty(false)
  }, [notes])

  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] font-body text-gray-400 hover:text-gray-600 transition-colors"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <span>{expanded ? 'Hide notes' : 'Notes'}</span>
        {notes && !expanded && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block ml-0.5" />}
      </button>
      {expanded && (
        <div className="mt-1.5">
          <textarea
            className="input resize-none text-xs w-full"
            rows={3}
            placeholder="Add notes…"
            value={draft}
            onChange={e => { setDraft(e.target.value); setDirty(true) }}
          />
          {dirty && (
            <button
              onClick={() => { onSave(draft); setDirty(false) }}
              disabled={saving}
              className="mt-1 text-xs font-body text-primary hover:underline disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null)
  const [formats, setFormats] = useState({})
  const initialized = useRef(false)

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = value || ''
      initialized.current = true
    }
  }, [])

  const exec = (cmd, val = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    sync()
  }

  const sync = () => {
    onChange(editorRef.current?.innerHTML || '')
    setFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      list: document.queryCommandState('insertUnorderedList'),
    })
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-0.5 px-2.5 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        <TBtn active={formats.bold} onClick={() => exec('bold')} title="Bold"><strong className="text-xs">B</strong></TBtn>
        <TBtn active={formats.italic} onClick={() => exec('italic')} title="Italic"><em className="text-xs">I</em></TBtn>
        <TBtn active={formats.underline} onClick={() => exec('underline')} title="Underline"><span className="underline text-xs">U</span></TBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <TBtn active={formats.list} onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={12} /></TBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {['#1f2937','#4F7EE0','#dc2626','#16a34a','#9CA3AF'].map(color => (
          <button
            key={color}
            onClick={() => exec('foreColor', color)}
            title={color}
            className="w-4 h-4 rounded-full border border-white shadow-sm hover:scale-110 transition-transform flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onKeyUp={sync}
        onMouseUp={sync}
        className="min-h-[120px] px-4 py-3 font-body text-sm text-gray-700 leading-relaxed focus:outline-none"
      />
    </div>
  )
}

function TBtn({ children, onClick, active, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-all ${
        active ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

// ── NoteModal helpers ─────────────────────────────────────────────────────────
// Parse the legacy "Title: body text" content field back into separate parts
function parseContentTitle(content) {
  if (!content) return ''
  return content.includes(':') ? content.split(':')[0].trim() : content.trim()
}
function parseContentBody(content) {
  if (!content) return ''
  return content.includes(':') ? content.split(':').slice(1).join(':').trim() : ''
}

// ── NoteModal ─────────────────────────────────────────────────────────────────
function NoteModal({ modal, onClose, onSave, onUpdate, onDelete, saving }) {
  const isNew = modal.mode === 'new'
  const note = modal.note || null
  const [mode, setMode] = useState(isNew ? 'edit' : 'view')

  // Each field is its own independent state variable — no shared object
  const [title, setTitle] = useState(() =>
    isNew ? '' : (note?.title || parseContentTitle(note?.content) || '')
  )
  const [noteType, setNoteType] = useState(() =>
    isNew ? 'General' : (note?.note_type || 'General')
  )
  const [customLabel, setCustomLabel] = useState(() =>
    isNew ? '' : (note?.custom_type_label || '')
  )
  const [noteDate, setNoteDate] = useState(() =>
    isNew ? today : ((note?.note_date || note?.created_at || today).slice(0, 10))
  )
  const [body, setBody] = useState(() =>
    isNew ? '' : (note?.body || parseContentBody(note?.content) || '')
  )

  // Re-sync all fields when the note id changes (different note opened, or post-refresh)
  useEffect(() => {
    if (!isNew && note) {
      console.log('[Notes] NoteModal syncing fields from note:', note)
      setTitle(note.title || parseContentTitle(note.content) || '')
      setNoteType(note.note_type || 'General')
      setCustomLabel(note.custom_type_label || '')
      setNoteDate((note.note_date || note.created_at || today).slice(0, 10))
      setBody(note.body || parseContentBody(note.content) || '')
    }
  }, [note?.id])

  // Escape to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const canSave = title.trim().length > 0
  const typeKey = noteType || 'General'
  const colorClass = NOTE_TYPE_COLORS[typeKey] || NOTE_TYPE_COLORS['General']

  const handleSave = () => {
    // Build payload explicitly from each independent state variable
    const payload = { title, noteType, customLabel, noteDate, body }
    console.log('[Notes] handleSave payload:', payload)
    if (isNew) onSave(payload)
    else onUpdate(note.id, payload)
  }

  const handleDelete = async () => {
    await onDelete(note.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!isNew && mode === 'view' && (
              <span className={`tag border text-[10px] flex-shrink-0 ${colorClass}`}>
                {typeKey === 'Other' && note.custom_type_label ? note.custom_type_label : typeKey}
              </span>
            )}
            <h2 className="font-heading text-xl font-semibold text-gray-800 truncate">
              {isNew ? 'New Note' : (mode === 'view' ? (note.title || parseContentTitle(note.content) || 'Note') : 'Edit Note')}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isNew && mode === 'view' && (
              <>
                <button
                  onClick={() => setMode('edit')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-medium text-primary bg-primary-light hover:bg-primary/20 transition-colors"
                >
                  <Edit3 size={12} /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {mode === 'view' ? (
            <div>
              <p className="font-body text-xs text-gray-400 mb-4">
                {format(parseISO((note.note_date || note.created_at || today).slice(0, 10)), 'MMMM d, yyyy')}
              </p>
              {note.body ? (
                <div className="font-body text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: note.body }} />
              ) : (
                <p className="font-body text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {parseContentBody(note.content) || note.content}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title *">
                  <input
                    className="input"
                    placeholder="Note title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    className="input"
                    value={noteDate}
                    onChange={e => setNoteDate(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    className="input"
                    value={noteType}
                    onChange={e => setNoteType(e.target.value)}
                  >
                    {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                {noteType === 'Other' && (
                  <Field label="Custom Label">
                    <input
                      className="input"
                      placeholder="Describe type"
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                    />
                  </Field>
                )}
              </div>
              <Field label="Body">
                <RichTextEditor
                  key={`${note?.id ?? 'new'}-${mode}`}
                  value={body}
                  onChange={setBody}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Footer — edit mode only */}
        {mode === 'edit' && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => isNew ? onClose() : setMode('view')}
              className="btn-ghost py-2 px-4 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="btn-primary py-2 px-5 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : (isNew ? 'Save Note' : 'Save Changes')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
