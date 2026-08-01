import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfidenceChip, ConfidenceReasons } from '../src/components/ConfidenceChip'
import { answerQuestion, editGrams, removeRow, reset, useScan } from '../src/scan/store'
import { useTheme } from '../src/theme/ThemeProvider'
import { MIN_TAP_TARGET, radius, space, type } from '../src/theme/tokens'

/**
 * The result screen.
 *
 * SPEC-accuracy-engine.md §8.2, and ruling 2 of PLAN.md §3.3.
 *
 * ONE primary action: `Log it`. There is no `Fix Results` mode.
 *
 * That is not a simplification, it is the fix. A separate "fix mode" structurally
 * forces the interruption cost to be paid even when nothing is worth asking, and
 * it is what makes "re-analysis that deletes the ingredients you already
 * corrected" possible at all. THE REVIEW SCREEN IS THE FIX SCREEN. Every row is
 * editable in place, and every edit recomputes locally, instantly, for free.
 */
export default function Result() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const phase = useScan()
  const [expandedBand, setExpandedBand] = useState(false)

  if (phase.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[type.heading, { color: theme.text }]}>
          {phase.kind === 'analyzing' ? 'Reading your meal…' : 'Nothing to show yet'}
        </Text>
        {phase.kind === 'captured' && (
          <Text style={[type.caption, { color: theme.textMuted, marginTop: space.sm, textAlign: 'center' }]}>
            Your photo is saved. You can log this by hand if you would rather not wait.
          </Text>
        )}
        <Pressable onPress={() => router.back()} hitSlop={space.md} style={{ marginTop: space.xl }}>
          <Text style={[type.body, { color: theme.textMuted }]}>Close</Text>
        </Pressable>
      </View>
    )
  }

  const { result } = phase
  const highlighted = result.questions.filter((q) => q.state === 'highlighted')
  const preAnswered = result.questions.filter((q) => q.state === 'pre_answered')

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 120 }}>
        <Text style={[type.title, { color: theme.text }]}>
          {result.items[0]?.row.displayName ?? 'Your meal'}
        </Text>

        {/* The point estimate leads. The band qualifies it — it never replaces it. */}
        <View style={{ marginTop: space.lg }}>
          <Text style={[type.hero, { color: theme.text }]}>{result.totals.kcal}</Text>
          <Text style={[type.caption, { color: theme.textMuted, marginTop: -space.xs }]}>kcal</Text>

          <View style={{ marginTop: space.md }}>
            <ConfidenceChip
              value={result.totals.kcal}
              band={result.mealBand}
              expanded={expandedBand}
              onPress={() => setExpandedBand((v) => !v)}
            />
            {expandedBand && <ConfidenceReasons band={result.mealBand} />}
          </View>
        </View>

        <View style={styles.macroRow}>
          <Macro label="Protein" value={result.totals.protein_g} color={theme.protein} />
          <Macro label="Carbs" value={result.totals.carbs_g} color={theme.carbs} />
          <Macro label="Fat" value={result.totals.fat_g} color={theme.fat} />
        </View>

        {/* Highlighted questions: at most two, ever. */}
        {highlighted.map((q) => (
          <View key={q.question.id} style={[styles.qCard, { borderColor: theme.uncertain, backgroundColor: theme.uncertainBg }]}>
            <Text style={[type.bodyStrong, { color: theme.text }]}>{q.text}</Text>
            <View style={styles.chipRow}>
              {q.question.options.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => answerQuestion(q, opt.value)}
                  hitSlop={space.sm}
                  style={[styles.chip, { borderColor: theme.uncertain }]}
                >
                  <Text style={[type.label, { color: theme.text }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Every silent default is shown. None is ever hidden. */}
        {preAnswered.length > 0 && (
          <View style={{ marginTop: space.lg, gap: space.xs }}>
            {preAnswered.map((q) => (
              <Pressable key={q.question.id} onPress={() => answerQuestion(q, q.appliedDefault ?? '')} hitSlop={space.xs}>
                <Text style={[type.caption, { color: theme.textMuted }]}>
                  {q.disclosure} · <Text style={{ color: theme.uncertain }}>change</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[type.label, { color: theme.textMuted, marginTop: space.xl }]}>Ingredients</Text>

        {result.meal.ingredients.map((row) => {
          const item = result.items.find((i) => i.row.id === row.id)
          return (
            <View key={row.id} style={[styles.row, { borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: theme.text }]}>{row.displayName}</Text>
                {row.isEstimate && (
                  <Text style={[type.micro, { color: theme.uncertain, marginTop: 2 }]}>AI ESTIMATE</Text>
                )}
                {item && <ConfidenceChip value={(row.nutrientSnapshot.kcal * row.grams) / 100} band={item.band} />}
              </View>

              <TextInput
                accessibilityLabel={`Grams of ${row.displayName}`}
                keyboardType="numeric"
                defaultValue={String(Math.round(row.grams))}
                onChangeText={(t) => editGrams(row.id, Number(t))}
                style={[styles.gramInput, { color: theme.text, borderColor: theme.border }]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.displayName}`}
                onPress={() => removeRow(row.id)}
                hitSlop={space.md}
                style={styles.remove}
              >
                <Text style={{ color: theme.textFaint, fontSize: 20 }}>×</Text>
              </Pressable>
            </View>
          )
        })}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, space.lg), backgroundColor: theme.bg, borderColor: theme.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { reset(); router.dismissAll() }}
          style={[styles.primary, { backgroundColor: theme.text }]}
        >
          <Text style={[type.bodyStrong, { color: theme.bg }]}>Log it</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={[type.heading, { color: theme.text }]}>{Math.round(value)}</Text>
        <Text style={[type.caption, { color: theme.textFaint }]}>g</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={[type.caption, { color: theme.textMuted }]}>{label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  macroRow: { flexDirection: 'row', marginTop: space.xl, gap: space.md },
  qCard: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gramInput: {
    width: 64,
    textAlign: 'right',
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TAP_TARGET,
  },
  remove: { width: MIN_TAP_TARGET, height: MIN_TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    paddingVertical: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
  },
})
