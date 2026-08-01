import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { computeTrend, trendSlopeLbPerWeek, type TrendPoint } from '@nutai/goals'
import { currentGoal, weightHistory, type CurrentGoal } from '../../src/data/repo'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

const LB_PER_KG = 2.20462

/**
 * Trends.
 *
 * TWO SERIES, BOTH LABELLED. Raw weigh-ins as dots, the EWMA trend as a line.
 *
 * That labelling is the whole point. The incumbent draws a second line with no
 * legend, which even researchers looking at it could not identify — and an
 * unexplained line on a chart about someone's body is worse than no line. Here
 * the dots are what the scale said and the line is what it means, and the caption
 * says exactly that.
 */
export default function Trends() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [slope, setSlope] = useState<number | null>(null)
  const [goal, setGoal] = useState<CurrentGoal | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      void (async () => {
        const [points, g] = await Promise.all([weightHistory(), currentGoal()])
        if (!alive) return
        const t = computeTrend(points)
        setTrend(t)
        setSlope(trendSlopeLbPerWeek(t))
        setGoal(g)
      })()
      return () => {
        alive = false
      }
    }, []),
  )

  const raw = trend.filter((p) => p.rawKg != null)

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 150 }}
    >
      <Text style={[type.title, { color: theme.text }]}>Trends</Text>

      {raw.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
          <Text style={[type.bodyStrong, { color: theme.text }]}>No weigh-ins yet</Text>
          <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs }]}>
            Log your weight a few times and a trend line appears here. It takes about five entries
            before the slope means anything — fewer than that is noise, not a trend.
          </Text>
          <Pressable onPress={() => router.push('/log-weight' as never)} hitSlop={space.sm} style={{ marginTop: space.md }}>
            <Text style={[type.label, { color: theme.protein }]}>Log today's weight →</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
            <Text style={[type.heading, { color: theme.text }]}>Weight</Text>
            <WeightChart trend={trend} />

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: theme.textFaint }]} />
                <Text style={[type.caption, { color: theme.textMuted }]}>Each weigh-in</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.line, { backgroundColor: theme.text }]} />
                <Text style={[type.caption, { color: theme.textMuted }]}>Trend (what matters)</Text>
              </View>
            </View>

            <Text style={[type.caption, { color: theme.textMuted, marginTop: space.md, lineHeight: 19 }]}>
              The dots are what the scale said. The line is what it means — a single day can swing
              3 lb on water alone, so we smooth it before drawing any conclusions.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
            <Text style={[type.heading, { color: theme.text }]}>Rate of change</Text>
            {slope == null ? (
              <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs }]}>
                Not enough entries yet.
              </Text>
            ) : (
              <>
                <Text style={[styles.slope, { color: theme.text }]}>
                  {slope > 0 ? '+' : ''}
                  {slope.toFixed(2)} lb/week
                </Text>
                <Text style={[type.caption, { color: theme.textMuted }]}>
                  {raw.length} weigh-in{raw.length === 1 ? '' : 's'} over{' '}
                  {trend.length} day{trend.length === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </View>

          {goal ? (
            <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
              <Text style={[type.heading, { color: theme.text }]}>Your target</Text>
              <Text style={[styles.slope, { color: theme.text }]}>
                {Math.round(goal.targetKcal)} kcal
              </Text>
              <Text style={[type.caption, { color: theme.textMuted }]}>
                {goal.adaptive
                  ? 'Adapting from your own trend and intake, not a fixed formula.'
                  : 'Fixed — you set this by hand.'}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

function WeightChart({ trend }: { trend: TrendPoint[] }) {
  const theme = useTheme()
  const W = 300
  const H = 160

  const values = trend.flatMap((p) => [p.trendKg, ...(p.rawKg != null ? [p.rawKg] : [])])
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series must not divide by zero, and needs visible headroom anyway.
  const span = max - min < 0.5 ? 1 : max - min
  const pad = span * 0.15

  const x = (i: number) => (trend.length <= 1 ? W / 2 : (i / (trend.length - 1)) * (W - 20) + 10)
  const y = (kg: number) => H - 20 - ((kg - min + pad) / (span + pad * 2)) * (H - 40)

  let d = ''
  trend.forEach((p, i) => {
    d += `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.trendKg)} `
  })

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: space.md }}>
      {trend.map((p, i) =>
        p.rawKg != null ? (
          <Circle key={i} cx={x(i)} cy={y(p.rawKg)} r="3.5" fill={theme.textFaint} />
        ) : null,
      )}
      <Path d={d} stroke={theme.text} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  card: { marginTop: space.lg, padding: space.lg, borderRadius: radius.xl },
  legend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 18, height: 3, borderRadius: 2 },
  slope: { fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: space.sm },
})
