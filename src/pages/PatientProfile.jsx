import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears, isAfter, startOfDay } from 'date-fns'
import {
  ArrowLeft, Phone, Mail, MapPin, User, Pill, Activity, Stethoscope,
  Users, Calendar, FileText, Plus, Sparkles, Trash2, Edit3, Clock,
  Shield, X, Check, ChevronDown, ChevronUp, Target, Paperclip,
  Download, List, ListOrdered, ToggleLeft, ToggleRight, Search, CheckCircle, MoreVertical,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Typography } from '@tiptap/extension-typography'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NOTE_TYPES = ['Call Summary', 'Appointment Note', 'Action Item', 'Family Communication', 'General', 'Other']
const OVERWHELMING_OPTIONS = [
  'Understanding medical information',
  'Managing medications',
  'Coordinating multiple doctors',
  'Preparing for appointments',
  'Following through on care plans',
  'Billing/insurance questions',
  'Caregiving stress',
  'Other',
]
const CARE_EXP_QUESTIONS = [
  { key: 'clarity',               label: 'Do they understand their care plan?',       options: ['Always', 'Sometimes', 'Never'] },
  { key: 'feels_heard',           label: 'Do they feel heard by their doctors?',       options: ['Yes', 'No', 'Sometimes'] },
  { key: 'num_doctors',           label: 'How many doctors are they seeing?',          options: ['1–2', '3–4', '5+'] },
  { key: 'desires_coordination',  label: 'Do they want better care coordination?',     options: ['Yes', 'No'] },
]
const NOTE_TYPE_COLORS = {
  'Call Summary':         'bg-blue-50 text-blue-600 border-blue-100',
  'Appointment Note':     'bg-purple-50 text-purple-600 border-purple-100',
  'Action Item':          'bg-amber-50 text-amber-600 border-amber-100',
  'Family Communication': 'bg-green-50 text-green-600 border-green-100',
  'General':              'bg-gray-100 text-gray-500 border-gray-200',
  'Other':                'bg-pink-50 text-pink-600 border-pink-100',
}
const today = format(new Date(), 'yyyy-MM-dd')
function stripHtml(html) { return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function getBodySnippet(body, query) {
  const text = stripHtml(body || '')
  if (!text || !query.trim()) return null
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return null
  const start = Math.max(0, idx - 50)
  const end = Math.min(text.length, idx + query.trim().length + 50)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, idx),
    match: text.slice(idx, idx + query.trim().length),
    after: text.slice(idx + query.trim().length, end) + (end < text.length ? '…' : ''),
  }
}

export default function PatientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [patient, setPatient] = useState(null)
  const [conditions, setConditions] = useState([])
  const [medications, setMedications] = useState([])
  const [providers, setProviders] = useState([])
  const [caretakers, setCaretakers] = useState([])
  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [goals, setGoals] = useState([])
  const [appointments, setAppointments] = useState([])
  const [hospitalizations, setHospitalizations] = useState([])
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
  const [insuranceOtherMode, setInsuranceOtherMode] = useState(false)

  // Inline item editing
  const [editingItem, setEditingItem] = useState(null) // { type, id, draft }
  const [addingItem, setAddingItem] = useState(null)   // { type, draft }

  // Per-item collapsible notes
  const [expandedItemNotes, setExpandedItemNotes] = useState({})
  const [savingItemNote, setSavingItemNote] = useState(null)

  // Notes
  const [noteModal, setNoteModal] = useState(null) // null | { mode: 'new' } | { mode: 'view', note }
  const [savingNote, setSavingNote] = useState(false)
  const [noteSearch, setNoteSearch] = useState('')
  const [noteTypeFilter, setNoteTypeFilter] = useState('All')
  const [noteDateFrom, setNoteDateFrom] = useState('')
  const [noteDateTo, setNoteDateTo] = useState('')
  const [noteDateRange, setNoteDateRange] = useState(false)
  const [deletedNotes, setDeletedNotes] = useState([])
  const [showDeletedNotes, setShowDeletedNotes] = useState(false)

  // Three-dot actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const actionsMenuRef = useRef(null)

  // Intake & Background panel
  const [showIntakePanel, setShowIntakePanel] = useState(false)
  const [draftReason, setDraftReason] = useState('')
  const [savingReason, setSavingReason] = useState(false)
  const [draftOverwhelming, setDraftOverwhelming] = useState([])
  const [draftOverwhelmingOther, setDraftOverwhelmingOther] = useState('')
  const [draftCareExp, setDraftCareExp] = useState({})
  const [panelGoalAdding, setPanelGoalAdding] = useState(false)
  const [panelGoalDraft, setPanelGoalDraft] = useState('')
  const [panelGoalEditing, setPanelGoalEditing] = useState(null) // { id, goal_text }
  const [panelHospAdding, setPanelHospAdding] = useState(false)
  const [panelHospDraft, setPanelHospDraft] = useState({ reason: '', hospital: '', admission_date: '', discharge_date: '' })
  const [panelHospEditing, setPanelHospEditing] = useState(null)

  // Appointments
  const [showApptForm, setShowApptForm] = useState(false)
  const [showPastAppts, setShowPastAppts] = useState(false)
  const [newAppt, setNewAppt] = useState({ title: '', provider: '', location: '', appointment_date: '', notes: '' })
  const [apptModal, setApptModal] = useState(null) // editing draft: { id, title, provider, location, appointment_date, notes }

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { loadPatient() }, [id])

  useEffect(() => {
    if (!showActionsMenu) return
    function handleClickOutside(e) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setShowActionsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showActionsMenu])

  async function loadPatient() {
    setLoading(true)
    const [p, c, m, pr, ct, ec, gl, ap, hosp, n, nd, docs] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('conditions').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('medications').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('providers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('caretakers').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('emergency_contacts').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('goals').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('appointments').select('*').eq('patient_id', id).order('appointment_date'),
      supabase.from('hospitalizations').select('*').eq('patient_id', id).order('admission_date', { ascending: false }),
      supabase.from('notes').select('*').eq('patient_id', id).is('deleted_at', null).order('note_date', { ascending: false }),
      supabase.from('notes').select('*').eq('patient_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('documents').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    ])
    setPatient(p.data)
    setConditions(c.data || [])
    setMedications(m.data || [])
    setProviders(pr.data || [])
    setCaretakers(ct.data || [])
    setEmergencyContacts(ec.data || [])
    setGoals(gl.data || [])
    setAppointments(ap.data || [])
    setHospitalizations(hosp.data || [])
    setNotes(n.data || [])
    setDeletedNotes(nd.data || [])
    setDocuments(docs.data || [])
    setLoading(false)
  }

  // ── Patient section edit ──────────────────────────────────────
  const INSURANCE_TYPES = ['Medicare', 'Medicaid', 'Medicare + Medicaid', 'Private Insurance', 'Uninsured']

  function startEditSection(section) {
    setEditingSection(section)
    setDraftPatient({ ...patient })
    if (section === 'insurance') {
      const val = patient?.insurance_type || ''
      setInsuranceOtherMode(!!val && !INSURANCE_TYPES.includes(val))
    }
  }

  async function saveSection() {
    setSaving(true)
    const { data } = await supabase.from('patients').update(draftPatient).eq('id', id).select().single()
    if (data) setPatient(data)
    setEditingSection(null)
    setSaving(false)
  }

  function openIntakePanel() {
    const factors = patient?.overwhelming_factors || []
    // Separate "Other" custom text — stored as "Other: [text]" or just "Other"
    const otherEntry = factors.find(f => f === 'Other' || f.startsWith('Other: '))
    const normalFactors = otherEntry
      ? [...factors.filter(f => f !== otherEntry), 'Other']
      : factors
    const otherText = otherEntry?.startsWith('Other: ') ? otherEntry.slice(7) : ''
    setDraftReason(patient?.reason_for_advocacy || '')
    setDraftOverwhelming(normalFactors)
    setDraftOverwhelmingOther(otherText)
    setDraftCareExp(patient?.care_experience || {})
    setPanelGoalAdding(false)
    setPanelGoalDraft('')
    setPanelGoalEditing(null)
    setPanelHospAdding(false)
    setPanelHospDraft({ reason: '', hospital: '', admission_date: '', discharge_date: '' })
    setPanelHospEditing(null)
    setShowIntakePanel(true)
  }

  function buildOverwhelmingArray(factors, otherText) {
    return factors.map(f => {
      if (f === 'Other') return otherText.trim() ? `Other: ${otherText.trim()}` : 'Other'
      return f
    })
  }

  async function closeIntakePanel() {
    // Auto-save overwhelming factors and care experience on close
    const finalFactors = buildOverwhelmingArray(draftOverwhelming, draftOverwhelmingOther)
    const { data } = await supabase.from('patients')
      .update({ overwhelming_factors: finalFactors, care_experience: draftCareExp })
      .eq('id', id).select().single()
    if (data) setPatient(data)
    setShowIntakePanel(false)
  }

  async function saveReason() {
    setSavingReason(true)
    const { data } = await supabase.from('patients').update({ reason_for_advocacy: draftReason }).eq('id', id).select().single()
    if (data) setPatient(data)
    setSavingReason(false)
  }

  async function panelAddGoal() {
    if (!panelGoalDraft.trim()) return
    const { data } = await supabase.from('goals').insert({ patient_id: id, goal_text: panelGoalDraft }).select().single()
    if (data) setGoals(prev => [...prev, data])
    setPanelGoalDraft('')
    setPanelGoalAdding(false)
  }

  async function panelUpdateGoal() {
    if (!panelGoalEditing) return
    const { data } = await supabase.from('goals').update({ goal_text: panelGoalEditing.goal_text }).eq('id', panelGoalEditing.id).select().single()
    if (data) setGoals(prev => prev.map(g => g.id === data.id ? data : g))
    setPanelGoalEditing(null)
  }

  async function panelDeleteGoal(goalId) {
    await supabase.from('goals').delete().eq('id', goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  async function panelAddHosp() {
    if (!panelHospDraft.reason.trim()) return
    const payload = { patient_id: id, ...panelHospDraft }
    if (!payload.admission_date) delete payload.admission_date
    if (!payload.discharge_date) delete payload.discharge_date
    const { data } = await supabase.from('hospitalizations').insert(payload).select().single()
    if (data) setHospitalizations(prev => [data, ...prev])
    setPanelHospDraft({ reason: '', hospital: '', admission_date: '', discharge_date: '' })
    setPanelHospAdding(false)
  }

  async function panelUpdateHosp() {
    if (!panelHospEditing) return
    const { id: hId, patient_id, created_at, ...fields } = panelHospEditing
    const { data } = await supabase.from('hospitalizations').update(fields).eq('id', hId).select().single()
    if (data) setHospitalizations(prev => prev.map(h => h.id === hId ? data : h))
    setPanelHospEditing(null)
  }

  async function panelDeleteHosp(hId) {
    await supabase.from('hospitalizations').delete().eq('id', hId)
    setHospitalizations(prev => prev.filter(h => h.id !== hId))
  }

  async function toggleStatus() {
    const next = patient.status === 'active' ? 'inactive' : 'active'
    const { data } = await supabase.from('patients').update({ status: next }).eq('id', id).select().single()
    if (data) setPatient(data)
  }

  // ── Per-item CRUD ─────────────────────────────────────────────
  const TABLE = { conditions: 'conditions', medications: 'medications', providers: 'providers', caretakers: 'caretakers', emergency_contacts: 'emergency_contacts', goals: 'goals', hospitalizations: 'hospitalizations' }
  const SETTER = { conditions: setConditions, medications: setMedications, providers: setProviders, caretakers: setCaretakers, emergency_contacts: setEmergencyContacts, goals: setGoals, hospitalizations: setHospitalizations }

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

  // ── Notes ─────────────────────────────────────────────────────
  async function refreshNotes() {
    const [{ data: active }, { data: deleted }] = await Promise.all([
      supabase.from('notes').select('*').eq('patient_id', id).is('deleted_at', null).order('note_date', { ascending: false }),
      supabase.from('notes').select('*').eq('patient_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    setNotes(active || [])
    setDeletedNotes(deleted || [])
  }

  async function saveNote({ noteTitle, noteType, noteDate, noteBody }) {
    if (!noteTitle.trim()) return
    setSavingNote(true)
    await supabase.from('notes').insert({
      patient_id: id,
      title: noteTitle,
      note_type: noteType,
      note_date: noteDate,
      body: noteBody,
    })
    await refreshNotes()
    setNoteModal(null)
    setSavingNote(false)
  }

  async function updateNote(noteId, { noteTitle, noteType, noteDate, noteBody }) {
    if (!noteTitle.trim()) return
    setSavingNote(true)
    await supabase.from('notes').update({
      title: noteTitle,
      note_type: noteType,
      note_date: noteDate,
      body: noteBody,
    }).eq('id', noteId)
    await refreshNotes()
    setNoteModal(null)
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', noteId)
    await refreshNotes()
  }

  async function restoreNote(noteId) {
    await supabase.from('notes').update({ deleted_at: null }).eq('id', noteId)
    await refreshNotes()
  }

  async function permanentDeleteNote(noteId) {
    if (!window.confirm('Permanently delete this note? This cannot be undone.')) return
    await supabase.from('notes').delete().eq('id', noteId)
    setDeletedNotes(prev => prev.filter(n => n.id !== noteId))
  }

  // ── Appointments ──────────────────────────────────────────────
  async function addAppointment() {
    if (!newAppt.title || !newAppt.appointment_date) return
    const { data } = await supabase.from('appointments').insert({ patient_id: id, ...newAppt }).select().single()
    if (data) setAppointments(prev => [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
    setNewAppt({ title: '', provider: '', location: '', appointment_date: '', notes: '' })
    setShowApptForm(false)
  }

  async function updateAppointment() {
    if (!apptModal?.title || !apptModal?.appointment_date) return
    const { id: apptId, ...fields } = apptModal
    const { data } = await supabase.from('appointments').update(fields).eq('id', apptId).select().single()
    if (data) setAppointments(prev => prev.map(a => a.id === apptId ? data : a).sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
    setApptModal(null)
  }

  async function markApptComplete(apptId) {
    const { data } = await supabase.from('appointments').update({ completed: true }).eq('id', apptId).select().single()
    if (data) setAppointments(prev => prev.map(a => a.id === apptId ? data : a))
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
  const upcomingAppts = appointments.filter(a => !a.completed && isAfter(new Date(a.appointment_date), now))
  const pastAppts = [...appointments.filter(a => a.completed || !isAfter(new Date(a.appointment_date), now))]
    .sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date))
  // ── Notes filtering (client-side) ─────────────────────────────
  const filteredNotes = notes.filter(note => {
    if (noteSearch.trim()) {
      const q = noteSearch.toLowerCase()
      const inTitle = (note.title || '').toLowerCase().includes(q)
      const inBody = stripHtml(note.body || '').toLowerCase().includes(q)
      if (!inTitle && !inBody) return false
    }
    if (noteTypeFilter !== 'All') {
      const typeKey = NOTE_TYPES.includes(note.note_type) ? note.note_type : 'Other'
      if (typeKey !== noteTypeFilter) return false
    }
    const nd = (note.note_date || '').slice(0, 10)
    if (noteDateFrom) {
      if (noteDateRange && noteDateTo) {
        if (nd < noteDateFrom || nd > noteDateTo) return false
      } else {
        if (nd !== noteDateFrom) return false
      }
    }
    return true
  })

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
              onClick={openIntakePanel}
              className="flex items-center gap-2 bg-mauve text-white px-5 py-2.5 rounded-xl font-body text-sm font-semibold shadow-sm hover:bg-mauve/90 transition-all"
            >
              <FileText size={15} />
              Intake &amp; Background
            </button>
            <button
              onClick={generateAISummary}
              disabled={aiLoading}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-body text-sm font-semibold shadow-sm hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              <Sparkles size={15} />
              {aiLoading ? 'Generating…' : 'AI Briefing'}
            </button>
            {/* Three-dot actions menu */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setShowActionsMenu(v => !v)}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
                title="More actions"
              >
                <MoreVertical size={16} />
              </button>
              {showActionsMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20">
                  <button
                    onClick={() => { toggleStatus(); setShowActionsMenu(false) }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-left transition-colors ${
                      patient.status === 'active'
                        ? 'text-gray-600 hover:bg-red-50 hover:text-red-600'
                        : 'text-primary hover:bg-primary-light'
                    }`}
                  >
                    {patient.status === 'active' ? <ToggleLeft size={15} /> : <ToggleRight size={15} />}
                    {patient.status === 'active' ? 'Inactivate Patient' : 'Reactivate Patient'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {aiSummary && (
          <div className="mt-5 bg-primary-light rounded-xl p-5 border border-primary/10">
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

          {/* Emergency Contacts */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-primary"><Shield size={15} /></span>
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Emergency Contacts</h3>
              </div>
              <button
                onClick={() => setAddingItem({ type: 'emergency_contacts', draft: { name: '', relationship: '', phone: '', email: '' } })}
                className="p-1.5 text-gray-300 hover:text-primary transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            {addingItem?.type === 'emergency_contacts' && (
              <ItemForm
                fields={[
                  { key: 'name', label: 'Name', required: true },
                  { key: 'relationship', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Caregiver'] },
                  { key: 'phone', label: 'Phone' },
                  { key: 'email', label: 'Email' },
                ]}
                draft={addingItem.draft}
                onChange={d => setAddingItem(p => ({ ...p, draft: d }))}
                onSave={saveNewItem} onCancel={() => setAddingItem(null)}
              />
            )}

            {emergencyContacts.length === 0 && !addingItem ? (
              <p className="font-body text-xs text-gray-400">No emergency contacts on file</p>
            ) : (
              <div className="space-y-4">
                {emergencyContacts.map(ec => (
                  <div key={ec.id} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                    {editingItem?.type === 'emergency_contacts' && editingItem.id === ec.id ? (
                      <ItemForm
                        fields={[
                          { key: 'name', label: 'Name', required: true },
                          { key: 'relationship', label: 'Relationship' },
                          { key: 'phone', label: 'Phone' },
                          { key: 'email', label: 'Email' },
                        ]}
                        draft={editingItem.draft}
                        onChange={d => setEditingItem(p => ({ ...p, draft: d }))}
                        onSave={saveItem} onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-body text-sm font-medium text-gray-700">
                            {ec.name}
                            {ec.relationship && <span className="text-gray-400 font-normal"> · {ec.relationship}</span>}
                          </p>
                          {ec.phone && <InfoRow icon={<Phone size={11} />} value={ec.phone} small />}
                          {ec.email && <InfoRow icon={<Mail size={11} />} value={ec.email} small />}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button onClick={() => startEditItem('emergency_contacts', ec)} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                          <button onClick={() => deleteItem('emergency_contacts', ec.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  <select
                    className="input"
                    value={insuranceOtherMode ? '__other__' : (draftPatient.insurance_type || '')}
                    onChange={e => {
                      if (e.target.value === '__other__') {
                        setInsuranceOtherMode(true)
                        setDraftPatient(p => ({ ...p, insurance_type: '' }))
                      } else {
                        setInsuranceOtherMode(false)
                        setDraftPatient(p => ({ ...p, insurance_type: e.target.value }))
                      }
                    }}
                  >
                    <option value="">Select type…</option>
                    {INSURANCE_TYPES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    <option value="__other__">Other</option>
                  </select>
                  {insuranceOtherMode && (
                    <input
                      className="input mt-2"
                      placeholder="Specify insurance type…"
                      value={draftPatient.insurance_type || ''}
                      onChange={e => setDraftPatient(p => ({ ...p, insurance_type: e.target.value }))}
                    />
                  )}
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
                  <div className="mb-2"><span className="tag bg-primary text-white">{patient.insurance_type}</span></div>
                )}
                {patient.insurance_provider && (
                  <p className="font-body text-sm text-gray-600">{patient.insurance_provider}</p>
                )}
                {patient.billing_concerns && (
                  <p className="font-body text-xs text-gray-500 mt-2 leading-relaxed">{patient.billing_concerns}</p>
                )}
                {!patient.insurance_type && !patient.insurance_provider && (
                  <p className="font-body text-xs text-gray-400">No insurance info on file</p>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── MIDDLE: Conditions / Medications / Care Team / Caretakers ── */}
        <div className="space-y-6">

          {/* Conditions */}
          <div className="card p-6">
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
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pill size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Medications</h3>
              </div>
              <button
                onClick={() => setAddingItem({ type: 'medications', draft: { name: '', dose: '', frequency: '', concerns: '', notes: '' } })}
                className="p-1 text-gray-300 hover:text-primary transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>

            {addingItem?.type === 'medications' && (
              <ItemForm
                fields={[
                  { key: 'name', label: 'Medication Name', required: true },
                  { key: 'dose', label: 'Dose' },
                  { key: 'frequency', label: 'Frequency', type: 'select', options: ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Every morning', 'Every evening', 'Every 8 hours', 'Every 12 hours', 'As needed (PRN)', 'Weekly'] },
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
                            {m.concerns && <p className="font-body text-xs text-gray-500 mt-1">{m.concerns}</p>}
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

          {/* Care Team */}
          <SectionCard
            title="Care Team" icon={<Stethoscope size={15} />}
            addButton={{ onClick: () => setAddingItem({ type: 'providers', draft: { name: '', role: '', practice: '', phone: '', notes: '' } }) }}
          >
            {addingItem?.type === 'providers' && (
              <ItemForm
                fields={[
                  { key: 'name', label: 'Provider Name', required: true },
                  { key: 'role', label: 'Role', type: 'select', options: ['PCP', 'Cardiologist', 'Neurologist', 'Oncologist', 'Psychiatrist', 'Physical Therapist', 'Occupational Therapist', 'Pharmacist', 'Specialist'] },
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
                          { key: 'role', label: 'Role', type: 'select', options: ['PCP', 'Cardiologist', 'Neurologist', 'Oncologist', 'Psychiatrist', 'Physical Therapist', 'Occupational Therapist', 'Pharmacist', 'Specialist'] },
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
                            {p.role && <span className="tag bg-primary text-white text-[10px] mt-0.5">{p.role}</span>}
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
                            {ct.role && <span className="tag bg-primary text-white text-[10px] mt-0.5">{ct.role}</span>}
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
                              <div key={day} className={`flex-1 text-center rounded-md py-1.5 text-[10px] font-body font-semibold ${ct.schedule_days?.includes(day) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-300'}`}>
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

        {/* ── RIGHT: Appointments / Notes / Documents ── */}
        <div className="space-y-6">

          {/* Appointments */}
          <SectionCard title="Appointments" icon={<Calendar size={15} />}>
            {/* Upcoming */}
            <div className="space-y-2 mb-4">
              {upcomingAppts.length === 0 ? (
                <p className="font-body text-xs text-gray-400">No upcoming appointments</p>
              ) : (
                upcomingAppts.map(appt => (
                  <div key={appt.id} className="bg-primary-light rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-semibold text-gray-700">{appt.title}</p>
                        <p className="font-body text-xs text-primary font-medium mt-0.5">
                          {format(parseISO(appt.appointment_date), 'MMM d, yyyy · h:mm a')}
                        </p>
                        {appt.provider && <p className="font-body text-xs text-gray-400">with {appt.provider}</p>}
                        {appt.location && <p className="font-body text-xs text-gray-400">{appt.location}</p>}
                        {appt.notes && <p className="font-body text-xs text-gray-500 mt-1 italic">{appt.notes}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => markApptComplete(appt.id)} title="Mark complete" className="p-1 text-gray-300 hover:text-primary transition-colors"><CheckCircle size={13} /></button>
                        <button onClick={() => setApptModal({ ...appt })} title="Edit" className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                        <button onClick={() => deleteAppointment(appt.id)} title="Delete" className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add form */}
            {showApptForm ? (
              <div className="border border-gray-100 rounded-xl p-4 space-y-2.5 mb-3">
                <input className="input text-sm" placeholder="Title *" value={newAppt.title} onChange={e => setNewAppt(p => ({ ...p, title: e.target.value }))} />
                <input className="input text-sm" type="datetime-local" value={newAppt.appointment_date} onChange={e => setNewAppt(p => ({ ...p, appointment_date: e.target.value }))} />
                <input className="input text-sm" placeholder="Provider" value={newAppt.provider} onChange={e => setNewAppt(p => ({ ...p, provider: e.target.value }))} />
                <input className="input text-sm" placeholder="Location" value={newAppt.location} onChange={e => setNewAppt(p => ({ ...p, location: e.target.value }))} />
                <textarea className="input text-sm resize-none" rows={2} placeholder="Notes" value={newAppt.notes} onChange={e => setNewAppt(p => ({ ...p, notes: e.target.value }))} />
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

            {/* Past / Completed */}
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
                      <div key={appt.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-start justify-between gap-2 opacity-75">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-body text-sm font-medium text-gray-600">{appt.title}</p>
                            {appt.completed && (
                              <span className="tag bg-gray-100 text-gray-500 text-[10px]">Completed</span>
                            )}
                          </div>
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

          {/* Appointment edit modal */}
          {apptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setApptModal(null) }}>
              <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <h2 className="font-heading text-xl font-semibold text-gray-800">Edit Appointment</h2>
                  <button onClick={() => setApptModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
                </div>
                <div className="px-6 py-5 space-y-3">
                  <Field label="Title *">
                    <input className="input" value={apptModal.title || ''} onChange={e => setApptModal(p => ({ ...p, title: e.target.value }))} />
                  </Field>
                  <Field label="Date & Time">
                    <input type="datetime-local" className="input" value={apptModal.appointment_date || ''} onChange={e => setApptModal(p => ({ ...p, appointment_date: e.target.value }))} />
                  </Field>
                  <Field label="Provider">
                    <input className="input" value={apptModal.provider || ''} onChange={e => setApptModal(p => ({ ...p, provider: e.target.value }))} />
                  </Field>
                  <Field label="Location">
                    <input className="input" value={apptModal.location || ''} onChange={e => setApptModal(p => ({ ...p, location: e.target.value }))} />
                  </Field>
                  <Field label="Notes">
                    <textarea className="input resize-none" rows={3} value={apptModal.notes || ''} onChange={e => setApptModal(p => ({ ...p, notes: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
                  <button onClick={() => setApptModal(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
                  <button onClick={updateAppointment} className="btn-primary flex-1 py-2 text-sm">Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="card p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
                <span className="tag bg-primary-light text-primary">{notes.length}</span>
                {deletedNotes.length > 0 && (
                  <span className="tag bg-gray-100 text-gray-400">{deletedNotes.length} deleted</span>
                )}
              </div>
              <button
                onClick={() => setNoteModal({ mode: 'new' })}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5"
              >
                <Plus size={12} /> Add Note
              </button>
            </div>
            {/* Filters */}
            {notes.length > 0 && (
              <div className="space-y-2.5 mb-4">
                {/* Row 1: search + type */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                    <input
                      type="text"
                      className="input pl-8 text-sm"
                      placeholder="Search notes…"
                      value={noteSearch}
                      onChange={e => setNoteSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="input text-sm w-48 flex-shrink-0"
                    value={noteTypeFilter}
                    onChange={e => setNoteTypeFilter(e.target.value)}
                  >
                    <option value="All">All types</option>
                    {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Row 2: date filter */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-300 flex-shrink-0" />
                    <input
                      type="date"
                      className="input text-sm w-38"
                      value={noteDateFrom}
                      onChange={e => setNoteDateFrom(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => { setNoteDateRange(r => !r); setNoteDateTo('') }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-body text-[11px] font-medium border transition-all ${
                      noteDateRange
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-primary hover:text-primary'
                    }`}
                  >
                    Range
                  </button>
                  {noteDateRange && (
                    <input
                      type="date"
                      className="input text-sm w-38"
                      value={noteDateTo}
                      onChange={e => setNoteDateTo(e.target.value)}
                    />
                  )}
                  {noteDateFrom && (
                    <button
                      onClick={() => { setNoteDateFrom(''); setNoteDateTo(''); setNoteDateRange(false) }}
                      className="flex items-center gap-1 text-xs font-body text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <X size={12} /> Clear date
                    </button>
                  )}
                </div>

                {/* Results count */}
                <p className="font-body text-[11px] text-gray-400">
                  {filteredNotes.length === notes.length
                    ? `${notes.length} note${notes.length !== 1 ? 's' : ''}`
                    : `${filteredNotes.length} of ${notes.length} note${notes.length !== 1 ? 's' : ''} match`}
                </p>
              </div>
            )}

            {/* Notes feed */}
            {notes.length === 0 ? (
              <p className="font-body text-xs text-gray-400 text-center py-6">
                No notes yet — click Add Note to create one
              </p>
            ) : filteredNotes.length === 0 ? (
              <p className="font-body text-xs text-gray-400 text-center py-6">
                No notes match your search.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredNotes.map(note => {
                  const typeKey = NOTE_TYPES.includes(note.note_type) ? note.note_type : 'Other'
                  const typeLabel = typeKey === 'Other' && note.note_type && note.note_type !== 'Other'
                    ? note.note_type
                    : typeKey
                  const colorClass = NOTE_TYPE_COLORS[typeKey] || NOTE_TYPE_COLORS['General']
                  const dateStr = (note.note_date || '').slice(0, 10)
                  const q = noteSearch.trim()
                  const inTitle = q ? (note.title || '').toLowerCase().includes(q.toLowerCase()) : false
                  const inBody = q ? stripHtml(note.body || '').toLowerCase().includes(q.toLowerCase()) : false
                  const bodyOnly = q && inBody && !inTitle
                  const snippet = bodyOnly ? getBodySnippet(note.body, q) : null
                  return (
                    <div
                      key={note.id}
                      onClick={() => setNoteModal({ mode: 'view', note })}
                      className="flex items-start justify-between gap-3 px-5 py-3.5 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50/60 hover:border-gray-200 transition-all"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className={`tag border text-[10px] flex-shrink-0 mt-0.5 ${colorClass}`}>{typeLabel}</span>
                        <div className="min-w-0">
                          <p className="font-body text-sm font-medium text-gray-700 truncate">
                            {note.title || '(Untitled)'}
                          </p>
                          {bodyOnly && (
                            <span className="inline-block mt-1 font-body text-[10px] text-primary bg-primary-light rounded px-1.5 py-0.5">
                              Found in note body
                            </span>
                          )}
                          {snippet && (
                            <p className="font-body text-xs text-gray-400 mt-1 leading-relaxed">
                              {snippet.before}
                              <mark className="bg-yellow-100 text-gray-700 rounded px-0.5 not-italic font-medium">{snippet.match}</mark>
                              {snippet.after}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-body text-xs text-gray-400 flex-shrink-0 mt-0.5">
                        {dateStr ? format(parseISO(dateStr), 'MMM d, yyyy') : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Deleted Notes */}
            {deletedNotes.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <button
                  onClick={() => setShowDeletedNotes(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-body text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showDeletedNotes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Deleted Notes ({deletedNotes.length})
                </button>

                {showDeletedNotes && (
                  <div className="mt-3 space-y-2">
                    {deletedNotes.map(note => {
                      const typeKey = NOTE_TYPES.includes(note.note_type) ? note.note_type : 'Other'
                      const typeLabel = typeKey === 'Other' && note.note_type && note.note_type !== 'Other'
                        ? note.note_type : typeKey
                      const colorClass = NOTE_TYPE_COLORS[typeKey] || NOTE_TYPE_COLORS['General']
                      const deletedStr = note.deleted_at
                        ? format(parseISO(note.deleted_at), 'MMM d, yyyy')
                        : ''
                      return (
                        <div
                          key={note.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl opacity-70"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className={`tag border text-[10px] flex-shrink-0 ${colorClass}`}>{typeLabel}</span>
                            <div className="min-w-0">
                              <p className="font-body text-sm font-medium text-gray-500 truncate">
                                {note.title || '(Untitled)'}
                              </p>
                              {deletedStr && (
                                <p className="font-body text-[10px] text-gray-400 mt-0.5">Deleted {deletedStr}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => restoreNote(note.id)}
                              className="px-2.5 py-1 rounded-lg font-body text-[11px] font-medium text-primary bg-primary-light hover:bg-primary/20 transition-colors"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => permanentDeleteNote(note.id)}
                              className="px-2.5 py-1 rounded-lg font-body text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              Delete forever
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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

      {/* ── INTAKE & BACKGROUND SLIDE-OVER ── */}
      {showIntakePanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
            onClick={closeIntakePanel}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-[520px] max-w-full bg-white shadow-2xl z-50 flex flex-col">

            {/* Panel header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-heading text-2xl text-gray-800">Intake &amp; Background</h2>
                <p className="font-body text-xs text-gray-400 mt-0.5">{patient.first_name} {patient.last_name}</p>
              </div>
              <button
                onClick={closeIntakePanel}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-8">

              {/* ── A: Reason for Advocacy ── */}
              <section>
                <h3 className="font-heading text-lg text-gray-700 mb-3">What Brings Them to SBHA</h3>
                <textarea
                  className="input resize-none w-full"
                  rows={4}
                  value={draftReason}
                  onChange={e => setDraftReason(e.target.value)}
                  placeholder="Describe what led this patient to seek advocacy…"
                />
                <button
                  onClick={saveReason}
                  disabled={savingReason}
                  className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl font-body text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  <Check size={13} /> {savingReason ? 'Saving…' : 'Save'}
                </button>
              </section>

              <div className="border-t border-gray-100" />

              {/* ── B: Goals ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-lg text-gray-700">Goals</h3>
                  {!panelGoalAdding && (
                    <button
                      onClick={() => { setPanelGoalAdding(true); setPanelGoalDraft('') }}
                      className="flex items-center gap-1 text-xs font-body text-primary hover:underline"
                    >
                      <Plus size={13} /> Add Goal
                    </button>
                  )}
                </div>

                {panelGoalAdding && (
                  <div className="mb-3 p-3 border border-dashed border-primary/30 rounded-xl bg-primary-light/20 space-y-2">
                    <input
                      className="input text-sm w-full"
                      placeholder="Describe the goal…"
                      value={panelGoalDraft}
                      onChange={e => setPanelGoalDraft(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={panelAddGoal} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
                      <button onClick={() => setPanelGoalAdding(false)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
                    </div>
                  </div>
                )}

                {goals.length === 0 && !panelGoalAdding ? (
                  <p className="font-body text-xs text-gray-400">No goals recorded</p>
                ) : (
                  <div className="space-y-2">
                    {goals.map((g, i) => (
                      <div key={g.id}>
                        {panelGoalEditing?.id === g.id ? (
                          <div className="p-3 border border-dashed border-primary/30 rounded-xl bg-primary-light/20 space-y-2">
                            <input
                              className="input text-sm w-full"
                              value={panelGoalEditing.goal_text}
                              onChange={e => setPanelGoalEditing(prev => ({ ...prev, goal_text: e.target.value }))}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={panelUpdateGoal} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
                              <button onClick={() => setPanelGoalEditing(null)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-primary-light text-primary text-[10px] font-semibold font-body flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              <p className="font-body text-sm text-gray-700">{g.goal_text}</p>
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button onClick={() => setPanelGoalEditing({ ...g })} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                              <button onClick={() => panelDeleteGoal(g.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="border-t border-gray-100" />

              {/* ── C: Overwhelming Factors ── */}
              <section>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading text-lg text-gray-700">What Feels Most Overwhelming</h3>
                </div>
                <p className="font-body text-xs text-gray-400 mb-3">Saved automatically when you close the panel.</p>
                <div className="space-y-2">
                  {OVERWHELMING_OPTIONS.map(opt => {
                    const checked = draftOverwhelming.includes(opt)
                    return (
                      <div key={opt}>
                        <button
                          type="button"
                          onClick={() => setDraftOverwhelming(prev =>
                            prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
                          )}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-body text-left transition-all border ${
                            checked ? 'border-primary bg-primary-light text-primary' : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                            checked ? 'bg-primary border-primary' : 'border-gray-300'
                          }`}>
                            {checked && <Check size={10} className="text-white" />}
                          </div>
                          {opt}
                        </button>
                        {opt === 'Other' && checked && (
                          <input
                            className="input mt-1.5 text-sm"
                            placeholder="Please describe…"
                            value={draftOverwhelmingOther}
                            onChange={e => setDraftOverwhelmingOther(e.target.value)}
                            autoFocus
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ── D: Care Experience ── */}
              <section>
                <h3 className="font-heading text-lg text-gray-700 mb-1">Care Experience</h3>
                <p className="font-body text-xs text-gray-400 mb-4">Saved automatically when you close the panel.</p>
                <div className="space-y-5">
                  {CARE_EXP_QUESTIONS.map(q => (
                    <div key={q.key}>
                      <p className="font-body text-sm font-medium text-gray-600 mb-2">{q.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {q.options.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDraftCareExp(prev => ({ ...prev, [q.key]: opt }))}
                            className={`px-4 py-1.5 rounded-xl text-sm font-body transition-all border ${
                              draftCareExp[q.key] === opt
                                ? 'bg-primary text-white border-primary'
                                : 'border-gray-200 text-gray-600 hover:border-primary/30'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ── E: Hospitalizations ── */}
              <section className="pb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-lg text-gray-700">Hospitalizations / ER Visits</h3>
                  {!panelHospAdding && (
                    <button
                      onClick={() => { setPanelHospAdding(true); setPanelHospDraft({ reason: '', hospital: '', admission_date: '', discharge_date: '' }) }}
                      className="flex items-center gap-1 text-xs font-body text-primary hover:underline"
                    >
                      <Plus size={13} /> Add
                    </button>
                  )}
                </div>

                {panelHospAdding && (
                  <div className="mb-4 p-3 border border-dashed border-gray-200 rounded-xl bg-gray-50 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Reason *</label>
                        <input className="input text-sm" value={panelHospDraft.reason} onChange={e => setPanelHospDraft(p => ({ ...p, reason: e.target.value }))} placeholder="Reason" autoFocus />
                      </div>
                      <div>
                        <label className="label">Hospital</label>
                        <input className="input text-sm" value={panelHospDraft.hospital} onChange={e => setPanelHospDraft(p => ({ ...p, hospital: e.target.value }))} placeholder="Hospital" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Admission</label>
                        <input type="date" className="input text-sm" value={panelHospDraft.admission_date} onChange={e => setPanelHospDraft(p => ({ ...p, admission_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Discharge</label>
                        <input type="date" className="input text-sm" value={panelHospDraft.discharge_date} onChange={e => setPanelHospDraft(p => ({ ...p, discharge_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={panelAddHosp} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
                      <button onClick={() => setPanelHospAdding(false)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
                    </div>
                  </div>
                )}

                {hospitalizations.length === 0 && !panelHospAdding ? (
                  <p className="font-body text-xs text-gray-400">No hospitalizations on record</p>
                ) : (
                  <div className="space-y-3">
                    {hospitalizations.map(h => (
                      <div key={h.id} className="bg-gray-50 rounded-xl px-4 py-3">
                        {panelHospEditing?.id === h.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="label">Reason *</label>
                                <input className="input text-sm" value={panelHospEditing.reason || ''} onChange={e => setPanelHospEditing(p => ({ ...p, reason: e.target.value }))} />
                              </div>
                              <div>
                                <label className="label">Hospital</label>
                                <input className="input text-sm" value={panelHospEditing.hospital || ''} onChange={e => setPanelHospEditing(p => ({ ...p, hospital: e.target.value }))} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="label">Admission</label>
                                <input type="date" className="input text-sm" value={(panelHospEditing.admission_date || '').slice(0, 10)} onChange={e => setPanelHospEditing(p => ({ ...p, admission_date: e.target.value }))} />
                              </div>
                              <div>
                                <label className="label">Discharge</label>
                                <input type="date" className="input text-sm" value={(panelHospEditing.discharge_date || '').slice(0, 10)} onChange={e => setPanelHospEditing(p => ({ ...p, discharge_date: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={panelUpdateHosp} className="btn-primary flex-1 py-1.5 text-xs">Save</button>
                              <button onClick={() => setPanelHospEditing(null)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-body text-sm font-semibold text-gray-700">{h.reason}</p>
                              {h.hospital && <p className="font-body text-xs text-gray-500 mt-0.5">{h.hospital}</p>}
                              {(h.admission_date || h.discharge_date) && (
                                <p className="font-body text-xs text-gray-400 mt-1">
                                  {h.admission_date ? format(parseISO(h.admission_date), 'MMM d, yyyy') : '?'}
                                  {' → '}
                                  {h.discharge_date ? format(parseISO(h.discharge_date), 'MMM d, yyyy') : 'present'}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button onClick={() => setPanelHospEditing({ ...h })} className="p-1 text-gray-300 hover:text-primary transition-colors"><Edit3 size={12} /></button>
                              <button onClick={() => panelDeleteHosp(h.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </div>
        </>
      )}
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
  // Track which select fields are in "other / free-text" mode.
  const [otherMode, setOtherMode] = useState(() => {
    const init = {}
    fields.forEach(f => {
      if (f.type === 'select' && f.options && draft[f.key] && !f.options.includes(draft[f.key])) {
        init[f.key] = true
      }
    })
    return init
  })

  function handleSelectChange(f, val) {
    if (val === '__other__') {
      setOtherMode(m => ({ ...m, [f.key]: true }))
      onChange({ ...draft, [f.key]: '' })
    } else {
      setOtherMode(m => ({ ...m, [f.key]: false }))
      onChange({ ...draft, [f.key]: val })
    }
  }

  return (
    <div className="border border-dashed border-primary/30 rounded-xl p-3 space-y-2 mb-3 bg-primary-light/20">
      {fields.map(f => (
        <div key={f.key}>
          <label className="label">{f.label}{f.required ? ' *' : ''}</label>
          {f.type === 'select' ? (
            <div className="space-y-1.5">
              <select
                className="input text-xs"
                value={otherMode[f.key] ? '__other__' : (draft[f.key] || '')}
                onChange={e => handleSelectChange(f, e.target.value)}
              >
                <option value="">Select…</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                <option value="__other__">Other</option>
              </select>
              {otherMode[f.key] && (
                <input
                  className="input text-xs"
                  placeholder="Describe…"
                  value={draft[f.key] || ''}
                  onChange={e => onChange({ ...draft, [f.key]: e.target.value })}
                />
              )}
            </div>
          ) : f.type === 'date' ? (
            <input
              type="date"
              className="input text-xs"
              value={draft[f.key] || ''}
              onChange={e => onChange({ ...draft, [f.key]: e.target.value })}
            />
          ) : f.multiline ? (
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
    <div className="border border-dashed border-primary/30 rounded-xl p-3 space-y-2.5 mb-3 bg-primary-light/20">
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
                (draft.schedule_days || []).includes(day) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
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
  const editor = useEditor({
    extensions: [
      StarterKit,           // bold, italic, strike, bulletList, orderedList, listItem, etc.
      Underline,
      TextStyle,            // required by Color
      Color,
      Typography,           // auto-converts "- " → bullet, quotes, etc.
    ],
    content: value || '',
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  if (!editor) return null

  const cmd = (fn) => (e) => { e.preventDefault(); fn(); }
  const colors = ['#1f2937', '#4F7EE0', '#dc2626', '#16a34a', '#9CA3AF']

  return (
    <>
      <style>{`
        .sbha-tiptap .ProseMirror {
          min-height: 120px; padding: 12px 16px;
          font-size: 0.875rem; line-height: 1.6; color: #374151;
          outline: none;
        }
        .sbha-tiptap .ProseMirror ul  { list-style-type: disc;    padding-left: 1.5rem; margin: 0.25rem 0; }
        .sbha-tiptap .ProseMirror ol  { list-style-type: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
        .sbha-tiptap .ProseMirror li  { display: list-item; }
        .sbha-tiptap .ProseMirror p   { margin: 0 0 0.25rem; }
        .sbha-tiptap .ProseMirror p:last-child { margin-bottom: 0; }
        .sbha-tiptap .ProseMirror > *:first-child { margin-top: 0; }
        .sbha-tiptap .ProseMirror.ProseMirror-focused { outline: none; }
      `}</style>
      <div className="sbha-tiptap border border-gray-200 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2.5 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          <TBtn active={editor.isActive('bold')}        onMouseDown={cmd(() => editor.chain().focus().toggleBold().run())}        title="Bold"><strong className="text-xs">B</strong></TBtn>
          <TBtn active={editor.isActive('italic')}      onMouseDown={cmd(() => editor.chain().focus().toggleItalic().run())}      title="Italic"><em className="text-xs">I</em></TBtn>
          <TBtn active={editor.isActive('underline')}   onMouseDown={cmd(() => editor.chain().focus().toggleUnderline().run())}   title="Underline"><span className="underline text-xs">U</span></TBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <TBtn active={editor.isActive('bulletList')}  onMouseDown={cmd(() => editor.chain().focus().toggleBulletList().run())}  title="Bullet list"><List size={12} /></TBtn>
          <TBtn active={editor.isActive('orderedList')} onMouseDown={cmd(() => editor.chain().focus().toggleOrderedList().run())} title="Numbered list"><ListOrdered size={12} /></TBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {colors.map(color => (
            <button
              key={color}
              onMouseDown={cmd(() => editor.chain().focus().setColor(color).run())}
              title={color}
              className="w-4 h-4 rounded-full border border-white shadow-sm hover:scale-110 transition-transform flex-shrink-0"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        {/* Editor area */}
        <EditorContent editor={editor} />
      </div>
    </>
  )
}

function TBtn({ children, onMouseDown, active, title }) {
  return (
    <button
      onMouseDown={onMouseDown}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-all ${
        active ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

// ── NoteModal ─────────────────────────────────────────────────────────────────
function NoteModal({ modal, onClose, onSave, onUpdate, onDelete, saving }) {
  const isNew = modal.mode === 'new'
  const note = modal.note || null
  const [mode, setMode] = useState(isNew ? 'edit' : 'view')

  // Independent state variable per field
  const [noteTitle, setNoteTitle] = useState(isNew ? '' : (note?.title || ''))
  const [noteType, setNoteType] = useState(() => {
    if (isNew) return 'General'
    return NOTE_TYPES.includes(note?.note_type) ? note.note_type : 'Other'
  })
  const [customLabel, setCustomLabel] = useState(() => {
    if (isNew || !note?.note_type) return ''
    return NOTE_TYPES.includes(note.note_type) ? '' : note.note_type
  })
  const [noteDate, setNoteDate] = useState(isNew ? today : ((note?.note_date || today).slice(0, 10)))
  const [noteBody, setNoteBody] = useState(isNew ? '' : (note?.body || ''))

  // Escape to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function enterEditMode() {
    setNoteTitle(note.title || '')
    setNoteType(NOTE_TYPES.includes(note.note_type) ? note.note_type : 'Other')
    setCustomLabel(NOTE_TYPES.includes(note.note_type) ? '' : (note.note_type || ''))
    setNoteDate((note.note_date || today).slice(0, 10))
    setNoteBody(note.body || '')
    setMode('edit')
  }

  function handleSave() {
    const resolvedType = noteType === 'Other' ? (customLabel.trim() || 'Other') : noteType
    const payload = { noteTitle, noteType: resolvedType, noteDate, noteBody }
    if (isNew) onSave(payload)
    else onUpdate(note.id, payload)
  }

  async function handleDelete() {
    await onDelete(note.id)
    onClose()
  }

  const canSave = noteTitle.trim().length > 0
  const viewTypeKey = note
    ? (NOTE_TYPES.includes(note.note_type) ? note.note_type : 'Other')
    : 'General'
  const viewTypeLabel = viewTypeKey === 'Other' && note?.note_type && note.note_type !== 'Other'
    ? note.note_type
    : viewTypeKey
  const viewColorClass = NOTE_TYPE_COLORS[viewTypeKey] || NOTE_TYPE_COLORS['General']

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
              <span className={`tag border text-[10px] flex-shrink-0 ${viewColorClass}`}>
                {viewTypeLabel}
              </span>
            )}
            <h2 className="font-heading text-xl font-semibold text-gray-800 truncate">
              {isNew ? 'New Note' : (mode === 'view' ? (note.title || 'Note') : 'Edit Note')}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isNew && mode === 'view' && (
              <>
                <button
                  onClick={enterEditMode}
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
              <style>{`
                .sbha-note-body ul  { list-style-type: disc;    padding-left: 1.5rem; margin: 0.25rem 0; }
                .sbha-note-body ol  { list-style-type: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
                .sbha-note-body li  { display: list-item; margin: 0.1rem 0; }
                .sbha-note-body strong { font-weight: 700; }
                .sbha-note-body em     { font-style: italic; }
                .sbha-note-body u      { text-decoration: underline; }
                .sbha-note-body p   { margin-bottom: 0.75rem; }
                .sbha-note-body p:last-child { margin-bottom: 0; }
                .sbha-note-body p:empty::before { content: '\\00a0'; }
              `}</style>
              <p className="font-body text-xs text-gray-400 mb-4">
                {note.note_date ? format(parseISO(note.note_date.slice(0, 10)), 'MMMM d, yyyy') : ''}
              </p>
              {note.body ? (
                <div
                  className="sbha-note-body font-body text-sm text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: note.body }}
                />
              ) : (
                <p className="font-body text-sm text-gray-400 italic">No body content.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Title *">
                <input
                  className="input"
                  placeholder="Note title"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  autoFocus
                />
              </Field>
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
                <Field label="Date">
                  <input
                    type="date"
                    className="input"
                    value={noteDate}
                    onChange={e => setNoteDate(e.target.value)}
                  />
                </Field>
              </div>
              {noteType === 'Other' && (
                <Field label="Custom Label">
                  <input
                    className="input"
                    placeholder="Describe the note type"
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Body">
                <RichTextEditor
                  key={`${note?.id ?? 'new'}-${mode}`}
                  value={noteBody}
                  onChange={setNoteBody}
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
