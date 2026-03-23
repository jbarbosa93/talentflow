'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

// Regex basique pour valider un email
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface EmailChipInputProps {
  value: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
}

export default function EmailChipInput({ value, onChange, placeholder = 'Ajouter un email...' }: EmailChipInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addEmail(raw: string) {
    const email = raw.trim().toLowerCase()
    if (!email) return
    if (!EMAIL_RE.test(email)) return
    if (value.includes(email)) return
    onChange([...value, email])
  }

  function addFromInput() {
    // Supports pasting multiple emails separated by , ; or space
    const parts = input.split(/[,;\s]+/).filter(Boolean)
    const newEmails = [...value]
    for (const p of parts) {
      const e = p.trim().toLowerCase()
      if (EMAIL_RE.test(e) && !newEmails.includes(e)) newEmails.push(e)
    }
    onChange(newEmails)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      e.preventDefault()
      addFromInput()
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[,;\s\n]+/).filter(Boolean)
    const newEmails = [...value]
    for (const p of parts) {
      const em = p.trim().toLowerCase()
      if (EMAIL_RE.test(em) && !newEmails.includes(em)) newEmails.push(em)
    }
    onChange(newEmails)
  }

  function remove(email: string) {
    onChange(value.filter(e => e !== email))
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        padding: '6px 10px', minHeight: 42,
        border: '1.5px solid var(--border)', borderRadius: 8,
        background: 'var(--secondary)', cursor: 'text',
      }}
    >
      {value.map(email => (
        <span key={email} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--primary-soft)', border: '1px solid var(--primary)',
          borderRadius: 100, padding: '2px 6px 2px 10px',
          fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
          whiteSpace: 'nowrap',
        }}>
          {email}
          <button
            onClick={(e) => { e.stopPropagation(); remove(email) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 2, display: 'flex',
              borderRadius: '50%', transition: 'color 0.1s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={addFromInput}
        placeholder={value.length === 0 ? placeholder : ''}
        style={{
          flex: 1, minWidth: 120, border: 'none', outline: 'none',
          background: 'transparent', fontSize: 13, fontFamily: 'var(--font-body)',
          color: 'var(--foreground)', padding: '4px 0',
        }}
      />
    </div>
  )
}
