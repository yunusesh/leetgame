// frontend/src/api.ts
import type { Problem, ChatMessage, Stage, ChatResponse } from './types'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch('/api/problems/random')
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function searchProblems(q: string, difficulty: string, tags: string[], signal?: AbortSignal): Promise<Problem[]> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  const res = await fetch(`/api/problems?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function sendChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_id: problemId, stage, history, message }),
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
  return res.json()
}
