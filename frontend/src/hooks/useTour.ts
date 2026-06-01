import { useState, useEffect } from 'react'

const UNAUTH_TOUR_KEY = 'leetgame_tour_dismissed'

export function useTour(isAuth: boolean, tourDone: boolean, persistTourDone: () => void) {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (isAuth) {
      setShowBanner(!tourDone)
    } else {
      setShowBanner(localStorage.getItem(UNAUTH_TOUR_KEY) !== 'true')
    }
  }, [isAuth, tourDone])

  const dismiss = () => {
    setShowBanner(false)
    if (isAuth) {
      persistTourDone()
    } else {
      localStorage.setItem(UNAUTH_TOUR_KEY, 'true')
    }
  }

  const markDone = () => {
    setShowBanner(false)
    if (isAuth) {
      persistTourDone()
    } else {
      localStorage.setItem(UNAUTH_TOUR_KEY, 'true')
    }
  }

  return { showBanner, dismiss, markDone }
}
