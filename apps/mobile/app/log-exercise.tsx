import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { db, localDate } from '../src/data/repo'
import { useTheme } from '../src/theme/ThemeProvider'
import { radius, space, type } from '../src/theme/tokens'

/**
 * Log exercise.
 *
 * Written with a PROVENANCE tag, which is the whole point: a workout read from
 * Apple Health and the same workout typed here must never both count. The unique
 * index on external_id enforces that at the database, not in a code path someone
 * can forget to call.
 */
const PRESETS = [
  { name: 'Walk', kcalPerMin: 4, glyph: '🚶' },
  { name: 'Run', kcalPerMin: 11, glyph: '🏃' },
  { name: 'Cycle', kcalPerMin: 8, glyph: '🚴' },
  { name: 'Weights', kcalPerMin: 6, glyph: '🏋️' },
  { name: 'Swim', kcalPerMin: 10, glyph: '🏊' },
  { name: 'Other', kcalPerMin: 5, glyph: '⊕' },
]

export default function LogExercise() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [picked, setPicked] = useState(PRESETS[0]!)
  const [minutes, setMinutes] = useState('30')
  const [saving, setSaving] = useState(false)

  const mins = Number.parseInt(minutes, 10)
  const kcal = Number.isFinite(mins) ? Math.round(mins * picked.kcalPerMin) : 0

  async function save() {
    if (saving || kcal <= 0) return
    setSaving(true)
    const now = Date.now()
    const h = await db()
    await h.run(
      `INSERT INTO exercise_entries (local_date, name, kcal, provenance, external_id, logged_at)
       VALUES (?,?,?,'manual',NULL,?)`,
      [localDate(now), `${picked.name} ${mins} min`, kcal, now],
    )
    router.back()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + space.lg }}>
      <View style={styles.head}>
        <Text style={[type.title, { color: theme.text }]}>Log exercise</Text>
        <Pressable onPress={() => router.back()} hitSlop={space.md}>
          <Text style={[type.body, { color: theme.textMuted }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}>
        <View style={styles.grid}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => setPicked(p)}
              style={[
                styles.preset,
                {
                  backgroundColor: theme.bgSunken,
                  borderColor: picked.name === p.name ? theme.text : 'transparent',
                  borderWidth: picked.name === p.name ? 2 : 0,
                },
              ]}
            >
              <Text style={{ fontSize: 26 }}>{p.glyph}</Text>
              <Text style={[type.label, { color: theme.text, marginTop: space.xs }]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[type.label, { color: theme.textMuted, marginTop: space.xl }]}>Minutes</Text>
        <TextInput
          keyboardType="number-pad"
          value={minutes}
          onChangeText={setMinutes}
          accessibilityLabel="Minutes"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgSunken }]}
        />

        <View style={[styles.estimate, { backgroundColor: theme.uncertainBg }]}>
          <Text style={[type.bodyStrong, { color: theme.text }]}>~{kcal} kcal</Text>
          <Text style={[type.caption, { color: theme.text, marginTop: space.xs, lineHeight: 18 }]}>
            A rough figure from duration alone. Exercise calorie estimates are wrong far more often
            than food ones, so this is deliberately not added to your daily target automatically —
            it is recorded, and you decide what to do with it.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.lg), backgroundColor: theme.bg }]}>
        <Pressable
          onPress={save}
          disabled={kcal <= 0 || saving}
          style={[styles.cta, { backgroundColor: kcal > 0 ? theme.text : theme.border }]}
        >
          <Text style={[type.bodyStrong, { color: theme.bg, fontSize: 18 }]}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg },
  preset: { width: '30%', aspectRatio: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  input: {
    marginTop: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, fontSize: 20, fontWeight: '700',
  },
  estimate: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg },
  cta: { height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
})
