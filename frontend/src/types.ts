// frontend/src/types.ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
  leetcode_id: number | null
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

export type ActiveStage = 'edge_cases' | 'brute_force' | 'pattern' | 'algorithm' | 'tc_sc'

export type Stage = ActiveStage | 'complete'

export const CANONICAL_STAGES: ActiveStage[] = [
  'edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc',
]

export const DEFAULT_STAGES: ActiveStage[] = ['pattern', 'algorithm', 'tc_sc']

export interface ChatResponse {
  message: string
  stage: Stage
}
