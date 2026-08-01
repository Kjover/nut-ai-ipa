import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/theme/ThemeProvider'
import { space, type } from '../../src/theme/tokens'

/**
 * You — profile, goals, settings, and the accuracy page.
 *
 * Every onboarding answer has an equivalent here. That is a test, not an
 * aspiration: a screen that can only be answered once is a trap.
 */
export default function You() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 140 }}
    >
      <Text style={[type.title, { color: theme.text }]}>You</Text>
      <Text style={[type.caption, { color: theme.textMuted, marginTop: space.sm }]}>
        Goals, how your numbers are calculated, and how accurate they actually are.
      </Text>
    </ScrollView>
  )
}
