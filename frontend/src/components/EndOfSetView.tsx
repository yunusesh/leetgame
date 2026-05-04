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
        <button
          onClick={onRestart}
          className="px-8 py-3 rounded-lg bg-primary text-primary-foreground border-none text-base font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
        >
          Restart set
        </button>
        <button
          onClick={onRandom}
          className="px-6 py-3 rounded-lg border border-border bg-transparent text-base font-semibold cursor-pointer hover:bg-muted transition-colors"
        >
          Random in set
        </button>
      </div>
    </div>
  )
}
