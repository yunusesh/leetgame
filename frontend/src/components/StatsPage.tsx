import { useEffect, useState } from 'react'
import type { TopicProficiency } from '../types'
import { getProficiency } from '../api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const stageLabel: Record<string, string> = {
  edge_cases:  'Edge Cases',
  brute_force: 'Brute Force',
  pattern:     'Pattern',
  algorithm:   'Algorithm',
  tc_sc:       'Time & Space',
}

export function StatsPage({ onSmartPractice }: { onSmartPractice?: () => void }) {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getProficiency(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setProficiencies(data); setFetchError(false) } })
      .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Failed to load stats. Please sign in and try again.</p>
        </div>
      </div>
    )
  }

  if (proficiencies.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Topic Proficiency</h2>
            {onSmartPractice && (
              <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Complete a practice session to see your scores.</p>
        </div>
      </div>
    )
  }

  // Group by topic, compute avg per topic for sorting
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of proficiencies) {
    const existing = topicMap.get(p.topic) ?? []
    topicMap.set(p.topic, [...existing, p])
  }

  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg) // weakest first

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Topic Proficiency</h2>
          {onSmartPractice && (
            <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {topics.map(({ topic, rows }) => (
            <div key={topic} className="rounded-md border border-border bg-muted p-4">
              <p className="text-sm font-semibold mb-3">{topic}</p>
              <div className="flex flex-col gap-2">
                {rows.map(row => (
                  <div key={row.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {stageLabel[row.stage] ?? row.stage}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          row.score >= 0.7 ? "bg-green-500" :
                          row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${Math.round(row.score * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                      {Math.round(row.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
