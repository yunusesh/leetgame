interface Props {
  onNext: () => void
}

export function CompleteView({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="m-0 text-muted-foreground text-base">
        You nailed the algorithm and complexity.
      </p>
      <button
        onClick={onNext}
        className="px-8 py-3 rounded-lg bg-primary text-primary-foreground border-none text-base font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
      >
        Next Problem
      </button>
    </div>
  )
}
