import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'

type View = 'practice' | 'search'

interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
}

export function NavBar({ view, onNavigate, session, authLoading, streak }: Props) {
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

      <div className="ml-auto flex items-center gap-2">
        {authLoading ? null : session ? (
          <>
            {streak !== null && streak >= 1 && (
              <span className="text-sm font-medium">🔥 {streak}</span>
            )}
            {session.user.user_metadata?.avatar_url && (
              <img
                src={session.user.user_metadata.avatar_url as string}
                alt="avatar"
                className="h-6 w-6 rounded-full"
              />
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {session.user.user_metadata?.name as string ?? session.user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void handleSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
