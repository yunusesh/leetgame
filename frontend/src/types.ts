// frontend/src/types.ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
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
