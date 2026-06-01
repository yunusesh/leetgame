import { useEffect, useState } from 'react'
import type { TopicProficiency, ProblemTag } from '../types'
import { getProficiency, getProblemTags } from '../api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const stageLabel: Record<string, string> = {
  edge_cases:  'Edge Cases',
  brute_force: 'Brute Force',
  pattern:     'Pattern',
  algorithm:   'Algorithm',
  tc_sc:       'Time & Space',
}

export function StatsPage({
  onSmartPractice,
  activeTopics,
  onTopicsChange,
}: {
  onSmartPractice?: () => void
  activeTopics: string[]
  onTopicsChange: (topics: string[]) => void
}) {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [allTags, setAllTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [topicPickerOpen, setTopicPickerOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getProficiency(controller.signal),
      getProblemTags(controller.signal),
    ])
      .then(([prof, tags]) => {
        if (!controller.signal.aborted) {
          setProficiencies(prof)
          setAllTags(tags)
          setFetchError(false)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const toggleTopic = (name: string) => {
    const next = activeTopics.includes(name)
      ? activeTopics.filter(t => t !== name)
      : [...activeTopics, name]
    if (next.length > 0) onTopicsChange(next)
  }

  const topicPicker = (
    <div className="mb-6">
      <button
        onClick={() => setTopicPickerOpen(o => !o)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {topicPickerOpen ? '▾' : '▸'} Manage topics ({activeTopics.length} of {allTags.length} active)
      </button>
      {topicPickerOpen && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allTags.map(tag => {
            const active = activeTopics.includes(tag.name)
            return (
              <button
                key={tag.name}
                onClick={() => toggleTopic(tag.name)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                )}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

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

  // Filter proficiencies to active topics only
  const activeSet = new Set(activeTopics)
  const filtered = proficiencies.filter(p => activeSet.has(p.topic))

  if (filtered.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Topic Proficiency</h2>
            {onSmartPractice && (
              <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
            )}
          </div>
          {topicPicker}
          <p className="text-sm text-muted-foreground">Complete a practice session to see your scores.</p>
        </div>
      </div>
    )
  }

  // Group by topic, compute avg per topic for sorting
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of filtered) {
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
        {topicPicker}
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
