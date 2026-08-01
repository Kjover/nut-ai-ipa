import { Tabs } from 'expo-router'
import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../src/theme/ThemeProvider'
import { MIN_TAP_TARGET, radius, space, type } from '../../src/theme/tokens'

/**
 * The four tabs, with a custom tabBar renderer.
 *
 * SPEC-ui.md §2, PLAN.md D21. `Foods` replaces the incumbent's `Groups` social
 * feed: a feed cannot be local-first without a server we operate, it needs Apple
 * 1.2 moderation machinery, and it is the highest eating-disorder-risk surface in
 * the whole product. The third slot is better spent on the library that makes
 * repeat logging fast, which is the highest-leverage retention surface in any
 * tracker.
 *
 * The default tab bar cannot render the floating pill plus a detached FAB, hence
 * the custom renderer.
 */

const TABS = [
  { name: 'index', label: 'Today', glyph: '◍' },
  { name: 'trends', label: 'Trends', glyph: '◔' },
  { name: 'foods', label: 'Foods', glyph: '☰' },
  { name: 'you', label: 'You', glyph: '◑' },
] as const

export default function TabLayout() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={[styles.pill, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            {TABS.map((tab, i) => {
              const focused = state.index === i
              return (
                <Pressable
                  key={tab.name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={tab.label}
                  onPress={() => navigation.navigate(tab.name)}
                  style={styles.tab}
                  hitSlop={space.sm}
                >
                  <Text style={{ color: focused ? theme.text : theme.textFaint, fontSize: 18 }}>
                    {tab.glyph}
                  </Text>
                  <Text
                    style={[type.micro, { color: focused ? theme.text : theme.textFaint, marginTop: 2 }]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/*
            The FAB is ALWAYS present and ALWAYS opens real logging.
            The single most consequential structural decision in this app: the
            incumbent paywalls this button, which is the direct cause of its
            third-most-common complaint. There is no IAP configured anywhere in
            this project, which is what leaves App Store Guideline 3.1.1 nothing
            to attach to.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
            onPress={() => router.push('/camera')}
            style={[styles.fab, { backgroundColor: theme.text }]}
          >
            <Text style={{ color: theme.bg, fontSize: 28, lineHeight: 30, fontWeight: '300' }}>+</Text>
          </Pressable>
        </View>
      )}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TAP_TARGET,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
