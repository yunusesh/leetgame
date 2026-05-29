import { supabase } from '../lib/supabase'

export function LoginPage() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
      <h1 className="text-2xl font-bold">leetgame</h1>
      <p className="text-muted-foreground text-sm text-center">
        Practice algorithm pattern recognition
      </p>
      <button
        type="button"
        onClick={() => void handleLogin()}
        className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        Sign in with Google
      </button>
    </div>
  )
}
