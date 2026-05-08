// TalentFlow Sign — Page templates (refonte v2.2.1 inspirée DocuSign)
'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Search, X, FolderCog, ChevronLeft, Loader2, FileJson, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import CreateTemplateModal from '@/components/sign/CreateTemplateModal'
import DocusignImportModal from '@/components/sign/DocusignImportModal'
import TemplatesTable from '@/components/sign/TemplatesTable'
import type { SignTemplate } from '@/lib/sign/types'

export default function SignTemplatesPage() {
  const [templates, setTemplates] = useState<SignTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/sign/templates')
      const d = await r.json()
      setTemplates(d.templates || [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }, [templates, search])

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([])
    else setSelectedIds(filtered.map(t => t.id))
  }

  // v2.2.6 — Bulk actions : suppression de plusieurs templates en parallèle
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Supprimer définitivement ${selectedIds.length} template${selectedIds.length > 1 ? 's' : ''} ? Cette action est irréversible.`)) return
    setBulkDeleting(true)
    try {
      const results = await Promise.all(
        selectedIds.map(id =>
          fetch(`/api/sign/templates/${id}`, { method: 'DELETE' })
            .then(r => ({ id, ok: r.ok }))
            .catch(() => ({ id, ok: false }))
        )
      )
      const okCount = results.filter(r => r.ok).length
      const failCount = results.length - okCount
      if (okCount > 0) toast.success(`${okCount} template${okCount > 1 ? 's supprimés' : ' supprimé'}`)
      if (failCount > 0) toast.error(`${failCount} échec${failCount > 1 ? 's' : ''}`)
      setSelectedIds([])
      fetchData()
    } catch {
      toast.error('Erreur suppression bulk')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Signatures
        </Link>
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <FolderCog size={22} color="var(--primary)" />
            <span>Templates</span>
            {!loading && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 14, fontWeight: 700,
                color: 'var(--muted-foreground)',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '3px 10px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {templates.length}
              </span>
            )}
          </h1>
          <p className="d-page-sub">Modèles réutilisables de PDFs et destinataires</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setShowImport(true)} className="neo-btn-ghost">
            <FileJson size={14} />
            Importer DocuSign
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="neo-btn-yellow">
            <Plus size={15} />
            Nouveau template
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '14px 0',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          flex: '1 1 280px', minWidth: 200, maxWidth: 380,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10, height: 38, overflow: 'hidden',
        }}>
          <span style={{ padding: '0 8px 0 14px', color: 'var(--muted)', display: 'inline-flex' }}>
            <Search size={15} />
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un template…"
            style={{
              flex: 1, minWidth: 0,
              padding: '0 12px 0 4px',
              border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
              height: '100%',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ padding: '0 10px', height: '100%', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} template{filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* v2.2.6 — Bulk actions bar (apparaît quand des templates sont sélectionnés) */}
      {selectedIds.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          marginBottom: 12,
          background: 'var(--primary-soft)',
          border: '1px solid var(--primary, #EAB308)',
          borderRadius: 10,
          fontSize: 13,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-foreground, #A16207)' }}>
            {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="neo-btn-ghost neo-btn-sm"
            style={{ fontSize: 12 }}
          >
            <X size={13} />
            Désélectionner
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="neo-btn-ghost neo-btn-sm"
            style={{ fontSize: 12, color: 'var(--destructive)', borderColor: 'var(--destructive)' }}
          >
            {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Supprimer
          </button>
        </div>
      )}

      {loading ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement…</div>
        </div>
      ) : (
        <TemplatesTable
          templates={filtered}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onChange={fetchData}
        />
      )}

      <CreateTemplateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          fetchData()
        }}
      />

      <DocusignImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {
          fetchData()
        }}
      />
    </div>
  )
}
