import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

/**
 * Today.
 *
 * The empty state is deliberately NOT a scold and NOT a celebrating banner. A day
 * with nothing logged reads "no entries logged" in a neutral colour — never
 * "missed", never red.
 */
export default function Today() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 140 }}
    >
      <Text style={[type.title, { color: theme.text }]}>Today</Text>

      <View style={[styles.card, { backgroundColor: theme.bgSunken, borderColor: theme.border }]}>
        <Text style={[type.hero, { color: theme.text }]}>—</Text>
        <Text style={[type.caption, { color: theme.textMuted }]}>no entries logged</Text>
      </View>

      <Text style={[type.caption, { color: theme.textFaint, marginTop: space.lg }]}>
        Tap + to log your first meal.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
})
