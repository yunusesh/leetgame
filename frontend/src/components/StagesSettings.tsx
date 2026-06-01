import { useRef, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { CANONICAL_STAGES } from '../types'
import { cn } from '../lib/utils'

const STAGE_META: Record<ActiveStage, { label: string; description: string }> = {
  edge_cases:  { label: 'Edge Cases',       description: 'Identify boundary conditions and gotchas' },
  brute_force: { label: 'Brute Force',      description: 'Describe the naive solution' },
  pattern:     { label: 'Optimal Pattern',  description: 'Identify the algorithm pattern' },
  algorithm:   { label: 'Optimal Algorithm', description: 'Describe the optimal algorithm' },
  tc_sc:       { label: 'Time & Space',     description: 'State time and space complexity' },
}

interface Props {
  activeStages: ActiveStage[]
  onChange: (stages: ActiveStage[]) => void
  onClose: () => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
}

export function StagesSettings({ activeStages, onChange, onClose, hideTitle, onHideTitleChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  const toggle = (stage: ActiveStage) => {
    const isActive = activeStages.includes(stage)
    if (isActive && activeStages.length === 1) return
    const next = isActive
      ? activeStages.filter(s => s !== stage)
      : CANONICAL_STAGES.filter(s => activeStages.includes(s) || s === stage)
    onChange(next)
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-30 w-72 rounded-md border border-border bg-background shadow-lg py-2"
    >
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Display
      </p>
      <button
        onClick={() => onHideTitleChange(!hideTitle)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted cursor-pointer transition-colors"
      >
        <div className={cn(
          "h-4 w-4 rounded border shrink-0 flex items-center justify-center",
          hideTitle ? "bg-primary border-primary" : "border-border"
        )}>
          {hideTitle && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm font-medium">Hide problem title</p>
          <p className="text-xs text-muted-foreground">Reveal on click to test recall</p>
        </div>
      </button>
      <div className="mx-3 my-2 border-t border-border" />
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Practice Stages
      </p>
      {CANONICAL_STAGES.map(stage => {
        const active = activeStages.includes(stage)
        const isLast = active && activeStages.length === 1
        const meta = STAGE_META[stage]
        return (
          <button
            key={stage}
            onClick={() => toggle(stage)}
            disabled={isLast}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
              isLast ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
            )}
          >
            <div className={cn(
              "h-4 w-4 rounded border shrink-0 flex items-center justify-center",
              active ? "bg-primary border-primary" : "border-border"
            )}>
              {active && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
