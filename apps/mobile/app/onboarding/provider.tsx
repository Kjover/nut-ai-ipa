import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { cheapestModel, PROVIDER_MODELS, providersByPrice, type ProviderId } from '@nutai/prompt'
import { OnboardingScreen } from '../../src/components/onboarding/Chrome'
import { OptionCard } from '../../src/components/onboarding/Controls'
import type { IconName } from '../../src/components/Icon'
import { nextRoute, stepIndex, TOTAL_STEPS } from '../../src/onboarding/flow'
import { setAnswer, useAnswers } from '../../src/onboarding/store'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

/**
 * How should Nut AI recognize your food?
 *
 * THE PICKER IS NEUTRAL. Price-sorted, no "recommended" badge, no pre-selected
 * provider. Within a chosen provider the cheapest vision model is pre-selected,
 * which is honest rather than a compromise: the literature says frontier models
 * are NOT better at portion estimation, and portion is the dominant error source.
 * Paying 5-30x buys identification quality we already have.
 *
 * Neutrality is also the cheapest available mitigation against being treated as a
 * joint controller of the data the user sends to a provider we recommended.
 */

const LABELS: Record<ProviderId, { name: string; icon: IconName; note: string }> = {
  openai: { name: 'OpenAI', icon: 'scan', note: 'GPT-4o and 4o-mini' },
  google: { name: 'Google', icon: 'scan', note: 'Gemini — paid tier only' },
  anthropic: { name: 'Anthropic', icon: 'scan', note: 'Claude Haiku and Sonnet' },
}

export default function ProviderScreen() {
  const theme = useTheme()
  const a = useAnswers()
  const order = providersByPrice()

  return (
    <OnboardingScreen
      step={stepIndex('provider')}
      total={TOTAL_STEPS}
      title="How should Nut AI recognize your food?"
      subtitle="Bring your own API key. Your photo goes to the provider you name and nowhere else — we run no server."
      ctaDisabled={a.provider === undefined}
      onCta={() =>
        router.push((a.provider === 'none' ? '/onboarding/health' : nextRoute('provider')) as never)
      }
      scroll
    >
      <ScrollView scrollEnabled={false}>
        {order.map((p) => {
          const cheap = cheapestModel(p)
          return (
            <OptionCard
              key={p}
              label={LABELS[p].name}
              sublabel={`${LABELS[p].note} · ~$${cheap.approxScanCostUsd.toFixed(4)}/scan`}
              glyph={LABELS[p].icon}
              selected={a.provider === p}
              onPress={() => setAnswer('provider', p)}
            />
          )
        })}

        <OptionCard
          label="No key for now"
          sublabel="Barcode, label scan, text search and manual entry all still work"
          glyph="minus"
          selected={a.provider === 'none'}
          onPress={() => setAnswer('provider', 'none')}
        />
      </ScrollView>

      <View style={[styles.note, { backgroundColor: theme.bgSunken }]}>
        <Text style={[type.caption, { color: theme.textMuted, lineHeight: 19 }]}>
          Sorted by price, with no recommendation. Frontier models are not measurably better at
          judging portion size — which is where nearly all the error is — so the cheapest vision
          model is pre-selected on purpose, not as a compromise.
        </Text>
      </View>

      {a.provider === 'google' ? (
        <View style={[styles.warn, { backgroundColor: theme.uncertainBg }]}>
          <Text style={[type.caption, { color: theme.text, lineHeight: 19 }]}>
            Gemini's free tier is blocked for photo scans. Google's own API terms say "do not submit
            sensitive, confidential, or personal information to the Unpaid Services", and a meal
            photo is health data. A paid Google key works normally.
          </Text>
        </View>
      ) : null}

      {a.provider && a.provider !== 'none' ? (
        <Text style={[type.caption, { color: theme.textFaint, marginTop: space.lg, lineHeight: 19 }]}>
          {PROVIDER_MODELS[a.provider].length} models available. You can change model and set a
          monthly spend cap after entering your key.
        </Text>
      ) : null}
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  note: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg },
  warn: { marginTop: space.md, padding: space.lg, borderRadius: radius.lg },
})
