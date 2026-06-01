import { useState, useEffect, useRef } from 'react'
import type { ProblemTag, SearchState } from '../types'
import { getProblemTags, searchProblems } from '../api'

export const SEARCH_PAGE_SIZE = 12

export function useSearch(
  searchState: SearchState,
  onSearchStateChange: (s: SearchState) => void,
): {
  loading: boolean
  error: string | null
  availableTags: ProblemTag[]
  tagsLoading: boolean
  tagsError: string | null
} {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchStateRef = useRef(searchState)
  searchStateRef.current = searchState

  const { q, difficulty, tags, tagMatch, page } = searchState

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const { q: sq, difficulty: sd, tags: st, tagMatch: sm, page: sp } = searchStateRef.current
        const res = await searchProblems(sq, sd, st, sm, sp, SEARCH_PAGE_SIZE, controller.signal)
        // only writes results/total/hasSearched — none of which are in the effect deps, so no loop
        onSearchStateChange({ ...searchStateRef.current, results: res.problems, total: res.total, hasSearched: true })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tags.join(',') replaces array ref; others are primitives; onSearchStateChange is a stable useState setter
  }, [q, difficulty, tags.join(','), tagMatch, page])

  return { loading, error, availableTags, tagsLoading, tagsError }
}
