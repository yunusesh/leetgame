import { useState, useEffect, useRef } from 'react'
import type { Problem } from '../types'
import { searchProblems } from '../api'
import { cn } from '../lib/utils'

const difficulties = ['Easy', 'Medium', 'Hard'] as const
type Difficulty = typeof difficulties[number]

const difficultyTextClass: Record<Difficulty, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

const difficultyActiveClass: Record<Difficulty, string> = {
  Easy: 'border-easy text-easy bg-easy/10',
  Medium: 'border-medium text-medium bg-medium/10',
  Hard: 'border-hard text-hard bg-hard/10',
}

const inputClass = 'w-full px-3.5 py-2.5 text-sm rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

export function SearchPage({ onSelectProblem }: { onSelectProblem: (p: Problem) => void }) {
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [results, setResults] = useState<Problem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await searchProblems(q, difficulty, tags, controller.signal)
        setResults(res)
        setHasSearched(true)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [q, difficulty, tags])

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const t = tagInput.trim()
      if (!tags.includes(t)) setTags([...tags, t])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold mb-6">Search Problems</h2>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by title..."
        className={cn(inputClass, 'mb-4')}
      />

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDifficulty('')}
          className={cn(
            'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
            difficulty === ''
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        {difficulties.map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(difficulty === d ? '' : d)}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
              difficulty === d
                ? difficultyActiveClass[d]
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={addTag}
          placeholder="Filter by tag (press Enter to add)..."
          className={cn(inputClass, tags.length ? 'mb-2' : '')}
        />
        {tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 bg-secondary text-secondary-foreground border border-border rounded-sm px-2 py-0.5 text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="cursor-pointer text-muted-foreground hover:text-foreground leading-none bg-transparent border-none p-0">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Searching...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && hasSearched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No problems found.</p>
      )}
      {!loading && !error && results.map(p => (
        <div
          key={p.id}
          onClick={() => onSelectProblem(p)}
          className="p-4 rounded-md border border-border bg-muted hover:bg-secondary cursor-pointer mb-2 transition-colors"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="font-semibold text-sm">{p.title}</span>
            <span className={cn('text-xs font-semibold', difficultyTextClass[p.difficulty as Difficulty])}>
              {p.difficulty}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {p.topic_tags.map(tag => (
              <span key={tag} className="bg-secondary text-muted-foreground rounded-sm px-2 py-0.5 text-xs">{tag}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
