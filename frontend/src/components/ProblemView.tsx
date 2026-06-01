import { useState, useRef, useEffect } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const difficultyColor: Record<string, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

interface SearchPlaylistSummary {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
}

export function ProblemView({
  problem,
  onSkip,
  onRandom,
  onBack,
  onExitPlaylist,
  playlistSummary,
  hideTitle = true,
}: {
  problem: Problem
  onSkip: () => void
  onRandom: () => void
  onBack?: () => void
  onExitPlaylist?: () => void
  playlistSummary?: SearchPlaylistSummary | null
  hideTitle?: boolean
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(!hideTitle)

  useEffect(() => {
    setTitleOpen(!hideTitle)
  }, [hideTitle])
  const [problemOpen, setProblemOpen] = useState(true)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen) return
    const handle = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [overflowOpen])

  const hasOverflow = !!(onRandom || onExitPlaylist)

  return (
    <div className={cn(
      "border-b md:border-b-0 md:border-r border-border md:w-1/2 md:overflow-y-auto",
      problemOpen ? "flex-1 overflow-y-auto" : "shrink-0"
    )}>
      {/* mobile toggle bar */}
      <div className="md:hidden sticky top-0 z-10 bg-background flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <span className="flex-1 text-sm font-medium truncate text-muted-foreground">
          {titleOpen ? problem.title : 'Problem'}
        </span>
        <span className={cn(
          "text-xs font-semibold",
          difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
        )}>
          {problem.difficulty}
        </span>
        <button
          onClick={() => setProblemOpen(o => !o)}
          aria-expanded={problemOpen}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
        >
          {problemOpen ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>

      {/* content: always visible on desktop, toggled on mobile */}
      <div className={cn("p-6", !problemOpen && "hidden md:block")}>
        {playlistSummary ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
                Playlist
              </span>
              <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
                {problem.difficulty}
              </span>
              {playlistSummary.q && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {playlistSummary.q}
                </span>
              )}
              {playlistSummary.tags.map(tag => (
                <span key={tag} className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <span className={cn("text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-muted-foreground')}>
              {problem.difficulty}
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 mb-3">
          <h2
            onClick={() => setTitleOpen(o => !o)}
            className="m-0 flex-1 cursor-pointer select-none relative"
            title={titleOpen ? '' : 'Click to reveal'}
          >
            <span className={cn(
              "transition-all duration-200 block",
              titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]"
            )}>
              {problem.leetcode_id != null && (
                <span className="text-muted-foreground font-normal mr-1">#{problem.leetcode_id}</span>
              )}
              {problem.title}
            </span>
            {!titleOpen && (
              <span className="absolute inset-0 flex items-center text-muted-foreground text-base font-normal italic">
                Click to reveal title
              </span>
            )}
          </h2>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 text-muted-foreground">
              ←
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onSkip} className="shrink-0 text-muted-foreground">
            Next →
          </Button>
          {hasOverflow && (
            <div className="relative shrink-0" ref={overflowRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOverflowOpen(o => !o)}
                className="text-muted-foreground px-2"
              >
                ···
              </Button>
              {overflowOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-border bg-background shadow-md py-1">
                  {onRandom && (
                    <button
                      onClick={() => { onRandom(); setOverflowOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      Random problem
                    </button>
                  )}
                  {onExitPlaylist && (
                    <button
                      onClick={() => { onExitPlaylist(); setOverflowOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                    >
                      Exit playlist
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <button
            onClick={() => setTagsOpen(o => !o)}
            className="bg-transparent border-none cursor-pointer text-muted-foreground text-xs p-0 hover:text-foreground transition-colors"
          >
            {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
          </button>
          {tagsOpen && (
            <div className="flex gap-2 flex-wrap mt-2">
              {problem.topic_tags.map(tag => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="leading-[1.7] text-[15px] whitespace-pre-wrap">
          {problem.description}
        </div>
      </div>
    </div>
  )
}
