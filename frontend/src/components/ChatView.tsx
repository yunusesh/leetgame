import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage } from '../types'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const stageBanner: Partial<Record<Stage, string>> = {
  pattern: 'What pattern does this problem use?',
  algorithm: 'Pattern ✓ — Now describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}

const stagePlaceholder: Partial<Record<Stage, string>> = {
  pattern: 'e.g. sliding window, BFS/DFS, dynamic programming…',
  algorithm: 'Describe your algorithm…',
  complexity: 'State your time and space complexity…',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
  streamingMessage: string
}

export function ChatView({ history, stage, loading, error, onSubmit, streamingMessage }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  useEffect(() => {
    if (streamingMessage) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
    }
  }, [streamingMessage])

  useEffect(() => {
    if (!loading) textareaRef.current?.focus()
  }, [loading])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 md:w-1/2">
      <div className="px-5 py-3 bg-muted border-b border-border text-sm font-semibold text-foreground">
        {stageBanner[stage]}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {history.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={cn(
              "max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap",
              msg.role === 'user'
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-secondary text-secondary-foreground"
            )}
          >
            {msg.content}
          </div>
        ))}
        {loading && !streamingMessage && (
          <div className="self-start text-muted-foreground text-xs italic">
            Thinking...
          </div>
        )}
        {streamingMessage && (
          <div className="self-start bg-secondary text-secondary-foreground max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
            {streamingMessage}
            <span className="animate-pulse ml-0.5">▌</span>
          </div>
        )}
        {error && (
          <div className="self-start text-destructive text-xs">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); handleSubmit() }}
        className="p-4 border-t border-border flex gap-2"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder={stagePlaceholder[stage] ?? 'Describe your approach…'}
          disabled={loading}
          rows={3}
          className="flex-1 resize-none px-3 py-2.5 rounded-lg border border-border text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
        >
          Send
        </Button>
      </form>
    </div>
  )
}
