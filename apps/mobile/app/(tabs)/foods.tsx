import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/theme/ThemeProvider'
import { space, type } from '../../src/theme/tokens'

/**
 * Foods — the library that replaces the incumbent's `Groups` social feed.
 *
 * Saved meals, custom foods and favourites. Relogging from here issues zero
 * network requests and surfaces zero questions, because a saved meal stores the
 * CORRECTED ingredient array rather than a food name to re-analyze.
 */
export default function Foods() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 140 }}
    >
      <Text style={[type.title, { color: theme.text }]}>Foods</Text>
      <Text style={[type.caption, { color: theme.textMuted, marginTop: space.sm }]}>
        Meals you save show up here. Relogging one is instant and free — it never re-runs a scan.
      </Text>
    </ScrollView>
  )
}
