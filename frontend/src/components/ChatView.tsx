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
  onNext?: () => void
  onRandom?: () => void
  onBack?: () => void
}

export function ChatView({ history, stage, loading, error, onSubmit, streamingMessage, onNext, onRandom, onBack }: Props) {
  const [input, setInput] = useState('')
  const [queue, setQueue] = useState<string[]>([])
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

  useEffect(() => {
    if (!loading && queue.length > 0) {
      const [next, ...rest] = queue
      setQueue(rest)
      onSubmit(next)
    }
  }, [loading, queue, onSubmit])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    if (loading) {
      setQueue(q => [...q, trimmed])
    } else {
      onSubmit(trimmed)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 md:w-1/2">
      <div className={cn(
        "px-5 py-3 border-b border-border text-sm font-semibold",
        stage === 'complete'
          ? "bg-green-500/10 text-green-700 dark:text-green-400"
          : "bg-muted text-foreground"
      )}>
        {stage === 'complete' ? 'Nice work! Review your session below.' : stageBanner[stage]}
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

      {stage === 'complete' ? (
        <div className="p-4 border-t border-border flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" onClick={onBack}>← Back</Button>
          )}
          {onNext && (
            <Button onClick={onNext} className="ml-auto">Next Problem</Button>
          )}
          {onRandom && (
            <Button variant="outline" onClick={onRandom}>Random</Button>
          )}
        </div>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); handleSubmit() }}
          className="p-4 border-t border-border flex gap-2"
        >
          <div className="flex-1 flex flex-col gap-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder={stagePlaceholder[stage] ?? 'Describe your approach…'}
              rows={3}
              className="w-full resize-none px-3 py-2.5 rounded-lg border border-border text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {queue.length > 0 && (
              <div className="flex flex-col gap-1 px-1">
                {queue.map((msg, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0 mt-0.5 opacity-50">{i + 1}.</span>
                    <span className="flex-1 truncate">{msg}</span>
                    <button
                      type="button"
                      onClick={() => setQueue(q => q.filter((_, j) => j !== i))}
                      className="shrink-0 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                      aria-label="Cancel queued message"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" disabled={!input.trim()}>Send</Button>
        </form>
      )}
    </div>
  )
}
