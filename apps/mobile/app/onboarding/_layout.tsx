import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

export default function OnboardingLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
        // Native push transitions and the iOS back-swipe, for free.
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  )
}
