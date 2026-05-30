import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type View = 'practice' | 'search'

interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
}

export function NavBar({ view, onNavigate, session, authLoading }: Props) {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
      {(['practice', 'search'] as View[]).map(v => (
        <button
          key={v}
          onClick={() => onNavigate(v)}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm cursor-pointer transition-colors border-none',
            view === v
              ? 'bg-secondary text-secondary-foreground font-semibold'
              : 'bg-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}

      <div className="ml-auto">
        {authLoading ? null : session ? (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors border-none bg-transparent"
          >
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignIn()}
            className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer border-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  )
}
