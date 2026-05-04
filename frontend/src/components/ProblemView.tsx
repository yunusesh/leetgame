import { useState } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'

const difficultyColor: Record<string, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

export function ProblemView({ problem, onSkip }: { problem: Problem, onSkip: () => void }) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)

  return (
    <div className="w-1/2 overflow-y-auto p-6 border-r border-border">
      <div className="flex items-start gap-3 mb-3">
        <h2
          onClick={() => setTitleOpen(o => !o)}
          className={cn(
            "m-0 flex-1 cursor-pointer select-none transition-all duration-200",
            titleOpen ? "opacity-100 blur-none" : "opacity-60 blur-[6px]"
          )}
          title={titleOpen ? '' : 'Click to reveal'}
        >
          {problem.title}
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
          Skip →
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

      <div className="leading-relaxed text-sm whitespace-pre-wrap">
        {problem.description}
      </div>
    </div>
  )
}
