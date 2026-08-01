import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DbAdapter } from '@nutai/db-adapter'
import { resolveByText, type ScoredCandidate } from '@nutai/resolver'
import { nutritionCorpusInfo, openNutritionDb } from '../src/db/expo-adapter'
import { useTheme } from '../src/theme/ThemeProvider'
import { radius, space, type } from '../src/theme/tokens'

/**
 * Foods — the library that replaces the incumbent's `Groups` social feed.
 *
 * Right now it is also the honest way to test the whole resolution stack on
 * device WITHOUT an API key: type a food, and the query runs through the real
 * `@nutai/resolver` — FTS5 candidate generation, six-signal scoring, the two-part
 * auto-accept rule — against the real 7,928-row USDA corpus. Everything here is
 * local. No network request is made by this screen, ever.
 */
export default function FoodSearch() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [db, setDb] = useState<DbAdapter | null>(null)
  const [corpus, setCorpus] = useState<{ foods: number; portions: number; builtAt: string | null } | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScoredCandidate[]>([])
  const [outcome, setOutcome] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const handle = await openNutritionDb()
      const info = await nutritionCorpusInfo(handle)
      if (!alive) return
      setDb(handle)
      setCorpus(info)
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!db || query.trim().length < 2) { setResults([]); setOutcome(''); return }
    let alive = true
    setBusy(true)
    const timer = setTimeout(async () => {
      const r = await resolveByText(db, {
        canonicalFoodKey: query,
        observedBrand: null,
        prepFacet: null,
        modelCategory: null,
        estimatedGrams: 150,
      })
      if (!alive) return
      if (r.outcome.kind === 'auto_accept') {
        setResults([r.outcome.match])
        setOutcome(`auto-accepted (score ${r.outcome.match.score.toFixed(2)})`)
      } else if (r.outcome.kind === 'disambiguate') {
        setResults(r.outcome.candidates)
        setOutcome(`${r.outcome.candidates.length} candidates — tap the right one`)
      } else {
        setResults([])
        setOutcome('no match — this would log as an AI estimate')
      }
      setBusy(false)
    }, 180)
    return () => { alive = false; clearTimeout(timer) }
  }, [db, query])

  const corpusLine = useMemo(() => {
    if (!corpus) return 'Loading corpus…'
    if (corpus.foods === 0) {
      return 'Corpus missing — the app bundled without nutrition.db. Run `npm run data:build`.'
    }
    return `${corpus.foods.toLocaleString()} foods · ${corpus.portions.toLocaleString()} portion weights · USDA, CC0`
  }, [corpus])

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 160 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.title, { color: theme.text }]}>Food Database</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={space.md}>
          <Text style={[type.body, { color: theme.textMuted }]}>Done</Text>
        </Pressable>
      </View>
      <Text style={[type.caption, { color: corpus?.foods === 0 ? theme.safety : theme.textMuted, marginTop: space.xs }]}>
        {corpusLine}
      </Text>

      <TextInput
        accessibilityLabel="Search foods"
        placeholder="Search — try “chicken breast”"
        placeholderTextColor={theme.textFaint}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgSunken }]}
      />

      {busy && <ActivityIndicator style={{ marginTop: space.lg }} color={theme.textFaint} />}

      {outcome !== '' && (
        <Text style={[type.micro, { color: theme.textFaint, marginTop: space.md }]}>{outcome.toUpperCase()}</Text>
      )}

      {results.map((r) => (
        <View key={r.foodId} style={[styles.row, { borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: theme.text }]} numberOfLines={2}>{r.name}</Text>
            <Text style={[type.caption, { color: theme.textMuted, marginTop: 2 }]}>
              {r.energyKcal != null ? `${Math.round(r.energyKcal)} kcal / 100 g` : 'energy not reported'}
              {r.brand ? ` · ${r.brand}` : ''}
            </Text>
          </View>
          <Text style={[type.micro, { color: theme.textFaint }]}>{r.score.toFixed(2)}</Text>
        </View>
      ))}

      {query.trim().length >= 2 && !busy && results.length === 0 && (
        <Text style={[type.caption, { color: theme.textMuted, marginTop: space.lg }]}>
          Nothing matched. That is not a failure — it logs as an AI estimate with an amber badge,
          and you can save it as your own food so it resolves instantly next time.
        </Text>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  input: {
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
