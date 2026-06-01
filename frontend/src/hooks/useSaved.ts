import { useState, useEffect } from 'react'
import type { Problem } from '../types'
import { getSavedProblems, saveProblem, unsaveProblem } from '../api'
import type { Session } from '@supabase/supabase-js'

export function useSaved(session: Session | null): {
  savedProblems: Problem[]
  savedIds: Set<string>
  save: (problemId: string) => Promise<void>
  unsave: (problemId: string) => Promise<void>
  isSaved: (problemId: string) => boolean
} {
  const [savedProblems, setSavedProblems] = useState<Problem[]>([])

  useEffect(() => {
    if (!session) {
      setSavedProblems([])
      return
    }
    getSavedProblems().then(setSavedProblems).catch(() => {})
  }, [session])

  const savedIds = new Set(savedProblems.map(p => p.id))

  const save = async (problemId: string) => {
    await saveProblem(problemId)
    getSavedProblems().then(setSavedProblems).catch(() => {})
  }

  const unsave = async (problemId: string) => {
    setSavedProblems(prev => prev.filter(p => p.id !== problemId))
    await unsaveProblem(problemId).catch(() => {
      getSavedProblems().then(setSavedProblems).catch(() => {})
    })
  }

  const isSaved = (problemId: string) => savedIds.has(problemId)

  return { savedProblems, savedIds, save, unsave, isSaved }
}
