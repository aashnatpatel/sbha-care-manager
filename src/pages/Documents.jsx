import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import {
  FolderOpen,
  Pin,
  PinOff,
  Upload,
  Trash2,
  FileText,
  File,
  Image,
  Plus,
  Search,
  ExternalLink,
} from 'lucide-react'

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [docName, setDocName] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    loadDocs()
  }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .is('patient_id', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  async function uploadFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `general/${Date.now()}.${ext}`

    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(path, file)

    if (storageError) {
      alert('Upload failed: ' + storageError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)

    const name = docName.trim() || file.name
    const { data } = await supabase.from('documents').insert({
      name,
      file_url: path,
      file_type: file.type,
      is_pinned: false,
      patient_id: null,
    }).select().single()

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
      .select().single()
    if (data) setDocs(prev => prev.map(d => d.id === doc.id ? data : d))
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.name}"?`)) return
    if (doc.file_url) {
      await supabase.storage.from('documents').remove([doc.file_url])
    }
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  async function openDoc(doc) {
    if (!doc.file_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function getFileIcon(fileType) {
    if (!fileType) return <FileText size={18} className="text-gray-400" />
    if (fileType.startsWith('image/')) return <Image size={18} className="text-primary" />
    if (fileType === 'application/pdf') return <FileText size={18} className="text-red-500" />
    return <File size={18} className="text-gray-400" />
  }

  const filtered = docs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(d => d.is_pinned)
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
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={uploadFile}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv"
          />
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
        <input
          className="input pl-9"
          placeholder="Search documents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
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
                <Pin size={13} className="text-mauve" />
                <h2 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Pinned
                </h2>
              </div>
              <div className="space-y-2">
                {pinned.map(doc => (
                  <DocRow key={doc.id} doc={doc} onPin={togglePin} onDelete={deleteDoc} onOpen={openDoc} getIcon={getFileIcon} />
                ))}
              </div>
            </section>
          )}

          {unpinned.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={13} className="text-gray-400" />
                <h2 className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  All Documents
                </h2>
              </div>
              <div className="space-y-2">
                {unpinned.map(doc => (
                  <DocRow key={doc.id} doc={doc} onPin={togglePin} onDelete={deleteDoc} onOpen={openDoc} getIcon={getFileIcon} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function DocRow({ doc, onPin, onDelete, onOpen, getIcon }) {
  return (
    <div className="card flex items-center gap-3 py-3 group hover:shadow-card-hover transition-shadow">
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
        {getIcon(doc.file_type)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-body text-sm font-medium text-gray-700 truncate">{doc.name}</p>
        <p className="font-body text-xs text-gray-400">
          {format(parseISO(doc.created_at), 'MMM d, yyyy')}
          {doc.is_pinned && (
            <span className="ml-2 tag bg-mauve-light text-mauve text-[10px]">pinned</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {doc.file_url && (
          <button
            onClick={() => onOpen(doc)}
            className="p-2 rounded-lg hover:bg-primary-light text-gray-400 hover:text-primary transition-colors"
            title="Open"
          >
            <ExternalLink size={14} />
          </button>
        )}
        <button
          onClick={() => onPin(doc)}
          className="p-2 rounded-lg hover:bg-mauve-light text-gray-400 hover:text-mauve transition-colors"
          title={doc.is_pinned ? 'Unpin' : 'Pin'}
        >
          {doc.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          onClick={() => onDelete(doc)}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
