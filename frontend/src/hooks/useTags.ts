import { useState, useEffect } from 'react'
import type { ProblemTag } from '../types'
import { getProblemTags } from '../api'

export function useTags(): {
  availableTags: ProblemTag[]
  tagsLoading: boolean
  tagsError: string | null
} {
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)

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

  return { availableTags, tagsLoading, tagsError }
}
