import { useState, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { DEFAULT_STAGES } from '../types'
import { getStreak, recordStreak, getSettings, updateSettings } from '../api'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [streak, setStreak] = useState<number | null>(null)
  const [activeStages, setActiveStages] = useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [settingsReady, setSettingsReady] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
          getSettings()
            .then(({ active_stages, hide_title }) => {
              setActiveStages(active_stages)
              setHideTitle(hide_title)
            })
            .catch(() => {})
            .finally(() => setSettingsReady(true))
        } else {
          setStreak(null)
          applyLocalSettings()
          setSettingsReady(true)
        }
      } else if (event === 'SIGNED_OUT') {
        setStreak(null)
        applyLocalSettings()
        setSettingsReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function applyLocalSettings() {
    const stored = localStorage.getItem('leetgame_active_stages')
    let stages = DEFAULT_STAGES
    if (stored) {
      try { stages = JSON.parse(stored) as ActiveStage[] } catch { /* use default */ }
    }
    const storedHideTitle = localStorage.getItem('leetgame_hide_title')
    setActiveStages(stages)
    setHideTitle(storedHideTitle === null ? true : storedHideTitle === 'true')
  }

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      updateSettings(stages, hideTitle).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch { /* ignore */ }
    }
  }

  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    if (session) {
      updateSettings(activeStages, value).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_title', String(value))
      } catch { /* ignore */ }
    }
  }

  const recordAndUpdateStreak = () => {
    recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
  }

  return {
    session,
    authLoading,
    streak,
    activeStages,
    hideTitle,
    settingsReady,
    persistStages,
    persistHideTitle,
    recordAndUpdateStreak,
  }
}
