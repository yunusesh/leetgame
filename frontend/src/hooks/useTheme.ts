import { useState, useEffect } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'leetgame_theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList
  if (theme === 'dark') {
    cl.add('dark')
    cl.remove('light')
  } else if (theme === 'light') {
    cl.add('light')
    cl.remove('dark')
  } else {
    cl.remove('dark')
    cl.remove('light')
  }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch { /* ignore */ }
  }

  return { theme, setTheme }
}
