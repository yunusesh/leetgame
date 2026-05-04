// frontend/src/types.ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
}

export interface ProblemSearchResponse {
  problems: Problem[]
  page: number
  page_size: number
  total: number
}

export interface ProblemTag {
  name: string
  count: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type Stage = 'algorithm' | 'complexity' | 'complete'

export interface ChatResponse {
  message: string
  stage: Stage
}
