import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInYears, isAfter, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import {
  ArrowLeft, Phone, Mail, MapPin, User, Pill, Activity, Stethoscope,
  Users, Calendar, FileText, Plus, Sparkles, Trash2, Edit3, Clock,
  Shield, X, Check, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Target, Paperclip,
  Download, List, ListOrdered, ToggleLeft, ToggleRight, Search, CheckCircle, MoreVertical, SlidersHorizontal, ClipboardList, Printer,
} from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } from 'docx'
import { saveAs } from 'file-saver'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Typography } from '@tiptap/extension-typography'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function formatTime(t) {
  if (!t) return ''
  if (/[ap]m/i.test(t)) return t // already formatted
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${(m || 0).toString().padStart(2, '0')} ${ampm}`
}
// Parse appointment datetime as local time (strips tz offset from TIMESTAMPTZ string)
// Prevents UTC→local conversion shifting times when stored without explicit offset
function parseApptDateLocal(dateStr) {
  if (!dateStr) return new Date(0)
  return parseISO(dateStr.slice(0, 16))
}
function scheduleRowsToBlocks(rows) {
  if (!rows || rows.length === 0) return [{ tempId: '0', days: [], start_time: '', end_time: '' }]
  const groups = {}
  for (const row of rows) {
    const key = `${row.start_time ?? ''}|${row.end_time ?? ''}`
    if (!groups[key]) groups[key] = { start_time: row.start_time || '', end_time: row.end_time || '', days: [] }
    groups[key].days.push(row.day)
  }
  return Object.values(groups).map((g, i) => ({
    tempId: String(i),
    days: g.days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)),
    start_time: g.start_time,
    end_time: g.end_time,
  }))
}
function groupScheduleRows(rows) {
  return scheduleRowsToBlocks(rows) // same grouping logic, used for display
}
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
const APPT_TYPE_COLORS = {
  'Doctor Appointment': 'bg-blue-50 text-blue-600 border-blue-100',
  'Patient Meeting':    'bg-purple-50 text-purple-600 border-purple-100',
  'Family Meeting':     'bg-amber-50 text-amber-600 border-amber-100',
  'SBHA General Event': 'bg-green-50 text-green-600 border-green-100',
  'Other':              'bg-pink-50 text-pink-600 border-pink-100',
}
const NOTE_TYPE_COLORS = {
  'Call Summary':         'bg-blue-50 text-blue-600 border-blue-100',
  'Appointment Note':     'bg-purple-50 text-purple-600 border-purple-100',
  'Action Item':          'bg-amber-50 text-amber-600 border-amber-100',
  'Family Communication': 'bg-green-50 text-green-600 border-green-100',
  'General':              'bg-gray-100 text-gray-500 border-gray-200',
  'Other':                'bg-pink-50 text-pink-600 border-pink-100',
}
// CSS color values for note type badges in the print export
const NOTE_TYPE_PRINT = {
  'Call Summary':         { bg: '#eff6ff', fg: '#2563eb', border: '#bfdbfe' },
  'Appointment Note':     { bg: '#faf5ff', fg: '#9333ea', border: '#e9d5ff' },
  'Action Item':          { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  'Family Communication': { bg: '#f0fdf4', fg: '#16a34a', border: '#bbf7d0' },
  'General':              { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
  'Other':                { bg: '#fdf2f8', fg: '#db2777', border: '#fbcfe8' },
}
function badgeBg(type)     { return (NOTE_TYPE_PRINT[type] || NOTE_TYPE_PRINT['Other']).bg }
function badgeFg(type)     { return (NOTE_TYPE_PRINT[type] || NOTE_TYPE_PRINT['Other']).fg }
function badgeBorder(type) { return (NOTE_TYPE_PRINT[type] || NOTE_TYPE_PRINT['Other']).border }
const today = format(new Date(), 'yyyy-MM-dd')
function getDocFileCategory(doc) {
  const mime = (doc.file_type || '').toLowerCase()
  const name = (doc.name || '').toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/.test(name)) return 'image'
  return 'other'
}
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
  const [caretakerSchedules, setCaretakerSchedules] = useState({}) // { [caretakerId]: [{id,day,start_time,end_time}] }
  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [goals, setGoals] = useState([])
  const [appointments, setAppointments] = useState([])
  const [hospitalizations, setHospitalizations] = useState([])
  const [insurances, setInsurances] = useState([])
  const [notes, setNotes] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  // AI
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Collapsible cards
  const [collapsedCards, setCollapsedCards] = useState({})
  function toggleCard(key) {
    setCollapsedCards(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Section editing (demographics)
  const [editingSection, setEditingSection] = useState(null)
  const [draftPatient, setDraftPatient] = useState({})
  const [saving, setSaving] = useState(false)

  // Insurance modal
  const [insuranceModal, setInsuranceModal] = useState(null) // null | { mode: 'new'|'edit', draft, id? }
  const [savingInsurance, setSavingInsurance] = useState(false)

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
  const [showNoteFilters, setShowNoteFilters] = useState(false)
  const noteFiltersRef = useRef(null)

  // Three-dot actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const actionsMenuRef = useRef(null)

  // Delete patient confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
  const [showPastAppts, setShowPastAppts] = useState(false)
  const [pastApptSearch, setPastApptSearch] = useState('')
  const [upcomingApptSearch, setUpcomingApptSearch] = useState('')
  const [apptModal, setApptModal] = useState(null) // null | { mode:'new'|'edit', draft:{} } | { mode:'view', appt:{} }
  const [savingAppt, setSavingAppt] = useState(false)
  const [calViewDate, setCalViewDate] = useState(new Date())
  const [calSelectedDate, setCalSelectedDate] = useState(null) // 'yyyy-MM-dd' | null

  // Quick note (header)
  const [editingQuickNote, setEditingQuickNote] = useState(false)
  const [quickNoteValue, setQuickNoteValue] = useState('')

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docPreview, setDocPreview] = useState(null) // null | { doc, url }
  const [renamingDoc, setRenamingDoc] = useState(null) // null | { id, name }
  const [reassigningDoc, setReassigningDoc] = useState(null) // null | doc object
  const [activePatients, setActivePatients] = useState([])
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

  useEffect(() => {
    if (!showNoteFilters) return
    function handleClickOutside(e) {
      if (noteFiltersRef.current && !noteFiltersRef.current.contains(e.target)) {
        setShowNoteFilters(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNoteFilters])

  async function loadPatient() {
    setLoading(true)
    const [p, c, m, pr, ct, ec, gl, ap, hosp, n, nd, docs, ins, pts] = await Promise.all([
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
      supabase.from('insurances').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('patients').select('id, first_name, last_name').eq('status', 'active').is('deleted_at', null).order('first_name'),
    ])
    setPatient(p.data)
    setConditions(c.data || [])
    setMedications(m.data || [])
    setProviders(pr.data || [])
    const ctData = ct.data || []
    setCaretakers(ctData)
    // Load + migrate caretaker schedules
    if (ctData.length > 0) {
      const ctIds = ctData.map(x => x.id)
      const { data: schedData } = await supabase.from('caretaker_schedules').select('*').in('caretaker_id', ctIds)
      const grouped = {}
      for (const s of schedData || []) {
        if (!grouped[s.caretaker_id]) grouped[s.caretaker_id] = []
        grouped[s.caretaker_id].push(s)
      }
      // Migrate legacy schedule_days / schedule_time for caretakers with no schedule rows yet
      const toMigrate = ctData.filter(c => (c.schedule_days || []).length > 0 && !grouped[c.id])
      if (toMigrate.length > 0) {
        const migrateRows = toMigrate.flatMap(c => {
          const parts = (c.schedule_time || '').split(/\s*[–—\-]\s*/)
          const start_time = parts[0]?.trim() || null
          const end_time = parts[1]?.trim() || null
          return c.schedule_days.map(day => ({ caretaker_id: c.id, day, start_time, end_time }))
        })
        const { data: migrated } = await supabase.from('caretaker_schedules').insert(migrateRows).select()
        for (const s of migrated || []) {
          if (!grouped[s.caretaker_id]) grouped[s.caretaker_id] = []
          grouped[s.caretaker_id].push(s)
        }
      }
      setCaretakerSchedules(grouped)
    }
    setEmergencyContacts(ec.data || [])
    setGoals(gl.data || [])
    setAppointments(ap.data || [])
    setHospitalizations(hosp.data || [])
    setNotes(n.data || [])
    setDeletedNotes(nd.data || [])
    setDocuments(docs.data || [])
    setActivePatients(pts.data || [])

    // Auto-migrate legacy insurance fields from patients table
    let insData = ins.data || []
    if (insData.length === 0 && p.data?.insurance_type) {
      const { data: migrated } = await supabase.from('insurances').insert({
        patient_id: id,
        insurance_type: p.data.insurance_type,
        insurance_provider: p.data.insurance_provider || null,
        billing_concerns: p.data.billing_concerns || null,
        is_primary: true,
      }).select()
      insData = migrated || []
    }
    setInsurances(insData)
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

  // ── Insurance ─────────────────────────────────────────────────
  async function saveInsurance(resolvedDraft) {
    setSavingInsurance(true)
    const mode = insuranceModal.mode
    const insId = insuranceModal.id
    if (resolvedDraft.is_primary) {
      await supabase.from('insurances').update({ is_primary: false }).eq('patient_id', id)
    }
    const payload = {
      patient_id: id,
      insurance_type: resolvedDraft.insurance_type || null,
      insurance_provider: resolvedDraft.insurance_provider || null,
      billing_concerns: resolvedDraft.billing_concerns || null,
      is_primary: resolvedDraft.is_primary || false,
    }
    if (mode === 'new') {
      await supabase.from('insurances').insert(payload)
    } else {
      await supabase.from('insurances').update(payload).eq('id', insId)
    }
    const { data } = await supabase.from('insurances').select('*').eq('patient_id', id).order('created_at')
    setInsurances(data || [])
    setInsuranceModal(null)
    setSavingInsurance(false)
  }

  async function deleteInsurance(insId) {
    await supabase.from('insurances').delete().eq('id', insId)
    setInsurances(prev => prev.filter(i => i.id !== insId))
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

  async function deletePatient() {
    await supabase.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setShowDeleteConfirm(false)
    navigate('/')
  }

  // ── Per-item CRUD ─────────────────────────────────────────────
  const TABLE = { conditions: 'conditions', medications: 'medications', providers: 'providers', caretakers: 'caretakers', emergency_contacts: 'emergency_contacts', goals: 'goals', hospitalizations: 'hospitalizations' }
  const SETTER = { conditions: setConditions, medications: setMedications, providers: setProviders, caretakers: setCaretakers, emergency_contacts: setEmergencyContacts, goals: setGoals, hospitalizations: setHospitalizations }

  function startEditItem(type, item) {
    if (type === 'caretakers') {
      setEditingItem({ type, id: item.id, draft: { ...item, scheduleBlocks: scheduleRowsToBlocks(caretakerSchedules[item.id] || []) } })
      return
    }
    setEditingItem({ type, id: item.id, draft: { ...item } })
  }

  async function saveCaretakerSchedules(ctId, blocks) {
    await supabase.from('caretaker_schedules').delete().eq('caretaker_id', ctId)
    const rows = (blocks || []).flatMap(b =>
      (b.days || []).map(day => ({ caretaker_id: ctId, day, start_time: b.start_time || null, end_time: b.end_time || null }))
    )
    if (rows.length === 0) { setCaretakerSchedules(prev => ({ ...prev, [ctId]: [] })); return }
    const { data } = await supabase.from('caretaker_schedules').insert(rows).select()
    setCaretakerSchedules(prev => ({ ...prev, [ctId]: data || [] }))
  }

  async function saveItem() {
    if (!editingItem) return
    const { type, id: itemId, draft } = editingItem
    if (type === 'caretakers') {
      const { scheduleBlocks, schedule_days: _sd, schedule_time: _st, ...fields } = draft
      const { data } = await supabase.from('caretakers').update(fields).eq('id', itemId).select().single()
      if (data) setCaretakers(prev => prev.map(x => x.id === itemId ? data : x))
      await saveCaretakerSchedules(itemId, scheduleBlocks)
      setEditingItem(null)
      return
    }
    const { data } = await supabase.from(TABLE[type]).update(draft).eq('id', itemId).select().single()
    if (data) SETTER[type](prev => prev.map(x => x.id === itemId ? data : x))
    setEditingItem(null)
  }

  async function deleteItem(type, itemId) {
    await supabase.from(TABLE[type]).delete().eq('id', itemId)
    SETTER[type](prev => prev.filter(x => x.id !== itemId))
    if (type === 'caretakers') setCaretakerSchedules(prev => { const n = { ...prev }; delete n[itemId]; return n })
  }

  async function saveNewItem() {
    if (!addingItem) return
    const { type, draft } = addingItem
    if (type === 'caretakers') {
      const { scheduleBlocks, schedule_days: _sd, schedule_time: _st, ...fields } = draft
      const { data } = await supabase.from('caretakers').insert({ patient_id: id, ...fields }).select().single()
      if (data) {
        setCaretakers(prev => [...prev, data])
        await saveCaretakerSchedules(data.id, scheduleBlocks)
      }
      setAddingItem(null)
      return
    }
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

  async function saveNote({ noteTitle, noteType, noteDate, noteBody, pendingFiles = [] }) {
    if (!noteTitle.trim()) return
    setSavingNote(true)
    console.log('[saveNote] Inserting note:', { noteTitle, noteType, noteDate, patient_id: id, pendingFiles: pendingFiles.length })
    const { data: noteData, error: noteError } = await supabase.from('notes').insert({
      patient_id: id,
      title: noteTitle,
      note_type: noteType,
      note_date: noteDate,
      body: noteBody,
    }).select().single()
    console.log('[saveNote] Insert result:', { noteData, noteError })
    if (noteData && pendingFiles.length > 0) {
      await uploadNoteFiles(noteData.id, id, pendingFiles)
    }
    await refreshNotes()
    setNoteModal(null)
    setSavingNote(false)
  }

  async function updateNote(noteId, { noteTitle, noteType, noteDate, noteBody, pendingFiles = [] }) {
    if (!noteTitle.trim()) return
    setSavingNote(true)
    await supabase.from('notes').update({
      title: noteTitle,
      note_type: noteType,
      note_date: noteDate,
      body: noteBody,
    }).eq('id', noteId)
    if (pendingFiles.length > 0) {
      await uploadNoteFiles(noteId, id, pendingFiles)
    }
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

  async function uploadNoteFiles(noteId, patientId, files) {
    console.log('[uploadNoteFiles] noteId:', noteId, '| patientId:', patientId, '| files:', files.length)
    if (!noteId) {
      console.error('[uploadNoteFiles] noteId is falsy — aborting')
      return
    }
    for (const file of files) {
      const path = `notes/${patientId}/${noteId}/${Date.now()}-${file.name}`
      console.log('[uploadNoteFiles] Uploading to path:', path)
      const { data: upload, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file)
      console.log('[uploadNoteFiles] Storage upload result:', { upload, uploadError })
      if (uploadError) { console.error('[uploadNoteFiles] Storage upload failed:', uploadError); continue }
      const { data: attachData, error: attachError } = await supabase.from('note_attachments').insert({
        note_id: noteId,
        patient_id: patientId,
        name: file.name,
        file_url: upload.path,
        file_type: file.type,
        file_size: file.size,
      })
      console.log('[uploadNoteFiles] note_attachments insert result:', { attachData, attachError })
      if (attachError) console.error('[uploadNoteFiles] note_attachments insert failed:', attachError)
    }
  }

  // ── Quick Note ────────────────────────────────────────────────
  async function saveQuickNote() {
    await supabase.from('patients').update({ quick_description: quickNoteValue }).eq('id', id)
    setPatient(prev => ({ ...prev, quick_description: quickNoteValue }))
    setEditingQuickNote(false)
  }

  // ── Appointments ──────────────────────────────────────────────
  // resolvedDraft comes from AppointmentModal's local state (not apptModal.draft, which is the initial snapshot)
  async function saveApptModal(resolvedDraft) {
    if (!resolvedDraft?.title?.trim() || !resolvedDraft?.appointment_date) {
      console.warn('[saveApptModal] Validation failed — title or appointment_date missing', resolvedDraft)
      return
    }
    setSavingAppt(true)
    // Use presence of id to distinguish insert vs update (supports edit-from-view-mode)
    if (!resolvedDraft.id) {
      const payload = { patient_id: id, ...resolvedDraft }
      console.log('[saveApptModal] Inserting:', payload)
      const { data, error } = await supabase.from('appointments').insert(payload).select().single()
      console.log('[saveApptModal] Insert result:', data, 'Error:', error)
      if (data) setAppointments(prev => [...prev, data].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
    } else {
      const { id: apptId, patient_id: _pid, created_at: _ca, ...fields } = resolvedDraft
      console.log('[saveApptModal] Updating id:', apptId, 'Fields:', fields)
      const { data, error } = await supabase.from('appointments').update(fields).eq('id', apptId).select().single()
      console.log('[saveApptModal] Update result:', data, 'Error:', error)
      if (data) setAppointments(prev => prev.map(a => a.id === apptId ? data : a).sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))
    }
    setSavingAppt(false)
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
    if (!data?.signedUrl) return
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = doc.name
    a.click()
  }

  async function openDocPreview(doc) {
    const category = getDocFileCategory(doc)
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_url, 300)
    if (!data?.signedUrl) return
    if (category === 'other') {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = doc.name
      a.click()
      return
    }
    setDocPreview({ doc, url: data.signedUrl })
  }

  async function deleteDocument(doc) {
    await supabase.storage.from('documents').remove([doc.file_url])
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  async function renameDocumentFn(docId, newName) {
    if (!newName.trim()) return
    await supabase.from('documents').update({ name: newName.trim() }).eq('id', docId)
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, name: newName.trim() } : d))
    setRenamingDoc(null)
  }

  async function reassignDocument(docId, patientId) {
    await supabase.from('documents').update({ patient_id: patientId || null }).eq('id', docId)
    // Either unassigned or moved to another patient — remove from this profile's list
    setDocuments(prev => prev.filter(d => d.id !== docId))
    setReassigningDoc(null)
  }

  function exportProfilePDF() {
    const age = patient?.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : null
    const upcoming = appointments
      .filter(a => !a.completed && isAfter(parseApptDateLocal(a.appointment_date), startOfDay(new Date())))
      .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))

    function field(label, value) {
      if (!value) return ''
      return `<div class="field"><div class="label">${label}</div><div class="value">${value}</div></div>`
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${patient.first_name} ${patient.last_name} — Patient Profile</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Montserrat', Arial, sans-serif; color: #1f2937; padding: 40px; font-size: 12px; line-height: 1.6; }
    .patient-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 34px; font-weight: 600; color: #111827; margin-bottom: 6px; }
    .meta-row { display: flex; gap: 16px; align-items: center; margin-bottom: 28px; flex-wrap: wrap; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .badge-active { background: #d1fae5; color: #065f46; }
    .badge-inactive { background: #f3f4f6; color: #6b7280; }
    .meta-item { font-size: 11px; color: #6b7280; }
    .meta-item strong { color: #374151; }
    .section { margin-bottom: 22px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #f3f4f6; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
    .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 20px; }
    .field { margin-bottom: 12px; }
    .label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
    .value { font-size: 12px; color: #374151; }
    .card { border: 1px solid #f3f4f6; border-radius: 8px; padding: 9px 12px; margin-bottom: 7px; background: #fafafa; }
    .card-title { font-size: 12px; font-weight: 600; color: #1f2937; margin-bottom: 3px; }
    .card-detail { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .tag { display: inline-block; background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 500; margin: 2px 3px 2px 0; }
    .appt-row { display: flex; gap: 16px; align-items: flex-start; }
    .appt-date { font-size: 11px; color: #374151; font-weight: 600; min-width: 90px; }
    .appt-time { font-size: 10px; color: #9ca3af; margin-top: 1px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
    @page { margin: 1.5cm; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
  <div class="meta-row">
    <span class="badge ${patient.status === 'active' ? 'badge-active' : 'badge-inactive'}">${patient.status || 'active'}</span>
    ${age !== null ? `<span class="meta-item"><strong>${age} yrs</strong></span>` : ''}
    ${patient.dob ? `<span class="meta-item">DOB: <strong>${format(parseISO(patient.dob), 'MMMM d, yyyy')}</strong></span>` : ''}
    ${patient.client_since ? `<span class="meta-item">Client since <strong>${format(parseISO(patient.client_since), 'MMMM yyyy')}</strong></span>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Demographics</div>
    <div class="three-col">
      ${field('Phone', patient.phone)}
      ${field('Email', patient.email)}
      ${field('Address', patient.address)}
    </div>
  </div>

  ${emergencyContacts.length > 0 ? `
  <div class="section">
    <div class="section-title">Emergency Contacts</div>
    ${emergencyContacts.map(ec => `
      <div class="card">
        <div class="card-title">${ec.name}${ec.relationship ? ` &nbsp;·&nbsp; <span style="font-weight:400;color:#6b7280;">${ec.relationship}</span>` : ''}</div>
        ${ec.phone ? `<div class="card-detail">📞 ${ec.phone}</div>` : ''}
        ${ec.email ? `<div class="card-detail">✉ ${ec.email}</div>` : ''}
        ${ec.notes ? `<div class="card-detail" style="color:#9ca3af;">${ec.notes}</div>` : ''}
      </div>
    `).join('')}
  </div>` : ''}

  ${insurances.length > 0 ? `
  <div class="section">
    <div class="section-title">Insurance</div>
    ${insurances.map(ins => `
      <div class="card">
        <div class="card-title">
          ${ins.insurance_provider || 'Unknown Provider'}
          ${ins.is_primary ? ` &nbsp;<span style="background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:600;">Primary</span>` : ''}
        </div>
        ${ins.insurance_type ? `<div class="card-detail">Type: ${ins.insurance_type}</div>` : ''}
        ${ins.billing_concerns ? `<div class="card-detail">Billing notes: ${ins.billing_concerns}</div>` : ''}
      </div>
    `).join('')}
  </div>` : ''}

  ${conditions.length > 0 ? `
  <div class="section">
    <div class="section-title">Conditions</div>
    <div>${conditions.map(c => `<span class="tag">${c.name}</span>`).join('')}</div>
  </div>` : ''}

  ${medications.length > 0 ? `
  <div class="section">
    <div class="section-title">Medications</div>
    <div class="two-col">
      ${medications.map(m => `
        <div class="card">
          <div class="card-title">${m.name}</div>
          ${(m.dose || m.frequency) ? `<div class="card-detail">${[m.dose, m.frequency].filter(Boolean).join(' · ')}</div>` : ''}
          ${m.concerns ? `<div class="card-detail" style="color:#dc2626;">⚠ ${m.concerns}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>` : ''}

  ${providers.length > 0 ? `
  <div class="section">
    <div class="section-title">Care Team</div>
    <div class="two-col">
      ${providers.map(p => `
        <div class="card">
          <div class="card-title">${p.name}${p.role ? ` &nbsp;·&nbsp; <span style="font-weight:400;color:#6b7280;">${p.role}</span>` : ''}</div>
          ${p.practice ? `<div class="card-detail">${p.practice}</div>` : ''}
          ${p.phone ? `<div class="card-detail">📞 ${p.phone}</div>` : ''}
          ${p.fax ? `<div class="card-detail">Fax: ${p.fax}</div>` : ''}
          ${p.email ? `<div class="card-detail">✉ ${p.email}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>` : ''}

  ${caretakers.length > 0 ? `
  <div class="section">
    <div class="section-title">Caretakers</div>
    <div class="two-col">
      ${caretakers.map(ct => {
        const blocks = groupScheduleRows(caretakerSchedules[ct.id] || [])
        const schedLines = blocks
          .filter(b => b.days.length > 0)
          .map(b => `${b.days.join(', ')}${(b.start_time || b.end_time) ? ` · ${formatTime(b.start_time)}${b.end_time ? ` – ${formatTime(b.end_time)}` : ''}` : ''}`)
        return `
          <div class="card">
            <div class="card-title">${ct.name}${ct.role ? ` &nbsp;·&nbsp; <span style="font-weight:400;color:#6b7280;">${ct.role}</span>` : ''}</div>
            ${ct.phone ? `<div class="card-detail">📞 ${ct.phone}</div>` : ''}
            ${ct.email ? `<div class="card-detail">✉ ${ct.email}</div>` : ''}
            ${schedLines.length > 0 ? `<div class="card-detail" style="margin-top:5px;"><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Schedule</span><br>${schedLines.join('<br>')}</div>` : ''}
          </div>
        `
      }).join('')}
    </div>
  </div>` : ''}

  ${upcoming.length > 0 ? `
  <div class="section">
    <div class="section-title">Upcoming Appointments</div>
    ${upcoming.map(a => `
      <div class="card">
        <div class="appt-row">
          <div>
            <div class="appt-date">${format(parseApptDateLocal(a.appointment_date), 'MMM d, yyyy')}</div>
            <div class="appt-time">${format(parseApptDateLocal(a.appointment_date), 'h:mm a')}</div>
          </div>
          <div style="flex:1;">
            <div class="card-title">${a.title}</div>
            ${a.appointment_type ? `<div class="card-detail">${a.appointment_type}</div>` : ''}
            ${a.provider ? `<div class="card-detail">Provider: ${a.provider}</div>` : ''}
            ${a.location ? `<div class="card-detail">📍 ${a.location}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('')}
  </div>` : ''}

  <div class="footer">Exported from SBHA Care Manager · ${format(new Date(), 'MMMM d, yyyy')}</div>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 600)
  }

  // ── AI Briefing ───────────────────────────────────────────────
  async function generateAISummary() {
    setAiLoading(true)
    setAiSummary('')
    const age = patient?.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : 'unknown age'
    const condList = conditions.map(c => c.name).join(', ') || 'None'
    const medList = medications.map(m => [m.name, m.dose, m.frequency].filter(Boolean).join(' ')).join('; ') || 'None'
    const recentNotes = notes.slice(0, 3).map(n => n.title || '').filter(Boolean).join(', ') || 'No recent notes'
    const upcoming = appointments.filter(a => parseApptDateLocal(a.appointment_date) >= new Date()).slice(0, 3)
      .map(a => `${a.title} on ${format(parseApptDateLocal(a.appointment_date), 'MMM d')}`).join(', ') || 'None'
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
  const upcomingAppts = appointments.filter(a => !a.completed && isAfter(parseApptDateLocal(a.appointment_date), now))
  const pastAppts = [...appointments.filter(a => a.completed || !isAfter(parseApptDateLocal(a.appointment_date), now))]
    .sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date))
  // ── Notes filtering (client-side) ─────────────────────────────
  const filtersActive = noteTypeFilter !== 'All' || !!noteDateFrom
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
              <div className="flex items-center gap-0 font-body text-sm text-gray-500">
                {age && <span>Age {age}</span>}
                {patient.dob && (
                  <><span className="mx-2">|</span><span>DOB {format(parseISO(patient.dob), 'MMMM d, yyyy')}</span></>
                )}
                {patient.client_since && (
                  <><span className="mx-2">|</span><span>Client since {format(parseISO(patient.client_since), 'MMMM yyyy')}</span></>
                )}
              </div>
              <span className={`tag ml-1 ${patient.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                {patient.status}
              </span>
            </div>

            {/* Quick note — inline editable */}
            {editingQuickNote ? (
              <input
                autoFocus
                className="mt-2 w-full max-w-md font-body text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10 transition-all"
                value={quickNoteValue}
                onChange={e => setQuickNoteValue(e.target.value)}
                onBlur={saveQuickNote}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveQuickNote()
                  if (e.key === 'Escape') setEditingQuickNote(false)
                }}
                placeholder="Add a quick note…"
              />
            ) : (
              <p
                className={`mt-2 font-body text-sm cursor-text transition-colors ${
                  patient.quick_description
                    ? 'text-gray-500 hover:text-gray-700'
                    : 'text-gray-300 italic hover:text-gray-400'
                }`}
                onClick={() => { setQuickNoteValue(patient.quick_description || ''); setEditingQuickNote(true) }}
                title="Click to edit"
              >
                {patient.quick_description || 'Add a quick note…'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={openIntakePanel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-body text-sm font-semibold shadow-sm transition-all bg-primary text-white hover:bg-primary/90"
            >
              <ClipboardList size={15} />
              Intake &amp; Background
            </button>
            <button
              onClick={generateAISummary}
              disabled={aiLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-body text-sm font-semibold shadow-sm transition-all bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
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
                    onClick={() => { exportProfilePDF(); setShowActionsMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-left text-gray-600 hover:bg-primary-light hover:text-primary transition-colors"
                  >
                    <Printer size={15} />
                    Export Profile as PDF
                  </button>
                  <div className="my-1 border-t border-gray-100" />
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
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowActionsMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-body text-left text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                    Delete Patient
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

      {/* ── COLLAPSE / EXPAND ALL ── */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => setCollapsedCards(Object.fromEntries(['demographics','emergency_contacts','insurance','documents','conditions','medications','care_team','caretakers','appointments','notes'].map(k => [k, true])))}
          className="font-body text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Collapse all
        </button>
        <span className="text-gray-300 text-xs">·</span>
        <button
          onClick={() => setCollapsedCards({})}
          className="font-body text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Expand all
        </button>
      </div>

      {/* ── THREE-COLUMN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">

        {/* ── LEFT: Demographics / Emergency / Insurance / Documents ── */}
        <div className="space-y-6">

          {/* Demographics */}
          <SectionCard
            title="Demographics" icon={<User size={15} />}
            onEdit={() => startEditSection('demographics')}
            editing={editingSection === 'demographics'}
            onSave={saveSection} onCancel={() => setEditingSection(null)} saving={saving}
            collapsed={!!collapsedCards.demographics} onToggle={() => toggleCard('demographics')}
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
          <div className="card p-0">
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 cursor-pointer select-none"
              onClick={() => toggleCard('emergency_contacts')}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {collapsedCards.emergency_contacts ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <span className="text-primary"><Phone size={15} /></span>
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Emergency Contacts</h3>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setAddingItem({ type: 'emergency_contacts', draft: { name: '', relationship: '', phone: '', email: '' } })}
                  className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div
              className={`grid ${collapsedCards.emergency_contacts ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
              style={{ transition: 'grid-template-rows 200ms ease' }}
            >
            <div className="overflow-hidden min-h-0"><div className="px-6 pb-6">

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
                          <button onClick={() => startEditItem('emergency_contacts', ec)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
                          <button onClick={() => deleteItem('emergency_contacts', ec.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div></div></div></div>

          {/* Insurance */}
          <div className="card p-0">
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 cursor-pointer select-none"
              onClick={() => toggleCard('insurance')}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {collapsedCards.insurance ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <Shield size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Insurance</h3>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setInsuranceModal({ mode: 'new', draft: { insurance_type: '', insurance_provider: '', billing_concerns: '', is_primary: insurances.length === 0 } })}
                  className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div
              className={`grid ${collapsedCards.insurance ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
              style={{ transition: 'grid-template-rows 200ms ease' }}
            >
            <div className="overflow-hidden min-h-0"><div className="px-6 pb-6">
            {insurances.length === 0 ? (
              <p className="font-body text-xs text-gray-400">No insurance info on file</p>
            ) : (
              <div className="space-y-4">
                {insurances.map(ins => (
                  <div key={ins.id} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          {ins.insurance_type && (
                            <span className="tag bg-primary text-white text-[10px]">{ins.insurance_type}</span>
                          )}
                          {ins.is_primary && (
                            <span className="tag bg-green-50 text-green-600 border border-green-100 text-[10px]">Primary</span>
                          )}
                        </div>
                        {ins.insurance_provider && (
                          <p className="font-body text-sm text-gray-700">{ins.insurance_provider}</p>
                        )}
                        {ins.billing_concerns && (
                          <p className="font-body text-xs text-gray-500 mt-1 leading-relaxed">{ins.billing_concerns}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => setInsuranceModal({ mode: 'edit', id: ins.id, draft: { insurance_type: ins.insurance_type || '', insurance_provider: ins.insurance_provider || '', billing_concerns: ins.billing_concerns || '', is_primary: ins.is_primary || false } })}
                          className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                        ><Edit3 size={12} /></button>
                        <button onClick={() => deleteInsurance(ins.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insuranceModal && (
              <InsuranceModal
                modal={insuranceModal}
                saving={savingInsurance}
                onClose={() => setInsuranceModal(null)}
                onSave={saveInsurance}
              />
            )}
            </div></div></div>
          </div>

          {/* Documents */}
          <SectionCard title="Documents" icon={<Paperclip size={15} />}
            collapsed={!!collapsedCards.documents} onToggle={() => toggleCard('documents')}
          >
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
                  <div key={doc.id} className="group flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <button
                          onClick={() => openDocPreview(doc)}
                          className="font-body text-xs font-medium text-gray-700 hover:text-primary truncate text-left transition-colors block max-w-full"
                        >
                          {doc.name}
                        </button>
                        <p className="font-body text-[10px] text-gray-400">{format(parseISO(doc.created_at), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setRenamingDoc({ id: doc.id, name: doc.name })} title="Rename"
                        className="p-1 text-gray-300 hover:text-gray-600 transition-colors"><Edit3 size={12} /></button>
                      <button onClick={() => setReassigningDoc(doc)} title="Reassign"
                        className="p-1 text-gray-300 hover:text-primary transition-colors"><User size={12} /></button>
                      <button onClick={() => downloadDocument(doc)} title="Download"
                        className="p-1 text-gray-300 hover:text-primary transition-colors"><Download size={13} /></button>
                      <button onClick={() => deleteDocument(doc)} title="Delete"
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rename Modal */}
            {renamingDoc && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRenamingDoc(null)} />
                <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
                  <h3 className="font-heading text-xl text-gray-800 mb-4">Rename Document</h3>
                  <input
                    className="input w-full"
                    value={renamingDoc.name}
                    onChange={e => setRenamingDoc(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') renameDocumentFn(renamingDoc.id, renamingDoc.name) }}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setRenamingDoc(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={() => renameDocumentFn(renamingDoc.id, renamingDoc.name)} className="btn-primary flex-1 py-2 text-sm">Save</button>
                  </div>
                </div>
              </div>
            )}

            {/* Reassign Modal */}
            {reassigningDoc && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setReassigningDoc(null)} />
                <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
                  <h3 className="font-heading text-xl text-gray-800 mb-1">Reassign Document</h3>
                  <p className="font-body text-xs text-gray-400 mb-4 truncate">{reassigningDoc.name}</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
                    <button
                      onClick={() => reassignDocument(reassigningDoc.id, null)}
                      className="w-full text-left px-3 py-2 rounded-lg font-body text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Unassign (move to general documents)
                    </button>
                    {activePatients.filter(p => p.id !== id).map(p => (
                      <button
                        key={p.id}
                        onClick={() => reassignDocument(reassigningDoc.id, p.id)}
                        className="w-full text-left px-3 py-2 rounded-lg font-body text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {p.first_name} {p.last_name}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setReassigningDoc(null)} className="btn-ghost w-full mt-3 py-2 text-sm">Cancel</button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── MIDDLE: Conditions / Medications / Care Team / Caretakers ── */}
        <div className="space-y-6">

          {/* Conditions */}
          <div className="card p-0">
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 cursor-pointer select-none"
              onClick={() => toggleCard('conditions')}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {collapsedCards.conditions ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <Activity size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Conditions</h3>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setAddingItem({ type: 'conditions', draft: { name: '', notes: '' } })}
                  className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div
              className={`grid ${collapsedCards.conditions ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
              style={{ transition: 'grid-template-rows 200ms ease' }}
            >
            <div className="overflow-hidden min-h-0"><div className="px-6 pb-6">

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
                            <button onClick={() => startEditItem('conditions', c)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
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
            </div></div></div>
          </div>

          {/* Medications */}
          <div className="card p-0">
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 cursor-pointer select-none"
              onClick={() => toggleCard('medications')}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {collapsedCards.medications ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <Pill size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Medications</h3>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setAddingItem({ type: 'medications', draft: { name: '', dose: '', frequency: '', concerns: '', notes: '' } })}
                  className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div
              className={`grid ${collapsedCards.medications ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
              style={{ transition: 'grid-template-rows 200ms ease' }}
            >
            <div className="overflow-hidden min-h-0"><div className="px-6 pb-6">

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
                            <button onClick={() => startEditItem('medications', m)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
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
            </div></div></div>
          </div>

          {/* Care Team */}
          <SectionCard
            title="Care Team" icon={<Stethoscope size={15} />}
            addButton={{ onClick: () => setAddingItem({ type: 'providers', draft: { name: '', role: '', practice: '', phone: '', notes: '' } }) }}
            collapsed={!!collapsedCards.care_team} onToggle={() => toggleCard('care_team')}
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
                            <button onClick={() => startEditItem('providers', p)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
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
            addButton={{ onClick: () => setAddingItem({ type: 'caretakers', draft: { name: '', role: '', phone: '', scheduleBlocks: [{ tempId: '0', days: [], start_time: '', end_time: '' }] } }) }}
            collapsed={!!collapsedCards.caretakers} onToggle={() => toggleCard('caretakers')}
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
                            <button onClick={() => startEditItem('caretakers', ct)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
                            <button onClick={() => deleteItem('caretakers', ct.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        {/* Schedule display — grouped blocks */}
                        {(() => {
                          const rows = caretakerSchedules[ct.id]
                          if (!rows || rows.length === 0) return null
                          const groups = groupScheduleRows(rows)
                          return (
                            <div className="mb-2 space-y-1">
                              <p className="font-body text-[10px] text-gray-400 uppercase tracking-wide mb-1">Schedule</p>
                              {groups.map((g, i) => (
                                <p key={i} className="font-body text-xs text-gray-600">
                                  <span className="font-medium">{g.days.join(', ')}</span>
                                  {(g.start_time || g.end_time) && (
                                    <span className="text-gray-400"> · {formatTime(g.start_time)}{g.end_time ? ` – ${formatTime(g.end_time)}` : ''}</span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )
                        })()}
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

        {/* ── RIGHT: Appointments / Notes ── */}
        <div className="space-y-6">

          {/* Appointments */}
          <SectionCard title="Appointments" icon={<Calendar size={15} />}
            addButton={{ onClick: () => setApptModal({ mode: 'new', draft: { title: '', appointment_type: '', provider: '', location: '', appointment_date: '', notes: '' } }) }}
            collapsed={!!collapsedCards.appointments} onToggle={() => toggleCard('appointments')}
          >
            {/* Calendar widget */}
            <CalendarWidget
              viewDate={calViewDate}
              onPrev={() => setCalViewDate(d => subMonths(d, 1))}
              onNext={() => setCalViewDate(d => addMonths(d, 1))}
              appointments={appointments}
              selectedDate={calSelectedDate}
              onSelectDate={d => setCalSelectedDate(prev => prev === d ? null : d)}
              onView={appt => setApptModal({ mode: 'view', appt })}
              onToday={() => { setCalViewDate(new Date()); setCalSelectedDate(format(new Date(), 'yyyy-MM-dd')) }}
            />

            {/* Upcoming search + list */}
            <div className="mt-5">
              <p className="font-body text-[10px] text-gray-400 uppercase tracking-wider mb-2">Upcoming</p>
              {/* Search bar */}
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                <input
                  type="text"
                  className="input pl-8 text-sm"
                  placeholder="Search upcoming…"
                  value={upcomingApptSearch}
                  onChange={e => setUpcomingApptSearch(e.target.value)}
                />
              </div>
              {(() => {
                const q = upcomingApptSearch.trim().toLowerCase()
                const displayed = q
                  ? upcomingAppts.filter(a =>
                      (a.title || '').toLowerCase().includes(q) ||
                      (a.provider || '').toLowerCase().includes(q) ||
                      (a.location || '').toLowerCase().includes(q)
                    )
                  : upcomingAppts.slice(0, 3)
                if (displayed.length === 0) return (
                  <p className="font-body text-xs text-gray-400">{q ? 'No matches' : 'No upcoming appointments'}</p>
                )
                return (
                  <div className="space-y-2">
                    {displayed.map(appt => {
                      const typeColor = appt.appointment_type
                        ? (APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other'])
                        : null
                      return (
                        <div
                          key={appt.id}
                          onClick={() => setApptModal({ mode: 'view', appt })}
                          className="bg-primary-light rounded-xl px-3 py-2.5 cursor-pointer hover:bg-primary/10 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {typeColor && (
                                <span className={`tag border text-[10px] mb-1 inline-flex ${typeColor}`}>
                                  {appt.appointment_type}
                                </span>
                              )}
                              <p className="font-body text-sm font-semibold text-gray-700 truncate">{appt.title}</p>
                              <p className="font-body text-xs text-primary font-medium mt-0.5">
                                {format(parseApptDateLocal(appt.appointment_date), 'MMM d · h:mm a')}
                              </p>
                              {appt.provider && <p className="font-body text-xs text-gray-500">with {appt.provider}</p>}
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => markApptComplete(appt.id)} title="Mark complete" className="p-1 text-gray-300 hover:text-primary transition-colors"><CheckCircle size={13} /></button>
                              <button onClick={() => deleteAppointment(appt.id)} title="Delete" className="p-1 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Past / Completed */}
            {pastAppts.length > 0 && (
              <div className="border-t border-gray-100 pt-3 mt-4">
                <button
                  onClick={() => { setShowPastAppts(p => !p); setPastApptSearch('') }}
                  className="flex items-center gap-1.5 text-xs font-body text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPastAppts ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Past Appointments ({pastAppts.length})
                </button>
                {showPastAppts && (() => {
                  const q = pastApptSearch.trim().toLowerCase()
                  const filtered = q
                    ? pastAppts.filter(a =>
                        (a.title || '').toLowerCase().includes(q) ||
                        (a.provider || '').toLowerCase().includes(q) ||
                        (a.location || '').toLowerCase().includes(q)
                      )
                    : pastAppts
                  return (
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                        <input
                          type="text"
                          className="input pl-7 text-xs py-1.5"
                          placeholder="Search past appointments…"
                          value={pastApptSearch}
                          onChange={e => setPastApptSearch(e.target.value)}
                        />
                      </div>
                      {filtered.length === 0 ? (
                        <p className="font-body text-xs text-gray-400">No matches</p>
                      ) : (
                        filtered.map(appt => {
                          const typeColor = appt.appointment_type
                            ? (APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other'])
                            : null
                          return (
                            <div
                              key={appt.id}
                              onClick={() => setApptModal({ mode: 'view', appt })}
                              className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  {typeColor && (
                                    <span className={`tag border text-[10px] flex-shrink-0 ${typeColor}`}>
                                      {appt.appointment_type}
                                    </span>
                                  )}
                                  <span className={`tag text-[10px] flex-shrink-0 ${appt.completed ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {appt.completed ? 'Completed' : 'Past'}
                                  </span>
                                </div>
                                <p className="font-body text-sm font-medium text-gray-500 truncate">{appt.title}</p>
                                <p className="font-body text-xs text-gray-400 mt-0.5">
                                  {format(parseApptDateLocal(appt.appointment_date), 'MMM d, yyyy · h:mm a')}
                                </p>
                                {appt.provider && <p className="font-body text-xs text-gray-400">with {appt.provider}</p>}
                                {appt.location && <p className="font-body text-xs text-gray-400">{appt.location}</p>}
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); deleteAppointment(appt.id) }}
                                className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </SectionCard>

          {/* Appointment modal (view / edit / new) */}
          {apptModal && (
            <AppointmentModal
              modal={apptModal}
              onClose={() => setApptModal(null)}
              onSave={saveApptModal}
              onDelete={apptId => { deleteAppointment(apptId); setApptModal(null) }}
              saving={savingAppt}
            />
          )}

          {/* Notes */}
          <div className="card p-0">
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 cursor-pointer select-none"
              onClick={() => toggleCard('notes')}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {collapsedCards.notes ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <FileText size={15} className="text-primary" />
                <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary-light text-primary font-body text-[10px] font-semibold">
                  {notes.length}
                </span>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setNoteModal({ mode: 'new' })}
                  className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div
              className={`grid ${collapsedCards.notes ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
              style={{ transition: 'grid-template-rows 200ms ease' }}
            >
            <div className="overflow-hidden min-h-0"><div className="px-6 pb-6">

            {/* Search + Filters */}
            <div className="mb-4" ref={noteFiltersRef}>
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
                <button
                  onClick={() => setShowNoteFilters(v => !v)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg border font-body text-xs font-medium transition-all flex-shrink-0 ${
                    showNoteFilters
                      ? 'bg-primary-light border-primary/30 text-primary'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <SlidersHorizontal size={13} />
                  Filters
                  {filtersActive && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              </div>

              {/* Filter panel */}
              {showNoteFilters && (
                <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  {/* Type */}
                  <div>
                    <label className="label">Type</label>
                    <select
                      className="input text-sm"
                      value={noteTypeFilter}
                      onChange={e => setNoteTypeFilter(e.target.value)}
                    >
                      <option value="All">All Types</option>
                      {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {/* Date */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className="label mb-0">Date</label>
                      <button
                        onClick={() => { setNoteDateRange(r => !r); setNoteDateTo('') }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded font-body text-[10px] font-medium border transition-all ${
                          noteDateRange
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-primary hover:text-primary'
                        }`}
                      >
                        Range
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        {noteDateRange && <label className="label">From</label>}
                        <input
                          type="date"
                          className="input text-sm w-full"
                          value={noteDateFrom}
                          onChange={e => setNoteDateFrom(e.target.value)}
                        />
                      </div>
                      {noteDateRange && (
                        <div>
                          <label className="label">To</label>
                          <input
                            type="date"
                            className="input text-sm w-full"
                            value={noteDateTo}
                            onChange={e => setNoteDateTo(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Clear all */}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => { setNoteTypeFilter('All'); setNoteDateFrom(''); setNoteDateTo(''); setNoteDateRange(false) }}
                      className="font-body text-xs text-primary hover:underline transition-colors"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              )}

              {/* Results count when filtered */}
              {(noteSearch.trim() || filtersActive) && notes.length > 0 && (
                <p className="font-body text-[11px] text-gray-400 mt-2">
                  {filteredNotes.length === notes.length
                    ? `${notes.length} note${notes.length !== 1 ? 's' : ''}`
                    : `${filteredNotes.length} of ${notes.length} note${notes.length !== 1 ? 's' : ''} match`}
                </p>
              )}
            </div>

            {/* Notes feed */}
            {notes.length === 0 ? (
              <p className="font-body text-xs text-gray-400 text-center py-6">
                No notes yet — click Add Note to create one
              </p>
            ) : filteredNotes.length === 0 ? (
              <p className="font-body text-xs text-gray-400 text-center py-4">
                No notes match your search.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
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
                      className="flex items-center gap-3 py-4 cursor-pointer hover:bg-gray-50/60 transition-all -mx-1 px-1 rounded-lg group"
                    >
                      <span className={`tag border text-[10px] flex-shrink-0 ${colorClass}`}>{typeLabel}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-semibold text-gray-800 truncate">
                          {note.title || '(Untitled)'}
                        </p>
                        {bodyOnly && (
                          <span className="inline-block mt-0.5 font-body text-[10px] text-primary bg-primary-light rounded px-1.5 py-0.5">
                            Found in note body
                          </span>
                        )}
                        {snippet && (
                          <p className="font-body text-xs text-gray-400 mt-0.5 leading-relaxed">
                            {snippet.before}
                            <mark className="bg-yellow-100 text-gray-700 rounded px-0.5 not-italic font-medium">{snippet.match}</mark>
                            {snippet.after}
                          </p>
                        )}
                      </div>
                      <span className="font-body text-[11px] text-gray-400 flex-shrink-0">
                        {dateStr ? format(parseISO(dateStr), 'MMM d') : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Deleted Notes */}
            {deletedNotes.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowDeletedNotes(v => !v)}
                  className="flex items-center gap-1 font-body text-[11px] text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showDeletedNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {deletedNotes.length} deleted
                </button>

                {showDeletedNotes && (
                  <div className="mt-2 space-y-1">
                    {deletedNotes.map(note => {
                      const deletedStr = note.deleted_at
                        ? format(parseISO(note.deleted_at), 'MMM d, yyyy')
                        : ''
                      return (
                        <div
                          key={note.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-body text-xs text-gray-400 truncate">{note.title || '(Untitled)'}</p>
                            {deletedStr && (
                              <p className="font-body text-[10px] text-gray-300">Deleted {deletedStr}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); restoreNote(note.id) }}
                              className="font-body text-[10px] text-primary hover:underline"
                            >
                              Restore
                            </button>
                            <span className="text-gray-200 text-xs">·</span>
                            <button
                              onClick={e => { e.stopPropagation(); permanentDeleteNote(note.id) }}
                              className="font-body text-[10px] text-red-400 hover:underline"
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
                patientId={id}
                patientName={patient ? `${patient.first_name} ${patient.last_name}` : ''}
                onClose={() => setNoteModal(null)}
                onSave={saveNote}
                onUpdate={updateNote}
                onDelete={deleteNote}
                saving={savingNote}
              />
            )}
            </div></div></div>
          </div>

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
                              <button onClick={() => setPanelGoalEditing({ ...g })} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
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

                              <button onClick={() => setPanelHospEditing({ ...h })} className="p-1 text-gray-300 hover:text-gray-500 transition-colors"><Edit3 size={12} /></button>
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

      {/* ── DOC PREVIEW MODAL ── */}
      {docPreview && (
        <DocPreviewModal
          doc={docPreview.doc}
          url={docPreview.url}
          onClose={() => setDocPreview(null)}
          onDownload={() => downloadDocument(docPreview.doc)}
        />
      )}

      {/* ── DELETE PATIENT CONFIRMATION ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm">
            <h3 className="font-heading text-xl text-gray-800 mb-2">Delete Patient?</h3>
            <p className="font-body text-sm text-gray-500 mb-6">
              Are you sure you want to delete this patient? They can be restored from the dashboard.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={deletePatient}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-body text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Delete Patient
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, accentColor = 'primary', onEdit, editing, onSave, onCancel, saving, addButton, collapsed, onToggle, titleExtra }) {
  return (
    <div className="card p-0">
      <div
        className={`flex items-center justify-between px-6 pt-5 pb-4 ${onToggle && !editing ? 'cursor-pointer select-none' : ''}`}
        onClick={onToggle && !editing ? onToggle : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-300 flex-shrink-0">
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </span>
          <span className={accentColor === 'mauve' ? 'text-mauve' : 'text-primary'}>{icon}</span>
          <h3 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
          {titleExtra && <div onClick={e => e.stopPropagation()}>{titleExtra}</div>}
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {addButton && !editing && (
            <button onClick={addButton.onClick} className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors">
              <Plus size={14} />
            </button>
          )}
          {onEdit && !editing && (
            <button onClick={onEdit} className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors">
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
      <div
        className={`grid ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
        style={{ transition: 'grid-template-rows 200ms ease' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-6 pb-6">
            {children}
          </div>
        </div>
      </div>
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
  const blocks = draft.scheduleBlocks || [{ tempId: '0', days: [], start_time: '', end_time: '' }]

  function setBlocks(newBlocks) {
    onChange({ ...draft, scheduleBlocks: newBlocks })
  }
  function addBlock() {
    setBlocks([...blocks, { tempId: Date.now().toString(), days: [], start_time: '', end_time: '' }])
  }
  function removeBlock(idx) {
    setBlocks(blocks.filter((_, i) => i !== idx))
  }
  function updateBlock(idx, update) {
    setBlocks(blocks.map((b, i) => i === idx ? { ...b, ...update } : b))
  }
  function toggleBlockDay(idx, day) {
    const days = blocks[idx].days || []
    updateBlock(idx, { days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
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

      {/* Schedule blocks */}
      <div>
        <label className="label">Schedule</label>
        <div className="space-y-2 mt-1">
          {blocks.map((block, idx) => (
            <div key={block.tempId} className="bg-white rounded-lg p-2.5 border border-gray-100 space-y-2">
              {/* Day toggles */}
              <div className="flex gap-1">
                {DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleBlockDay(idx, day)}
                    className={`flex-1 text-center rounded-md py-1.5 text-[10px] font-body font-semibold transition-colors ${
                      (block.days || []).includes(day) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
              {/* Time range */}
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  className="input text-xs flex-1"
                  value={block.start_time || ''}
                  onChange={e => updateBlock(idx, { start_time: e.target.value })}
                />
                <span className="text-gray-400 text-xs flex-shrink-0">–</span>
                <input
                  type="time"
                  className="input text-xs flex-1"
                  value={block.end_time || ''}
                  onChange={e => updateBlock(idx, { end_time: e.target.value })}
                />
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addBlock}
            className="flex items-center gap-1 text-xs font-body text-primary hover:underline"
          >
            <Plus size={11} /> Add another block
          </button>
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

// ── CalendarWidget ────────────────────────────────────────────────────────────
function CalendarWidget({ viewDate, onPrev, onNext, appointments, selectedDate, onSelectDate, onView, onToday }) {
  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart) // 0=Sun

  const apptsByDate = {}
  appointments.forEach(appt => {
    const d = (appt.appointment_date || '').slice(0, 10)
    if (!d) return
    if (!apptsByDate[d]) apptsByDate[d] = []
    apptsByDate[d].push(appt)
  })

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="font-body text-sm font-semibold text-gray-700">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={onNext}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Today button */}
      <div className="flex justify-center my-2">
        <button
          onClick={onToday}
          className="font-body text-[10px] font-medium px-3 py-1 rounded-full bg-primary-light text-primary border border-primary/20 hover:bg-primary/15 hover:border-primary/40 transition-all"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center font-body text-[10px] text-gray-400 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === todayStr
          const hasAppts = !!apptsByDate[dateStr]
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={dateStr}
              onClick={() => hasAppts ? onSelectDate(dateStr) : undefined}
              className={`flex flex-col items-center py-0.5 rounded-lg transition-all ${
                hasAppts ? 'cursor-pointer hover:bg-primary-light' : 'cursor-default'
              } ${isSelected && !isToday ? 'bg-primary-light' : ''}`}
            >
              <span className={`w-7 h-7 flex items-center justify-center rounded-full font-body text-xs font-medium transition-all ${
                isToday ? 'bg-primary text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full mt-0.5 mb-0.5 ${
                hasAppts ? (isToday ? 'bg-white/70' : 'bg-primary') : 'invisible'
              }`} />
            </button>
          )
        })}
      </div>

      {/* Selected day popover */}
      {selectedDate && apptsByDate[selectedDate] && (
        <div className="mt-3 border border-primary/20 rounded-xl bg-primary-light/30 p-3 space-y-2">
          <p className="font-body text-xs font-semibold text-primary">
            {format(parseISO(selectedDate), 'MMMM d, yyyy')}
          </p>
          {apptsByDate[selectedDate].map(appt => {
            const typeColor = appt.appointment_type
              ? (APPT_TYPE_COLORS[appt.appointment_type] || APPT_TYPE_COLORS['Other'])
              : null
            return (
              <div
                key={appt.id}
                onClick={() => onView(appt)}
                className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                {typeColor && (
                  <span className={`tag border text-[10px] mb-1 inline-flex ${typeColor}`}>
                    {appt.appointment_type}
                  </span>
                )}
                <p className="font-body text-sm font-semibold text-gray-700">{appt.title}</p>
                <p className="font-body text-xs text-primary font-medium mt-0.5">
                  {format(parseApptDateLocal(appt.appointment_date), 'h:mm a')}
                </p>
                {appt.provider && <p className="font-body text-xs text-gray-500">with {appt.provider}</p>}
                {appt.location && <p className="font-body text-xs text-gray-400">{appt.location}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AppointmentModal ───────────────────────────────────────────────────────────
const APPT_TYPES = ['Doctor Appointment', 'Patient Meeting', 'Family Meeting', 'SBHA General Event', 'Other']

function AppointmentModal({ modal, onClose, onSave, onDelete, saving }) {
  const isNew = modal.mode === 'new'
  const initialAppt = modal.mode === 'view' ? modal.appt : (modal.draft || {})
  const [mode, setMode] = useState(modal.mode === 'view' ? 'view' : 'edit')
  const [draft, setDraft] = useState({ ...initialAppt })

  const knownTypes = APPT_TYPES.slice(0, -1)
  const initIsOther = !!draft.appointment_type && !knownTypes.includes(draft.appointment_type) && draft.appointment_type !== ''
  const [typeIsOther, setTypeIsOther] = useState(initIsOther)
  const [otherTypeText, setOtherTypeText] = useState(initIsOther ? draft.appointment_type : '')

  function enterEditMode() {
    const isOther = !!draft.appointment_type && !knownTypes.includes(draft.appointment_type) && draft.appointment_type !== ''
    setTypeIsOther(isOther)
    setOtherTypeText(isOther ? draft.appointment_type : '')
    setMode('edit')
  }

  function handleSave() {
    const finalType = typeIsOther ? otherTypeText.trim() : draft.appointment_type
    onSave({ ...draft, appointment_type: finalType || null })
  }

  const typeColor = draft.appointment_type
    ? (APPT_TYPE_COLORS[draft.appointment_type] || APPT_TYPE_COLORS['Other'])
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {mode === 'view' ? (
          <>
            {/* View header — full title + icon buttons */}
            <div className="flex items-start gap-4 px-7 pt-6 pb-5">
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-2xl font-semibold text-gray-800 leading-snug">
                  {draft.title || 'Appointment'}
                </h2>
                {typeColor && (
                  <span className={`inline-flex mt-2 tag border text-[10px] ${typeColor}`}>
                    {draft.appointment_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button
                  onClick={enterEditMode}
                  title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => onDelete(draft.id)}
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
            <div className="px-7 pb-5 space-y-4 border-t border-gray-100 pt-5 overflow-y-auto">
              {draft.appointment_date && (
                <div>
                  <p className="label">Date &amp; Time</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">
                    {format(parseApptDateLocal(draft.appointment_date), 'MMMM d, yyyy')}
                    <span className="text-gray-400 mx-1.5">·</span>
                    {format(parseApptDateLocal(draft.appointment_date), 'h:mm a')}
                  </p>
                </div>
              )}
              {draft.provider && (
                <div>
                  <p className="label">Provider</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">{draft.provider}</p>
                </div>
              )}
              {draft.location && (
                <div>
                  <p className="label">Location</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5">{draft.location}</p>
                </div>
              )}
              {draft.notes && (
                <div>
                  <p className="label">Notes</p>
                  <p className="font-body text-sm text-gray-700 mt-0.5 leading-relaxed whitespace-pre-line">
                    {draft.notes}
                  </p>
                </div>
              )}
              {!draft.provider && !draft.location && !draft.notes && (
                <p className="font-body text-sm text-gray-400 italic">No additional details.</p>
              )}
            </div>

            {/* View footer */}
            <div className="flex items-center justify-end px-7 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={onClose} className="btn-ghost py-2 px-4 text-sm">Close</button>
            </div>
          </>
        ) : (
          <>
            {/* Edit / New header */}
            <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-heading text-xl font-semibold text-gray-800">
                {isNew ? 'Add Appointment' : 'Edit Appointment'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Edit fields */}
            <div className="px-7 py-5 space-y-3.5 overflow-y-auto max-h-[65vh]">
              <div>
                <label className="label">Title *</label>
                <input
                  className="input mt-1"
                  placeholder="Appointment title"
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
                    placeholder="Describe the appointment type…"
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
                  placeholder="Additional notes…"
                  value={draft.notes || ''}
                  onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Edit/New footer */}
            <div className="flex gap-2.5 px-7 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => isNew ? onClose() : setMode('view')}
                className="btn-ghost flex-1 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.title?.trim() || !draft.appointment_date}
                className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : (isNew ? 'Add Appointment' : 'Save Changes')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── NoteModal ─────────────────────────────────────────────────────────────────
const INSURANCE_TYPES_LIST = ['Medicare', 'Medicaid', 'Medicare + Medicaid', 'Private Insurance', 'Uninsured']

function InsuranceModal({ modal, onClose, onSave, saving }) {
  const isOtherInit = !!modal.draft.insurance_type && !INSURANCE_TYPES_LIST.includes(modal.draft.insurance_type)
  const [draft, setDraft] = useState({ ...modal.draft })
  const [otherMode, setOtherMode] = useState(isOtherInit)
  const [otherText, setOtherText] = useState(isOtherInit ? modal.draft.insurance_type : '')

  function handleSave() {
    const finalType = otherMode ? otherText.trim() : draft.insurance_type
    onSave({ ...draft, insurance_type: finalType })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-heading text-xl font-semibold text-gray-800">
            {modal.mode === 'new' ? 'Add Insurance' : 'Edit Insurance'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Insurance Type</label>
            <select
              className="input"
              value={otherMode ? '__other__' : (draft.insurance_type || '')}
              onChange={e => {
                if (e.target.value === '__other__') {
                  setOtherMode(true)
                  setDraft(d => ({ ...d, insurance_type: '' }))
                } else {
                  setOtherMode(false)
                  setOtherText('')
                  setDraft(d => ({ ...d, insurance_type: e.target.value }))
                }
              }}
            >
              <option value="">Select type…</option>
              {INSURANCE_TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__other__">Other</option>
            </select>
            {otherMode && (
              <input
                className="input mt-2"
                placeholder="Specify insurance type…"
                value={otherText}
                onChange={e => setOtherText(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">Insurance Provider / Plan Name</label>
            <input
              className="input"
              placeholder="e.g. Blue Cross Blue Shield, Aetna"
              value={draft.insurance_provider || ''}
              onChange={e => setDraft(d => ({ ...d, insurance_provider: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Billing Concerns</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Describe any billing concerns or outstanding balances…"
              value={draft.billing_concerns || ''}
              onChange={e => setDraft(d => ({ ...d, billing_concerns: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="font-body text-sm text-gray-600">Set as primary insurance</span>
            <button
              onClick={() => setDraft(d => ({ ...d, is_primary: !d.is_primary }))}
              className={draft.is_primary ? 'text-primary' : 'text-gray-300'}
            >
              {draft.is_primary ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteModal({ modal, patientId, patientName, onClose, onSave, onUpdate, onDelete, saving }) {
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
  const [pendingFiles, setPendingFiles] = useState([])
  const [attachments, setAttachments] = useState([])
  const [deletingAttachId, setDeletingAttachId] = useState(null)
  const [previewAttach, setPreviewAttach] = useState(null)

  // Escape to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!isNew && note?.id) {
      supabase.from('note_attachments').select('*').eq('note_id', note.id).order('created_at')
        .then(({ data }) => setAttachments(data || []))
    }
  }, [note?.id])

  async function openAttachment(attach) {
    const isPDF = attach.file_type === 'application/pdf' || attach.name?.toLowerCase().endsWith('.pdf')
    const isImage = attach.file_type?.startsWith('image/')
    const { data } = await supabase.storage.from('documents').createSignedUrl(attach.file_url, 600)
    if (!data?.signedUrl) return
    if (isPDF || isImage) {
      setPreviewAttach({ attach, signedUrl: data.signedUrl })
    } else {
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = attach.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  async function deleteAttachment(attach) {
    setDeletingAttachId(attach.id)
    await supabase.storage.from('documents').remove([attach.file_url])
    await supabase.from('note_attachments').delete().eq('id', attach.id)
    setAttachments(prev => prev.filter(a => a.id !== attach.id))
    setDeletingAttachId(null)
  }

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
    const payload = { noteTitle, noteType: resolvedType, noteDate, noteBody, pendingFiles }
    if (isNew) onSave(payload)
    else onUpdate(note.id, payload)
  }

  async function handleDelete() {
    await onDelete(note.id)
    onClose()
  }

  function exportNotePDF() {
    const displayType = viewTypeKey === 'Other' && note?.note_type && note.note_type !== 'Other'
      ? note.note_type : viewTypeKey
    const dateStr = note?.note_date
      ? format(parseISO(note.note_date.slice(0, 10)), 'MMMM d, yyyy')
      : ''

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${note.title || 'Note'} — ${patientName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Montserrat', Arial, sans-serif; color: #1f2937; padding: 48px; font-size: 13px; line-height: 1.7; }
    .patient-name { font-family: 'Montserrat', Arial, sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 16px; }
    .note-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 600; color: #111827; margin-bottom: 10px; line-height: 1.2; }
    .meta-row { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; border: 1px solid; }
    .date { font-size: 11px; color: #6b7280; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin-bottom: 28px; }
    .note-body { font-size: 13px; color: #374151; line-height: 1.8; }
    .note-body ul  { list-style-type: disc;    padding-left: 1.5rem; margin: 0.4rem 0; }
    .note-body ol  { list-style-type: decimal; padding-left: 1.5rem; margin: 0.4rem 0; }
    .note-body li  { display: list-item; margin: 0.15rem 0; }
    .note-body strong { font-weight: 700; }
    .note-body em     { font-style: italic; }
    .note-body u      { text-decoration: underline; }
    .note-body p   { margin-bottom: 0.75rem; }
    .note-body p:last-child { margin-bottom: 0; }
    .note-body p:empty::before { content: '\\00a0'; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
    @page { margin: 1.5cm; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="patient-name">${patientName}</div>
  <div class="note-title">${note.title || 'Untitled Note'}</div>
  <div class="meta-row">
    ${displayType ? `<span class="badge" style="background:${badgeBg(displayType)};color:${badgeFg(displayType)};border-color:${badgeBorder(displayType)};">${displayType}</span>` : ''}
    ${dateStr ? `<span class="date">${dateStr}</span>` : ''}
  </div>
  <div class="divider"></div>
  <div class="note-body">${note.body || ''}</div>
  <div class="footer">Exported from SBHA Care Manager · ${format(new Date(), 'MMMM d, yyyy')}</div>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 600)
  }

  async function exportNoteDocx() {
    console.log('[exportNoteDocx] called', { note, patientName })
    try {
    const displayType = viewTypeKey === 'Other' && note?.note_type && note.note_type !== 'Other'
      ? note.note_type : viewTypeKey
    const dateStr = note?.note_date
      ? format(parseISO(note.note_date.slice(0, 10)), 'MMMM d, yyyy')
      : ''

    // Parse inline nodes, threading bold/italic/underline context down
    function parseInline(node, opts = {}) {
      if (node.nodeType === 3) {
        const text = node.textContent
        return text ? [new TextRun({ text, ...opts })] : []
      }
      const tag = node.tagName?.toLowerCase()
      const o = { ...opts }
      if (tag === 'strong' || tag === 'b') o.bold = true
      if (tag === 'em'    || tag === 'i') o.italics = true
      if (tag === 'u')                    o.underline = {}
      return Array.from(node.childNodes).flatMap(c => parseInline(c, o))
    }

    const bodyDoc = new DOMParser().parseFromString(`<div>${note.body || ''}</div>`, 'text/html')
    const root = bodyDoc.body.firstChild
    const OL_REF = 'ol-numbering'
    const bodyParagraphs = []

    for (const node of Array.from(root.childNodes)) {
      const tag = node.tagName?.toLowerCase()
      if (tag === 'p') {
        const runs = Array.from(node.childNodes).flatMap(c => parseInline(c))
        bodyParagraphs.push(new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          spacing: { after: 160 },
        }))
      } else if (tag === 'ul') {
        for (const li of Array.from(node.children)) {
          bodyParagraphs.push(new Paragraph({
            children: Array.from(li.childNodes).flatMap(c => parseInline(c)),
            bullet: { level: 0 },
          }))
        }
      } else if (tag === 'ol') {
        for (const li of Array.from(node.children)) {
          bodyParagraphs.push(new Paragraph({
            children: Array.from(li.childNodes).flatMap(c => parseInline(c)),
            numbering: { reference: OL_REF, level: 0 },
          }))
        }
      }
    }

    const metaRuns = [
      displayType && new TextRun({ text: displayType, bold: true, size: 18, color: '6B7280' }),
      displayType && dateStr && new TextRun({ text: '   ·   ', size: 18, color: 'D1D5DB' }),
      dateStr && new TextRun({ text: dateStr, size: 18, color: '6B7280' }),
    ].filter(Boolean)

    const doc = new Document({
      numbering: {
        config: [{
          reference: OL_REF,
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        }],
      },
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: patientName.toUpperCase(), color: '9CA3AF', size: 16, bold: true })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: note.title || 'Untitled Note', bold: true, size: 40 })],
            spacing: { after: 120 },
          }),
          ...(metaRuns.length ? [new Paragraph({ children: metaRuns, spacing: { after: 400 } })] : []),
          ...bodyParagraphs,
        ],
      }],
    })

    const blob = await Packer.toBlob(doc)
    saveAs(blob, `${patientName} - ${note.title || 'Note'}.docx`)
    console.log('[exportNoteDocx] done')
    } catch (err) {
      console.error('[exportNoteDocx] error:', err)
    }
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
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl min-w-[520px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header — view mode */}
        {!isNew && mode === 'view' ? (
          <div className="px-7 pt-6 pb-0 flex-shrink-0">
            {/* Row 1: title + close */}
            <div className="flex items-start justify-between gap-4 mb-2">
              <h2 className="font-heading text-2xl font-semibold text-gray-800 leading-snug">
                {note.title || 'Note'}
              </h2>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-0.5">
                <X size={18} />
              </button>
            </div>
            {/* Row 2: type tag + date */}
            <div className="flex items-center justify-between mb-3">
              <span className={`tag border text-[10px] ${viewColorClass}`}>{viewTypeLabel}</span>
              <span className="font-body text-xs text-gray-400">
                {note.note_date ? format(parseISO(note.note_date.slice(0, 10)), 'MMMM d, yyyy') : ''}
              </span>
            </div>
            {/* Row 3: action toolbar */}
            <div className="flex items-center gap-1.5 pb-4 border-b border-gray-100">
              <button
                onClick={exportNotePDF}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-body text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                title="Export as PDF"
              >
                <Printer size={11} /> PDF
              </button>
              <button
                onClick={exportNoteDocx}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-body text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                title="Export as Word"
              >
                <Download size={11} /> Word
              </button>
              <button
                onClick={enterEditMode}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-body text-xs font-medium text-primary bg-primary-light hover:bg-primary/20 transition-colors"
              >
                <Edit3 size={11} /> Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-body text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </div>
        ) : (
          /* Header — edit / new mode */
          <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="font-heading text-xl font-semibold text-gray-800">
              {isNew ? 'New Note' : 'Edit Note'}
            </h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
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
              {note.body ? (
                <div
                  className="sbha-note-body font-body text-sm text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: note.body }}
                />
              ) : (
                <p className="font-body text-sm text-gray-400 italic">No body content.</p>
              )}
              {attachments.length > 0 && (
                <div className="mt-6 pt-5 border-t border-gray-200">
                  <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Attachments</p>
                  <div className="space-y-1">
                    {attachments.map(a => {
                      const isPDF = a.file_type === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf')
                      const isImage = a.file_type?.startsWith('image/')
                      const canPreview = isPDF || isImage
                      return (
                        <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                          <Paperclip size={13} className="text-gray-400 group-hover:text-primary flex-shrink-0" />
                          <button
                            onClick={() => openAttachment(a)}
                            className="font-body text-sm text-gray-700 hover:text-primary flex-1 text-left truncate transition-colors"
                          >
                            {a.name}
                          </button>
                          <button
                            onClick={() => openAttachment(a)}
                            className="font-body text-xs font-medium text-primary hover:text-primary/70 flex-shrink-0 transition-colors"
                          >
                            {canPreview ? 'Open' : 'Download'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
              <Field label="Attachments">
                <div className="space-y-1.5">
                  {!isNew && attachments.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                      <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="font-body text-xs text-gray-600 flex-1 truncate">{a.name}</span>
                      <button onClick={() => deleteAttachment(a)} disabled={deletingAttachId === a.id}
                        className="text-red-400 hover:text-red-600 p-0.5 flex-shrink-0 disabled:opacity-50">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-primary-light rounded-lg">
                      <Paperclip size={12} className="text-primary flex-shrink-0" />
                      <span className="font-body text-xs text-primary flex-1 truncate">{f.name}</span>
                      <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-primary/60 hover:text-primary p-0.5 flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-gray-300 rounded-lg hover:border-primary/50 transition-colors">
                    <Paperclip size={13} className="text-gray-400" />
                    <span className="font-body text-xs text-gray-500">Attach files</span>
                    <input type="file" multiple className="hidden"
                      onChange={e => {
                        const picked = Array.from(e.target.files || [])
                        e.target.value = ''
                        if (picked.length) setPendingFiles(prev => [...prev, ...picked])
                      }} />
                  </label>
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Footer — edit mode only */}
        {mode === 'edit' && (
          <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-gray-100 flex-shrink-0">
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

    {/* Attachment preview modal */}
    {previewAttach && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
        onClick={() => setPreviewAttach(null)}
      >
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl"
          style={{ height: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Preview header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <p className="font-body text-sm font-medium text-gray-800 truncate min-w-0">
              {previewAttach.attach.name}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <button
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = previewAttach.signedUrl
                  link.download = previewAttach.attach.name
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                }}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Download size={13} /> Download
              </button>
              <button
                onClick={() => setPreviewAttach(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {/* Preview body */}
          <div className="flex-1 overflow-hidden rounded-b-2xl">
            {previewAttach.attach.file_type?.startsWith('image/') ? (
              <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
                <img
                  src={previewAttach.signedUrl}
                  alt={previewAttach.attach.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <iframe
                src={previewAttach.signedUrl}
                title={previewAttach.attach.name}
                className="w-full h-full border-0"
              />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function DocPreviewModal({ doc, url, onClose, onDownload }) {
  const category = getDocFileCategory(doc)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl"
        style={{ height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-primary flex-shrink-0" />
            <p className="font-body text-sm font-medium text-gray-800 truncate">{doc.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 font-body text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Download size={13} />
              Download
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden rounded-b-2xl">
          {category === 'pdf' && (
            <iframe
              src={url}
              title={doc.name}
              className="w-full h-full border-0"
            />
          )}
          {category === 'image' && (
            <div className="w-full h-full flex items-center justify-center bg-gray-50 p-4 overflow-auto">
              <img
                src={url}
                alt={doc.name}
                className="max-w-full max-h-full object-contain rounded-xl"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
