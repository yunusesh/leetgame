import { useState, useEffect } from 'react'

export function useTour(isAuth: boolean, tourDone: boolean, persistTourDone: () => void) {
  // For unauth users, showBanner is pure React state (resets every page load).
  // For auth users, showBanner is derived from tourDone (persisted in backend settings).
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (isAuth) {
      setShowBanner(!tourDone)
    } else {
      setShowBanner(true)
    }
  }, [isAuth, tourDone])

  const dismiss = () => {
    setShowBanner(false)
    if (isAuth) persistTourDone()
  }

  const markDone = () => {
    setShowBanner(false)
    if (isAuth) persistTourDone()
  }

  return { showBanner, dismiss, markDone }
}
