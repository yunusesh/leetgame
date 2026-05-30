import { useState } from 'react'
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
  playlistSummary,
}: {
  problem: Problem
  onSkip: () => void
  onRandom: () => void
  onBack?: () => void
  playlistSummary?: SearchPlaylistSummary | null
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)

  return (
    <div className={cn(
      "border-b md:border-b-0 md:border-r border-border md:w-1/2 md:overflow-y-auto",
      problemOpen ? "flex-1 overflow-y-auto" : "shrink-0"
    )}>
      {/* mobile toggle bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-border">
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
        {playlistSummary && (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Search playlist
                </span>
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {playlistSummary.tagMatch === 'and' ? 'All tags' : 'Any tag'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onRandom} className="text-muted-foreground">
                Random instead
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {playlistSummary.q && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  Query: {playlistSummary.q}
                </span>
              )}
              {playlistSummary.difficulty && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  Difficulty: {playlistSummary.difficulty}
                </span>
              )}
              {playlistSummary.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 mb-3">
          <h2
            onClick={() => setTitleOpen(o => !o)}
            className="m-0 flex-1 cursor-pointer select-none relative"
            title={titleOpen ? '' : 'Click to reveal'}
          >
            <span className={cn(
              "transition-all duration-200 block",
              titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]"
            )}>
              {problem.title}
            </span>
            {!titleOpen && (
              <span className="absolute inset-0 flex items-center text-muted-foreground text-base font-normal italic">
                Click to reveal title
              </span>
            )}
          </h2>
          <span className={cn(
            "font-semibold text-sm hidden md:block",
            difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
          )}>
            {problem.difficulty}
          </span>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
              ← Back
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onSkip} className="ml-auto text-muted-foreground">
            Next →
          </Button>
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
