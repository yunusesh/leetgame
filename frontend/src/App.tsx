import { useEffect, useState, useRef } from 'react'
import type { Problem, ChatMessage, Stage, ActiveStage } from './types'
import { DEFAULT_STAGES } from './types'
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getStreak, recordStreak, getSettings, updateSettings } from './api'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { EndOfSetView } from './components/EndOfSetView'
import { SearchPage, type SearchSelectionContext } from './components/SearchPage'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type View = 'practice' | 'search'
type ProblemSource = 'random' | 'search'

interface PracticeSnapshot {
  problem: Problem
  stage: Stage
  history: ChatMessage[]
  searchPlaylist: SearchPlaylist | null
  problemSource: ProblemSource
}

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
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
          getSettings().then(({ active_stages }) => setActiveStages(active_stages)).catch(() => {})
        } else {
          setStreak(null)
          const stored = localStorage.getItem('leetgame_active_stages')
          if (stored) {
            try { setActiveStages(JSON.parse(stored) as ActiveStage[]) } catch { setActiveStages(DEFAULT_STAGES) }
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setStreak(null)
        const stored = localStorage.getItem('leetgame_active_stages')
        if (stored) {
          try { setActiveStages(JSON.parse(stored) as ActiveStage[]) } catch { setActiveStages(DEFAULT_STAGES) }
        } else {
          setActiveStages(DEFAULT_STAGES)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemSource, setProblemSource] = useState<ProblemSource>('random')
  const [searchPlaylist, setSearchPlaylist] = useState<SearchPlaylist | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('pattern')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlistExhausted, setPlaylistExhausted] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [streak, setStreak] = useState<number | null>(null)
  const [activeStages, setActiveStages] = useState<ActiveStage[]>(DEFAULT_STAGES)
  const [sessionStack, setSessionStack] = useState<PracticeSnapshot[]>([])
  const playlistEntryDepthRef = useRef<number>(0)
  const streamAbortRef = useRef<AbortController | null>(null)

  const resetPracticeState = () => {
    setHistory([])
    setStage(activeStages[0])
    setStreamingMessage('')
  }

  const pushSnapshot = () => {
    if (!problem) return
    setSessionStack(s => [...s, { problem, stage, history, searchPlaylist, problemSource }])
  }

  const goBack = () => {
    if (sessionStack.length === 0) return
    const snap = sessionStack[sessionStack.length - 1]
    setProblem(snap.problem)
    setStage(snap.stage)
    setHistory(snap.history)
    setSearchPlaylist(snap.searchPlaylist)
    setProblemSource(snap.problemSource)
    setPlaylistExhausted(false)
    setError(null)
    setStreamingMessage('')
    setSessionStack(s => s.slice(0, -1))
  }

  const handleStagesChange = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      updateSettings(stages).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch { /* ignore */ }
    }
  }

  const loadRandomProblem = async () => {
    try {
      pushSnapshot()
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
      pushSnapshot()
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
      pushSnapshot()
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
        pushSnapshot()
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
    pushSnapshot()
    playlistEntryDepthRef.current = sessionStack.length + (problem ? 1 : 0)
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


  useEffect(() => {
    void loadRandomProblem()
  }, [])

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

      pushSnapshot()
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
      for await (const event of streamChat(problem.id, stage, activeStages, history, message, controller.signal)) {
        if (event.type === 'token') {
          accumulated += event.content
          setStreamingMessage(accumulated)
        } else if (event.type === 'done') {
          setHistory([...nextHistory, { role: 'assistant', content: event.message }])
          setStage(event.stage)
          setStreamingMessage('')
          if (event.stage === 'complete' && session) {
            recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setStreamingMessage('')
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
    const canGoBack = problemSource === 'search'
      ? sessionStack.length > playlistEntryDepthRef.current
      : sessionStack.length > 0
    const exitPlaylist = () => {
      playlistEntryDepthRef.current = 0
      setSessionStack([])
      void loadRandomProblem()
    }
    return (
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        <ProblemView
          key={problem.id}
          problem={problem}
          onSkip={() => void loadNextProblem()}
          onRandom={() => void loadRandomNextProblem()}
          onBack={canGoBack ? goBack : undefined}
          onExitPlaylist={problemSource === 'search' ? exitPlaylist : undefined}
          playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
        />
        <ChatView
          history={history}
          stage={stage}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
          streamingMessage={streamingMessage}
          onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
          onRandom={stage === 'complete' && problemSource === 'search' ? () => void loadRandomNextProblem() : undefined}
          onBack={stage === 'complete' && canGoBack ? goBack : undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh">
      <NavBar
        view={view}
        onNavigate={setView}
        session={session}
        authLoading={authLoading}
        streak={streak}
        activeStages={activeStages}
        onStagesChange={handleStagesChange}
      />
      {view === 'search'
        ? <SearchPage onSelectProblem={selectProblem} />
        : practiceView()
      }
    </div>
  )
}
