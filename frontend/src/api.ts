import type { Problem, ChatMessage, Stage, ProblemSearchResponse, ProblemTag } from './types'
import { supabase } from './lib/supabase'

const API_URL = import.meta.env.VITE_API_URL ?? ''

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch(`${API_URL}/api/problems/random`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function getRandomProblemFiltered(
  q: string,
  difficulty: string,
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(`${API_URL}/api/problems/random?${params.toString()}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch filtered random problem: ${res.status}`)
  return res.json()
}

export async function searchProblems(
  q: string,
  difficulty: string,
  tags: string[],
  tagMatch: 'and' | 'or',
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ProblemSearchResponse> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
    signal,
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function getProblemTags(signal?: AbortSignal): Promise<ProblemTag[]> {
  const res = await fetch(`${API_URL}/api/problems/tags`, {
    signal,
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`)
  return res.json()
}

export async function* streamChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<
  { type: 'token'; content: string } |
  { type: 'done'; stage: Stage; message: string }
> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  }
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ problem_id: problemId, stage, history, message }),
    signal,
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()!
    for (const event of events) {
      const lines = event.trim().split('\n')
      const type = lines.find(l => l.startsWith('event: '))?.slice(7)
      const data = lines.find(l => l.startsWith('data: '))?.slice(6)
      if (!type || !data) continue
      const parsed = JSON.parse(data)
      if (type === 'token') {
        console.log('[stream] token:', parsed.content)
        yield { type: 'token', content: parsed.content }
      } else if (type === 'done') {
        console.log('[stream] done:', parsed)
        yield { type: 'done', ...parsed }
      } else if (type === 'error') throw new Error('LLM evaluation failed')
    }
  }
}

export async function getStreak(): Promise<{ streak: number }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}

export async function recordStreak(): Promise<{ streak: number }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}
