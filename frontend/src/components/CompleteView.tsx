interface Props {
  onNext: () => void
  onRandom?: () => void
}

export function CompleteView({ onNext, onRandom }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="m-0 text-muted-foreground text-base">
        You nailed the algorithm and complexity.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-lg bg-primary text-primary-foreground border-none text-base font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
        >
          Next Problem
        </button>
        {onRandom && (
          <button
            onClick={onRandom}
            className="px-6 py-3 rounded-lg border border-border bg-transparent text-base font-semibold cursor-pointer hover:bg-muted transition-colors"
          >
            Random Problem
          </button>
        )}
      </div>
    </div>
  )
}
