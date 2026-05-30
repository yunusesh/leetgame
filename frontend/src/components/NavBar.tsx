import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'

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
        <Button
          key={v}
          variant={view === v ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </Button>
      ))}

      <div className="ml-auto">
        {authLoading ? null : session ? (
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        ) : (
          <Button size="sm" onClick={() => void handleSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
