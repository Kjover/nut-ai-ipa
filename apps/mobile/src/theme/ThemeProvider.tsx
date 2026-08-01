import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { AccessibilityInfo, useColorScheme } from 'react-native'
import { useEffect, useState } from 'react'
import { darkTheme, lightTheme, type Theme } from './tokens'

const ThemeContext = createContext<Theme>(lightTheme)
const MotionContext = createContext<number>(1)

/** Every duration in the app is multiplied by this. 0 disables motion entirely. */
export const useMotionScale = () => useContext(MotionContext)
export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => { alive = false; sub.remove() }
  }, [])

  const theme = useMemo(() => (scheme === 'dark' ? darkTheme : lightTheme), [scheme])

  return (
    <ThemeContext.Provider value={theme}>
      <MotionContext.Provider value={reduceMotion ? 0 : 1}>{children}</MotionContext.Provider>
    </ThemeContext.Provider>
  )
}
