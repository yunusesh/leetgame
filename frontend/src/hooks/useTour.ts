import { useState, useEffect } from 'react'

function storageKey(userId: string) {
  return `leetgame_tour_done_${userId}`
}

export function useTour(userId: string | null) {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (userId) {
      // auth user: check localStorage — if not done, show banner
      const done = localStorage.getItem(storageKey(userId)) === 'true'
      setShowBanner(!done)
    } else {
      // unauth: show every session (no persistence)
      setShowBanner(true)
    }
  }, [userId])

  const dismiss = () => {
    setShowBanner(false)
    if (userId) {
      localStorage.setItem(storageKey(userId), 'true')
    }
  }

  const markDone = () => {
    setShowBanner(false)
    if (userId) {
      localStorage.setItem(storageKey(userId), 'true')
    }
  }

  return { showBanner, dismiss, markDone }
}
