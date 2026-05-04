import { useEffect, useState } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, sendChat } from './api'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'
import { SearchPage } from './components/SearchPage'

type View = 'practice' | 'search'

export default function App() {
  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('algorithm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProblem = async () => {
    try {
      setError(null)
      const p = await getRandomProblem()
      setProblem(p)
      setHistory([])
      setStage('algorithm')
    } catch (e) {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const selectProblem = (p: Problem) => {
    setProblem(p)
    setHistory([])
    setStage('algorithm')
    setError(null)
    setView('practice')
  }

  useEffect(() => { loadProblem() }, [])

  const handleSubmit = async (message: string) => {
    if (!problem) return
    setLoading(true)
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: message }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)
    try {
      const resp = await sendChat(problem.id, stage, history, message)
      setHistory([...nextHistory, { role: 'assistant', content: resp.message }])
      setStage(resp.stage)
    } catch (e) {
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
    if (stage === 'complete') return <CompleteView onNext={loadProblem} />
    return (
      <div className="flex flex-1 overflow-hidden">
        <ProblemView key={problem.id} problem={problem} onSkip={loadProblem} />
        <ChatView
          history={history}
          stage={stage}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
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
