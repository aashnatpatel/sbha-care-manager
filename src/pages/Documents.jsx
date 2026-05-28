import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import {
  FolderOpen, Pin, PinOff, Upload, Trash2, FileText, File, Image,
  Plus, Search, ExternalLink, Edit3, User,
} from 'lucide-react'

export default function Documents() {
  const { session } = useAuth()
  const [docs, setDocs] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [docName, setDocName] = useState('')
  const [renamingDoc, setRenamingDoc] = useState(null) // null | { id, name }
  const [assigningDoc, setAssigningDoc] = useState(null) // null | doc object
  const fileRef = useRef()

  useEffect(() => { loadDocs(); loadPatients() }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('*, patients(id, first_name, last_name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('first_name')
    setPatients(data || [])
  }

  async function uploadFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `general/${Date.now()}.${ext}`

    const { error: storageError } = await supabase.storage.from('documents').upload(path, file)
    if (storageError) {
      alert('Upload failed: ' + storageError.message)
      setUploading(false)
      return
    }

    const name = docName.trim() || file.name
    const { data } = await supabase.from('documents').insert({
      name,
      file_url: path,
      file_type: file.type,
      is_pinned: false,
      patient_id: null,
      user_id: session.user.id,
    }).select('*, patients(id, first_name, last_name)').single()

    if (data) setDocs(prev => [data, ...prev])
    setDocName('')
    fileRef.current.value = ''
    setUploading(false)
  }

  async function togglePin(doc) {
    const { data } = await supabase
      .from('documents')
      .update({ is_pinned: !doc.is_pinned })
      .eq('id', doc.id)
      .select('*, patients(id, first_name, last_name)').single()
    if (data) setDocs(prev => prev.map(d => d.id === doc.id ? data : d))
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.name}"?`)) return
    if (doc.file_url) await supabase.storage.from('documents').remove([doc.file_url])
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  async function openDoc(doc) {
    if (!doc.file_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function renameDoc(docId, newName) {
    if (!newName.trim()) return
    await supabase.from('documents').update({ name: newName.trim() }).eq('id', docId)
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, name: newName.trim() } : d))
    setRenamingDoc(null)
  }

  async function assignDoc(docId, patientId) {
    const { data } = await supabase
      .from('documents')
      .update({ patient_id: patientId || null })
      .eq('id', docId)
      .select('*, patients(id, first_name, last_name)').single()
    if (data) setDocs(prev => prev.map(d => d.id === docId ? data : d))
    setAssigningDoc(null)
  }

  function getFileIcon(fileType) {
    if (!fileType) return <File size={18} className="text-gray-500" />
    if (fileType.startsWith('image/')) return <Image size={18} className="text-primary" />
    if (fileType === 'application/pdf') return <FileText size={18} className="text-mauve" />
    return <File size={18} className="text-gray-500" />
  }

  const filtered = docs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.patients && `${d.patients.first_name} ${d.patients.last_name}`.toLowerCase().includes(search.toLowerCase()))
  )
  const pinned   = filtered.filter(d => d.is_pinned)
  const unpinned = filtered.filter(d => !d.is_pinned)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title text-3xl">Documents</h1>
          <p className="font-body text-sm text-gray-400 mt-0.5">
            Pin frequently accessed documents for quick access from the dashboard
          </p>
        </div>
      </div>

      {/* Upload card */}
      <div className="card mb-8">
        <h2 className="font-body text-sm font-semibold text-gray-600 mb-3">Upload Document</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            className="input flex-1 min-w-48"
            placeholder="Document name (optional)"
            value={docName}
            onChange={e => setDocName(e.target.value)}
          />
          <input ref={fileRef} type="file" className="hidden" onChange={uploadFile}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv" />
          <button
            onClick={() => fileRef.current.click()}
            disabled={uploading}
            className="btn-primary flex items-center gap-2 flex-shrink-0 disabled:opacity-60"
          >
            <Upload size={15} />
            {uploading ? 'Uploading...' : 'Choose File'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input className="input pl-9" placeholder="Search documents or patients..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="card text-center py-12 border-2 border-dashed border-gray-100">
          <FolderOpen size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="font-heading text-xl text-gray-400 mb-1">No documents yet</p>
          <p className="font-body text-sm text-gray-400">Upload contracts, templates, or other frequently used files</p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Pin size={13} className="text-gray-400" />
                <h2 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Pinned</h2>
              </div>
              <div className="space-y-2">
                {pinned.map(doc => (
                  <DocRow key={doc.id} doc={doc} onPin={togglePin} onDelete={deleteDoc} onOpen={openDoc}
                    getIcon={getFileIcon} onRename={d => setRenamingDoc({ id: d.id, name: d.name })}
                    onAssign={d => setAssigningDoc(d)} />
                ))}
              </div>
            </section>
          )}

          {unpinned.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={13} className="text-gray-400" />
                <h2 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">All Documents</h2>
              </div>
              <div className="space-y-2">
                {unpinned.map(doc => (
                  <DocRow key={doc.id} doc={doc} onPin={togglePin} onDelete={deleteDoc} onOpen={openDoc}
                    getIcon={getFileIcon} onRename={d => setRenamingDoc({ id: d.id, name: d.name })}
                    onAssign={d => setAssigningDoc(d)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Rename Modal ── */}
      {renamingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRenamingDoc(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-heading text-xl text-gray-800 mb-4">Rename Document</h3>
            <input
              className="input w-full"
              value={renamingDoc.name}
              onChange={e => setRenamingDoc(d => ({ ...d, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') renameDoc(renamingDoc.id, renamingDoc.name) }}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setRenamingDoc(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
              <button onClick={() => renameDoc(renamingDoc.id, renamingDoc.name)} className="btn-primary flex-1 py-2 text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Modal ── */}
      {assigningDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setAssigningDoc(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-heading text-xl text-gray-800 mb-1">
              {assigningDoc.patient_id ? 'Reassign Patient' : 'Assign to Patient'}
            </h3>
            <p className="font-body text-xs text-gray-400 mb-4 truncate">{assigningDoc.name}</p>
            <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
              <button
                onClick={() => assignDoc(assigningDoc.id, null)}
                className={`w-full text-left px-3 py-2 rounded-lg font-body text-sm transition-colors ${
                  !assigningDoc.patient_id ? 'bg-primary-light text-primary font-semibold' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                No patient (general document)
              </button>
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => assignDoc(assigningDoc.id, p.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg font-body text-sm transition-colors ${
                    assigningDoc.patient_id === p.id ? 'bg-primary-light text-primary font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.first_name} {p.last_name}
                </button>
              ))}
            </div>
            <button onClick={() => setAssigningDoc(null)} className="btn-ghost w-full mt-3 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, onPin, onDelete, onOpen, getIcon, onRename, onAssign }) {
  return (
    <div className="card flex items-center gap-3 py-3 group hover:shadow-card-hover transition-shadow">
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
        {getIcon(doc.file_type)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-body text-sm font-medium text-gray-700 truncate">{doc.name}</p>
          {doc.patients && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary font-body text-[10px] font-semibold flex-shrink-0">
              <User size={9} />
              {doc.patients.first_name} {doc.patients.last_name}
            </span>
          )}
        </div>
        <p className="font-body text-xs text-gray-400">
          {format(parseISO(doc.created_at), 'MMM d, yyyy')}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {doc.file_url && (
          <button onClick={() => onOpen(doc)} title="Open"
            className="p-2 rounded-lg hover:bg-primary-light text-gray-400 hover:text-primary transition-colors">
            <ExternalLink size={14} />
          </button>
        )}
        <button onClick={() => onRename(doc)} title="Rename"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <Edit3 size={14} />
        </button>
        <button onClick={() => onAssign(doc)} title={doc.patient_id ? 'Reassign patient' : 'Assign to patient'}
          className="p-2 rounded-lg hover:bg-primary-light text-gray-400 hover:text-primary transition-colors">
          <User size={14} />
        </button>
        <button onClick={() => onPin(doc)} title={doc.is_pinned ? 'Unpin' : 'Pin'}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          {doc.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button onClick={() => onDelete(doc)} title="Delete"
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
