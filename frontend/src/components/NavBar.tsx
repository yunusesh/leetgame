import { cn } from '../lib/utils'

type View = 'practice' | 'search'

export function NavBar({ view, onNavigate }: { view: View, onNavigate: (v: View) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
      {(['practice', 'search'] as View[]).map(v => (
        <button
          key={v}
          onClick={() => onNavigate(v)}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm cursor-pointer transition-colors border-none capitalize',
            view === v
              ? 'bg-secondary text-secondary-foreground font-semibold'
              : 'bg-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  )
}
