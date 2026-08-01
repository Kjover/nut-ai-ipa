import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/theme/ThemeProvider'
import { space, type } from '../../src/theme/tokens'

export default function Trends() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 140 }}
    >
      <Text style={[type.title, { color: theme.text }]}>Trends</Text>
      <Text style={[type.caption, { color: theme.textMuted, marginTop: space.sm }]}>
        Weight trend, weekly calories and macro balance appear here once you have logged a few days.
      </Text>
    </ScrollView>
  )
}
