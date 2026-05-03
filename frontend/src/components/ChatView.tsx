import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage } from '../types'

const stageBanner: Record<string, string> = {
  algorithm: 'Describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
}

export function ChatView({ history, stage, loading, error, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div style={{ width: '50%', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '12px 20px',
        background: '#f8f9fa',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '14px',
        fontWeight: 600,
        color: '#333',
      }}>
        {stageBanner[stage]}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {history.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: '12px',
            background: msg.role === 'user' ? '#0070f3' : '#f0f0f0',
            color: msg.role === 'user' ? '#fff' : '#222',
            fontSize: '14px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#888', fontSize: '13px', fontStyle: 'italic' }}>
            Thinking...
          </div>
        )}
        {error && (
          <div style={{ alignSelf: 'flex-start', color: '#ff375f', fontSize: '13px' }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} style={{
        padding: '16px',
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        gap: '8px',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any) } }}
          placeholder="Describe your approach..."
          disabled={loading}
          rows={3}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '0 20px',
            borderRadius: '8px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
