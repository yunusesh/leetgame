import { useEffect, useState, useRef } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat } from './api'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'
import { EndOfSetView } from './components/EndOfSetView'
import { SearchPage, type SearchSelectionContext } from './components/SearchPage'

type View = 'practice' | 'search'
type ProblemSource = 'random' | 'search'

interface SearchPlaylist {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}

function getPlaylistSummary(searchPlaylist: SearchPlaylist | null) {
  if (!searchPlaylist) return null

  if (!searchPlaylist.q && !searchPlaylist.difficulty && searchPlaylist.tags.length === 0) {
    return null
  }

  return {
    q: searchPlaylist.q,
    difficulty: searchPlaylist.difficulty,
    tags: searchPlaylist.tags,
    tagMatch: searchPlaylist.tagMatch,
  }
}

export default function App() {
  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemSource, setProblemSource] = useState<ProblemSource>('random')
  const [searchPlaylist, setSearchPlaylist] = useState<SearchPlaylist | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('algorithm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlistExhausted, setPlaylistExhausted] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const streamAbortRef = useRef<AbortController | null>(null)

  const resetPracticeState = () => {
    setHistory([])
    setStage('algorithm')
  }

  const loadRandomProblem = async () => {
    try {
      setError(null)
      setPlaylistExhausted(false)
      const p = await getRandomProblem()
      setProblem(p)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
    } catch (e) {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const loadNextSearchProblem = async () => {
    if (!searchPlaylist) {
      await loadRandomProblem()
      return
    }

    const nextIndex = searchPlaylist.selectedIndex + 1
    if (nextIndex < searchPlaylist.results.length) {
      setProblem(searchPlaylist.results[nextIndex])
      setSearchPlaylist({
        ...searchPlaylist,
        selectedIndex: nextIndex,
      })
      resetPracticeState()
      setPlaylistExhausted(false)
      setError(null)
      return
    }

    const nextPage = searchPlaylist.page + 1

    try {
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulty,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        nextPage,
        searchPlaylist.pageSize,
      )

      if (res.problems.length === 0) {
        setPlaylistExhausted(true)
        setError(null)
        return
      }

      setProblem(res.problems[0])
      setSearchPlaylist({
        ...searchPlaylist,
        page: res.page,
        pageSize: res.page_size,
        results: res.problems,
        selectedIndex: 0,
      })
      resetPracticeState()
      setPlaylistExhausted(false)
    } catch (e) {
      setError('Failed to load the next filtered problem. Is the backend running?')
    }
  }

  const loadNextProblem = async () => {
    if (problemSource === 'search') {
      await loadNextSearchProblem()
      return
    }
    await loadRandomProblem()
  }

  const loadRandomNextProblem = async () => {
    if (problemSource === 'search' && searchPlaylist) {
      try {
        setError(null)
        const p = await getRandomProblemFiltered(
          searchPlaylist.q,
          searchPlaylist.difficulty,
          searchPlaylist.tags,
          searchPlaylist.tagMatch,
          problem?.id,
        )
        setProblem(p)
        resetPracticeState()
        setPlaylistExhausted(false)
        return
      } catch (e) {
        setError('Failed to load a random filtered problem. Is the backend running?')
        return
      }
    }

    await loadRandomProblem()
  }

  const selectProblem = (p: Problem, context: SearchSelectionContext) => {
    setProblem(p)
    setProblemSource('search')
    setPlaylistExhausted(false)
    setSearchPlaylist({
      q: context.q,
      difficulty: context.difficulty,
      tags: context.tags,
      tagMatch: context.tagMatch,
      page: context.page,
      pageSize: context.pageSize,
      results: context.results,
      selectedIndex: context.selectedIndex,
    })
    resetPracticeState()
    setError(null)
    setView('practice')
  }

  useEffect(() => { void loadRandomProblem() }, [])

  useEffect(() => () => {
    streamAbortRef.current?.abort()
  }, [problem])

  const restartSearchSet = async () => {
    if (!searchPlaylist) return

    try {
      setError(null)
      const res = await searchProblems(
        searchPlaylist.q,
        searchPlaylist.difficulty,
        searchPlaylist.tags,
        searchPlaylist.tagMatch,
        1,
        searchPlaylist.pageSize,
      )

      if (res.problems.length === 0) {
        setError('No problems match the current practice set.')
        return
      }

      setProblem(res.problems[0])
      setSearchPlaylist({
        ...searchPlaylist,
        page: 1,
        pageSize: res.page_size,
        results: res.problems,
        selectedIndex: 0,
      })
      setPlaylistExhausted(false)
      resetPracticeState()
    } catch (e) {
      setError('Failed to restart the practice set. Is the backend running?')
    }
  }

  const handleSubmit = async (message: string) => {
    if (!problem) return

    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller

    setLoading(true)
    setError(null)
    setStreamingMessage('')

    const userMsg: ChatMessage = { role: 'user', content: message }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)

    try {
      let accumulated = ''
      for await (const event of streamChat(problem.id, stage, history, message, controller.signal)) {
        if (event.type === 'token') {
          accumulated += event.content
          setStreamingMessage(accumulated)
        } else if (event.type === 'done') {
          setHistory([...nextHistory, { role: 'assistant', content: event.message }])
          setStage(event.stage)
          setStreamingMessage('')
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const practiceView = () => {
    if (error && !problem) return (
      <div className="p-10 text-center text-destructive">{error}</div>
    )
    if (!problem) return (
      <div className="p-10 text-center text-muted-foreground">Loading problem...</div>
    )
    if (playlistExhausted && problemSource === 'search') {
      return (
        <EndOfSetView
          onRestart={() => void restartSearchSet()}
          onRandom={() => void loadRandomNextProblem()}
        />
      )
    }
    if (stage === 'complete') {
      return (
        <CompleteView
          onNext={() => void loadNextProblem()}
          onRandom={problemSource === 'search' ? () => void loadRandomNextProblem() : undefined}
        />
      )
    }
    return (
      <div className="flex flex-1 overflow-hidden min-h-0">
        <ProblemView
          key={problem.id}
          problem={problem}
          onSkip={() => void loadNextProblem()}
          onRandom={() => void loadRandomNextProblem()}
          playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
        />
        <ChatView
          history={history}
          stage={stage}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
          streamingMessage={streamingMessage}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <NavBar view={view} onNavigate={setView} />
      {view === 'search'
        ? <SearchPage onSelectProblem={selectProblem} />
        : practiceView()
      }
    </div>
  )
}
