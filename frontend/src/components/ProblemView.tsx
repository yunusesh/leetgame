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

      <div className="leading-[1.7] text-[15px] whitespace-pre-wrap">
        {problem.description}
      </div>
    </div>
  )
}
