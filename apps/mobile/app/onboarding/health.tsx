import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { OnboardingScreen } from '../../src/components/onboarding/Chrome'
import { nextRoute, stepIndex, TOTAL_STEPS } from '../../src/onboarding/flow'
import { setAnswer } from '../../src/onboarding/store'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

/**
 * Apple Health.
 *
 * The HealthKit integration itself is M6. Rather than fake a permission prompt,
 * this screen is honest about what it does today: Continue records the intent so
 * the toggle is pre-armed in Settings, and nothing is claimed to have synced.
 * A screen that says "connected" while writing nothing would be the exact kind
 * of dishonesty this app exists to avoid.
 */
export default function HealthScreen() {
  const theme = useTheme()

  const go = (connected: boolean) => {
    setAnswer('healthConnected', connected)
    router.push(nextRoute('health') as never)
  }

  return (
    <OnboardingScreen
      step={stepIndex('health')}
      total={TOTAL_STEPS}
      title=""
      cta="Continue"
      onCta={() => go(true)}
      secondaryLabel="Skip"
      onSecondary={() => go(false)}
      scroll
    >
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.halo, { backgroundColor: theme.uncertainBg }]}>
          <View style={styles.row}>
            <View style={[styles.tile, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={{ fontSize: 34 }}>❤️</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 20 }}>→</Text>
            <View style={[styles.tile, { backgroundColor: theme.text }]}>
              <Text style={{ fontSize: 34 }}>🥜</Text>
            </View>
          </View>
          <View style={styles.wordRow}>
            {['Walking', 'Running', 'Yoga', 'Sleep'].map((w) => (
              <View key={w} style={[styles.word, { backgroundColor: theme.bgElevated }]}>
                <Text style={[type.label, { color: theme.text }]}>{w}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Text style={[styles.heading, { color: theme.text }]}>Connect to Apple Health</Text>
      <Text style={[type.body, { color: theme.textMuted, marginTop: space.md }]}>
        Sync your daily activity between Nut AI and the Health app so your calorie target reflects
        what you actually did.
      </Text>
      <Text style={[type.caption, { color: theme.textMuted, marginTop: space.lg }]}>
        Not wired up yet — this arms the toggle in Settings and asks for permission when the
        integration ships. We won't tell you it synced when it didn't.
      </Text>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  halo: {
    width: '100%', borderRadius: radius.xl, paddingVertical: space.xxl,
    alignItems: 'center', marginTop: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  tile: {
    width: 86, height: 86, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  wordRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  word: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  heading: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1, marginTop: space.xl },
})
