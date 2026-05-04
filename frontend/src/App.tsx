import { useEffect, useState } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, sendChat } from './api'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'

export default function App() {
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

  if (error && !problem) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#ff375f' }}>{error}</div>
  )

  if (!problem) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>Loading problem...</div>
  )

  if (stage === 'complete') return <CompleteView onNext={loadProblem} />

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
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
