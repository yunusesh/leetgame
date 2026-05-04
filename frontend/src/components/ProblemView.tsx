import { useState } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'

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
  playlistSummary,
}: {
  problem: Problem
  onSkip: () => void
  onRandom: () => void
  playlistSummary?: SearchPlaylistSummary | null
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)

  return (
    <div className="w-1/2 overflow-y-auto p-6 border-r border-border">
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
            <button
              type="button"
              onClick={onRandom}
              className="rounded-md border border-muted-foreground/40 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Random instead
            </button>
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
          "font-semibold text-sm",
          difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
        )}>
          {problem.difficulty}
        </span>
        <button
          onClick={onSkip}
          className="ml-auto px-3 py-1 text-xs cursor-pointer border border-muted-foreground/50 rounded-md bg-transparent text-muted-foreground hover:bg-muted transition-colors"
        >
          Next in playlist →
        </button>
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
              <span
                key={tag}
                className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="leading-[1.7] text-[15px] whitespace-pre-wrap">
        {problem.description}
      </div>
    </div>
  )
}
