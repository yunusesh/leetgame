import { useState, useEffect, useRef } from 'react'
import type { Problem, ProblemTag } from '../types'
import { getProblemTags, searchProblems } from '../api'
import { cn } from '../lib/utils'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

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

const pageSize = 12
const tagMatchModes = [
  { value: 'and', label: 'All tags' },
  { value: 'or', label: 'Any tag' },
] as const
export const problemSearchPageSize = pageSize

export interface SearchSelectionContext {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}

export function SearchPage({ onSelectProblem }: { onSelectProblem: (p: Problem, context: SearchSelectionContext) => void }) {
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagMatch, setTagMatch] = useState<'and' | 'or'>('and')
  const [results, setResults] = useState<Problem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadTags() {
      setTagsLoading(true)
      setTagsError(null)
      try {
        const res = await getProblemTags(controller.signal)
        setAvailableTags(res)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setTagsError('Failed to load tags.')
        }
      } finally {
        if (!controller.signal.aborted) setTagsLoading(false)
      }
    }

    void loadTags()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await searchProblems(q, difficulty, tags, tagMatch, page, pageSize, controller.signal)
        setResults(res.problems)
        setTotal(res.total)
        setHasSearched(true)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [q, difficulty, tags, tagMatch, page])

  useEffect(() => {
    setPage(1)
  }, [q, difficulty, tags, tagMatch])

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) setTags([...tags, tag])
    setTagQuery('')
  }

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))
  const filteredTags = availableTags.filter(tag => (
    !tags.includes(tag.name) &&
    tag.name.toLowerCase().includes(tagQuery.toLowerCase())
  )).slice(0, 12)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, total)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold mb-6">Search Problems</h2>

      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by title..."
        className="mb-4 bg-muted"
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
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Tags</p>
          {tags.length > 0 && (
            <button
              type="button"
              onClick={() => setTags([])}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mb-3 flex gap-2">
          {tagMatchModes.map(mode => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setTagMatch(mode.value)}
              className={cn(
                'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
                tagMatch === mode.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <Input
          value={tagQuery}
          onChange={e => setTagQuery(e.target.value)}
          placeholder="Search available tags..."
          className="mb-2 bg-muted"
        />
        {tags.length > 0 && (
          <div className="mb-3 flex gap-1.5 flex-wrap">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 bg-secondary text-secondary-foreground border border-border rounded-sm px-2 py-0.5 text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="cursor-pointer text-muted-foreground hover:text-foreground leading-none bg-transparent border-none p-0">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="rounded-md border border-border bg-muted p-2">
          {tagsLoading && <p className="px-2 py-1 text-sm text-muted-foreground">Loading tags...</p>}
          {tagsError && <p className="px-2 py-1 text-sm text-destructive">{tagsError}</p>}
          {!tagsLoading && !tagsError && filteredTags.length === 0 && (
            <p className="px-2 py-1 text-sm text-muted-foreground">No matching tags.</p>
          )}
          {!tagsLoading && !tagsError && filteredTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filteredTags.map(tag => (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => addTag(tag.name)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  {tag.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{tag.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && hasSearched && total > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          {loading
            ? <span className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />Searching...</span>
            : <p>Showing {showingFrom}-{showingTo} of {total}</p>
          }
          <p>Page {page} of {totalPages}</p>
        </div>
      )}
      {loading && !hasSearched && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          Searching...
        </div>
      )}
      {!loading && !error && hasSearched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No problems found.</p>
      )}
      {!error && results.map(p => (
        <div
          key={p.id}
          onClick={() => onSelectProblem(p, {
            q,
            difficulty,
            tags,
            tagMatch,
            page,
            pageSize,
            results,
            selectedIndex: results.findIndex(result => result.id === p.id),
          })}
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
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </div>
      ))}

      {!error && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-border px-3.5 py-2 text-sm text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-secondary"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border border-border px-3.5 py-2 text-sm text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
