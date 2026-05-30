import { Button } from './ui/button'

interface Props {
  onRestart: () => void
  onRandom: () => void
}

export function EndOfSetView({ onRestart, onRandom }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6 px-6 text-center">
      <h1 className="m-0 text-3xl font-medium">End of practice set</h1>
      <p className="m-0 max-w-xl text-muted-foreground text-base">
        You reached the end of the current filtered set. Restart the set from the beginning or jump to another random problem that still matches these filters.
      </p>
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={onRestart}>Restart set</Button>
        <Button variant="outline" size="lg" onClick={onRandom}>Random in set</Button>
      </div>
    </div>
  )
}
