import type { ChatMessage, Stage } from '../types'

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
}

export function ChatView(_: Props) { return <div>ChatView stub</div> }
