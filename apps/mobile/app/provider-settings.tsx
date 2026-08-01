import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PROVIDER_MODELS, providersByPrice, type ProviderId } from '@nutai/prompt'
import { CredentialForm, PROVIDER_NAME } from '../src/components/CredentialForm'
import { Icon } from '../src/components/Icon'
import { putSetting, setting } from '../src/data/repo'
import { clearCredential, loadCredential, maskCredential } from '../src/inference/credentials'
import { useTheme } from '../src/theme/ThemeProvider'
import { MIN_TAP_TARGET, radius, space, type } from '../src/theme/tokens'

/**
 * Provider settings — everything the onboarding key screen can do, available
 * forever. Change provider, change model, re-verify a key, clear it. Nothing
 * decided during onboarding is a life sentence.
 */
export default function ProviderSettings() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [provider, setProvider] = useState<ProviderId>('anthropic')
  const [modelId, setModelId] = useState<string>('')
  const [masked, setMasked] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(() => {
    void (async () => {
      const p = (await setting('provider')) as ProviderId | 'none' | ''
      const active = p && p !== 'none' ? p : 'anthropic'
      setProvider(active)
      setModelId(await setting('provider_model'))
      const cred = await loadCredential(active)
      setMasked(cred ? maskCredential(cred.value) : null)
      setShowForm(!cred)
    })()
  }, [])
  useFocusEffect(refresh)

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + space.sm }]}>
        <Text style={[type.title, { color: theme.text }]}>AI provider</Text>
        <Pressable onPress={() => router.back()} hitSlop={space.md}>
          <Icon name="close" size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}>
        <View style={styles.chipRow}>
          {providersByPrice().map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                setProvider(p)
                setShowForm(true)
                void (async () => {
                  const cred = await loadCredential(p)
                  setMasked(cred ? maskCredential(cred.value) : null)
                  setShowForm(!cred)
                  if (cred) {
                    await putSetting('provider', p)
                    const m = PROVIDER_MODELS[p][0]!.id
                    setModelId(m)
                    await putSetting('provider_model', m)
                  }
                })()
              }}
              style={[
                styles.chip,
                provider === p
                  ? { backgroundColor: theme.text }
                  : { borderWidth: 1.5, borderColor: theme.border },
              ]}
            >
              <Text style={[type.label, { color: provider === p ? theme.bg : theme.text }]}>
                {PROVIDER_NAME[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {masked ? (
          <View style={[styles.card, { backgroundColor: theme.bgSunken }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="check" size={16} color={theme.affirm} weight={2.4} />
              <Text style={[type.bodyStrong, { color: theme.text }]}>Key saved</Text>
              <Text style={[type.body, { color: theme.textMuted }]}>{masked}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
              <Pressable onPress={() => setShowForm(true)} hitSlop={space.sm}>
                <Text style={[type.label, { color: theme.protein }]}>Replace key</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Remove this key?',
                    `Photo scans stop working until you add a ${PROVIDER_NAME[provider]} key again. Your logged data is not touched.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            await clearCredential(provider)
                            await putSetting('provider', 'none')
                            refresh()
                          })()
                        },
                      },
                    ],
                  )
                }
                hitSlop={space.sm}
              >
                <Text style={[type.label, { color: theme.safety }]}>Remove key</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showForm ? (
          <View style={{ marginTop: space.lg }}>
            <CredentialForm
              provider={provider}
              onSaved={(m) => {
                setModelId(m)
                refresh()
              }}
            />
          </View>
        ) : null}

        {masked ? (
          <>
            <Text style={[type.label, { color: theme.textMuted, marginTop: space.xl }]}>Model</Text>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {PROVIDER_MODELS[provider].map((m) => {
                const active = m.id === modelId
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      setModelId(m.id)
                      void putSetting('provider_model', m.id)
                    }}
                    style={[styles.modelRow, { borderColor: active ? theme.text : theme.border, borderWidth: active ? 2 : StyleSheet.hairlineWidth }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { color: theme.text }]}>{m.label}</Text>
                      <Text style={[type.caption, { color: theme.textMuted, marginTop: 2 }]}>
                        ~${m.approxScanCostUsd.toFixed(4)} per scan
                      </Text>
                    </View>
                    {active ? <Icon name="check" size={18} color={theme.text} weight={2.4} /> : null}
                  </Pressable>
                )
              })}
            </View>
            <Text style={[type.caption, { color: theme.textFaint, marginTop: space.md, lineHeight: 18 }]}>
              The cheapest vision model is the honest default: frontier models are not measurably
              better at portion size, which is where nearly all the error lives.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
  },
  card: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
  },
})
