import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import {
  currentGoal,
  dayTotals,
  localDate,
  runAdaptive,
  setting,
  type AdaptiveOutcome,
  type CurrentGoal,
  type DayTotals,
} from '../../src/data/repo'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

/**
 * Today.
 *
 * Reads the goal actually in force and the food actually logged. Two rules it
 * will not break:
 *
 *   A day with nothing logged reads "no entries logged" in a neutral colour.
 *   Never "missed", never red — red is for safety warnings only.
 *
 *   Going over target is stated, not scolded. The ring draws an overflow arc
 *   rather than clamping at 100% and lying about it.
 */
export default function Today() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [goal, setGoal] = useState<CurrentGoal | null>(null)
  const [totals, setTotals] = useState<DayTotals | null>(null)
  const [emphasis, setEmphasis] = useState('calories')
  const [adaptive, setAdaptive] = useState<AdaptiveOutcome | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      void (async () => {
        const now = Date.now()
        // The adaptive loop runs BEFORE reading the goal, so a target it just
        // changed is the one rendered. Its own gates decide whether it may act.
        const outcome = await runAdaptive(now)
        const [g, t, e] = await Promise.all([
          currentGoal(),
          dayTotals(localDate(now)),
          setting('today.emphasis', 'calories'),
        ])
        if (!alive) return
        setAdaptive(outcome)
        setGoal(g)
        setTotals(t)
        setEmphasis(e)
      })()
      return () => {
        alive = false
      }
    }, []),
  )

  if (!goal || !totals) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[type.body, { color: theme.textMuted }]}>Loading your day…</Text>
      </View>
    )
  }

  const remaining = goal.targetKcal - totals.kcal
  const over = remaining < 0
  const pct = goal.targetKcal > 0 ? totals.kcal / goal.targetKcal : 0
  const empty = totals.mealCount === 0 && totals.pendingCount === 0

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 150 }}
    >
      <Text style={[type.title, { color: theme.text }]}>Today</Text>

      <View style={[styles.hero, { backgroundColor: theme.bgSunken }]}>
        <Ring pct={pct} over={over} />
        <View style={styles.ringLabel} pointerEvents="none">
          <Text style={[styles.big, { color: theme.text }]}>{Math.abs(Math.round(remaining))}</Text>
          <Text style={[type.caption, { color: theme.textMuted }]}>
            {over ? 'calories over' : 'calories left'}
          </Text>
        </View>
        <Text style={[type.caption, { color: theme.textMuted, marginTop: space.lg }]}>
          {Math.round(totals.kcal)} of {Math.round(goal.targetKcal)} kcal
        </Text>
      </View>

      <View style={styles.macroRow}>
        <Macro label="Protein" eaten={totals.protein_g} target={goal.protein_g} color={theme.protein} lead={emphasis === 'protein'} />
        <Macro label="Carbs" eaten={totals.carbs_g} target={goal.carbs_g} color={theme.carbs} />
        <Macro label="Fat" eaten={totals.fat_g} target={goal.fat_g} color={theme.fat} />
      </View>

      {empty ? (
        <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
          <Text style={[type.bodyStrong, { color: theme.textMuted }]}>no entries logged</Text>
          <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs }]}>
            Tap + to log a meal, or search the food database from the Foods tab.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
          <Text style={[type.bodyStrong, { color: theme.text }]}>
            {totals.mealCount} {totals.mealCount === 1 ? 'meal' : 'meals'} logged
          </Text>
          {totals.pendingCount > 0 ? (
            <Text style={[type.caption, { color: theme.uncertain, marginTop: space.xs }]}>
              +{totals.pendingCount} still analyzing — not counted yet
            </Text>
          ) : null}
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
        <Text style={[type.bodyStrong, { color: theme.text }]}>Your target</Text>
        {adaptive?.surfaced ? (
          <Text style={[type.caption, { color: theme.text, marginTop: space.xs }]}>
            Updated to {Math.round(adaptive.newKcal ?? 0)} kcal. {adaptive.explanation}
          </Text>
        ) : (
          <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs }]}>
            {goal.adaptive
              ? (adaptive?.reason ?? 'Adapting from your own trend and intake.')
              : 'Fixed — you set this by hand, so we leave it alone.'}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/log-weight' as never)}
          hitSlop={space.sm}
          style={{ marginTop: space.md }}
        >
          <Text style={[type.label, { color: theme.protein }]}>Log today's weight →</Text>
        </Pressable>
      </View>

      {goal.floorApplied ? (
        <View style={[styles.card, { backgroundColor: theme.uncertainBg }]}>
          <Text style={[type.caption, { color: theme.text }]}>
            This target sits at our safe floor. Your inputs alone would have given{' '}
            {Math.round(goal.targetRawKcal)} kcal.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

/** Monochrome hero ring. Overflow draws a second offset arc rather than lying. */
function Ring({ pct, over }: { pct: number; over: boolean }) {
  const theme = useTheme()
  const size = 220
  const r = size / 2 - 14
  const c = 2 * Math.PI * r
  const primary = Math.min(1, pct)
  const overflow = over ? Math.min(1, pct - 1) : 0
  const innerR = r - 22
  const innerC = 2 * Math.PI * innerR

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.ringTrack} strokeWidth="16" fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={theme.ring} strokeWidth="16" fill="none"
        strokeDasharray={`${c * primary} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {overflow > 0 ? (
        <Circle
          cx={size / 2} cy={size / 2} r={innerR}
          stroke={theme.uncertain} strokeWidth="8" fill="none"
          strokeDasharray={`${innerC * overflow} ${innerC}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  )
}

function Macro({
  label, eaten, target, color, lead,
}: {
  label: string
  eaten: number
  target: number
  color: string
  lead?: boolean
}) {
  const theme = useTheme()
  const left = Math.max(0, target - eaten)
  const pct = target > 0 ? Math.min(1, eaten / target) : 0
  return (
    <View
      style={[
        styles.macroCard,
        { backgroundColor: theme.bgSunken, borderColor: lead ? color : 'transparent', borderWidth: lead ? 2 : 0 },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={[type.caption, { color: theme.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.macroNum, { color: theme.text }]}>{Math.round(left)}g</Text>
      <Text style={[type.micro, { color: theme.textFaint }]}>left</Text>
      <View style={[styles.bar, { backgroundColor: theme.ringTrack }]}>
        <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: color }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: space.lg, borderRadius: radius.xl, paddingVertical: space.xl, alignItems: 'center' },
  ringLabel: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 52, fontWeight: '800', letterSpacing: -1.8 },
  macroRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  macroCard: { flex: 1, padding: space.md, borderRadius: radius.lg, gap: 2 },
  macroNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: space.xs },
  bar: { height: 4, borderRadius: 2, marginTop: space.sm, overflow: 'hidden' },
  card: { marginTop: space.md, padding: space.lg, borderRadius: radius.lg },
})
