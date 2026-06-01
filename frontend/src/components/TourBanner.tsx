interface Props {
  onStart: () => void
  onDismiss: () => void
}

export function TourBanner({ onStart, onDismiss }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-muted border-b border-border text-sm shrink-0">
      <span className="text-muted-foreground">New here?</span>
      <div className="flex items-center gap-3">
        <button
          onClick={onStart}
          className="text-foreground font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
        >
          Take a tour
        </button>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
