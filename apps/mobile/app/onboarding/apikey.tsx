import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { cheapestModel, type ProviderId } from '@nutai/prompt'
import { OnboardingScreen } from '../../src/components/onboarding/Chrome'
import { Icon } from '../../src/components/Icon'
import { validateKey } from '../../src/inference/pathA/client'
import { looksPlausible, saveCredential, type CredentialKind } from '../../src/inference/credentials'
import { nextRoute, stepIndex, TOTAL_STEPS } from '../../src/onboarding/flow'
import { setAnswer, useAnswers } from '../../src/onboarding/store'
import { useTheme } from '../../src/theme/ThemeProvider'
import { radius, space, type } from '../../src/theme/tokens'

/**
 * Key entry, with validation.
 *
 * TWO CREDENTIAL SHAPES FOR ANTHROPIC, and they are NOT interchangeable:
 *
 *   A normal API key from the console goes in the `x-api-key` header.
 *   A `claude setup-token` credential is an OAuth token and goes in
 *   `Authorization: Bearer`.
 *
 * Sending one in the other's header fails with an unhelpful 401 that looks like
 * a bad key, so the shape is stored alongside the value rather than guessed at
 * request time.
 *
 * THE VALIDATION PROBE is a minimal non-billing request that confirms three
 * things at once: the credential authenticates, the account can reach the
 * endpoint, and the chosen model exists for that account. It returns one of six
 * named states, never a generic "something went wrong" — because "your key is
 * wrong", "you are out of credit" and "that model is not on your plan" call for
 * three completely different actions.
 */

const CONSOLE_URL: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
}

const PROVIDER_NAME: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
}

export default function ApiKeyScreen() {
  const theme = useTheme()
  const a = useAnswers()
  const provider = (a.provider && a.provider !== 'none' ? a.provider : 'anthropic') as ProviderId

  const [kind, setKind] = useState<CredentialKind>('api_key')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const model = cheapestModel(provider)
  const plausible = looksPlausible(provider, kind, value)

  async function verify() {
    if (busy || !plausible) return
    setBusy(true)
    setError(null)

    const res = await validateKey(provider, model.id, { kind, value: value.trim() })
    setBusy(false)

    if (!res.ok) {
      setError(explain(res.error.kind, res.error.message))
      return
    }

    await saveCredential(provider, { kind, value: value.trim() })
    setAnswer('providerModel', model.id)
    setOk(true)
  }

  return (
    <OnboardingScreen
      step={stepIndex('apikey')}
      total={TOTAL_STEPS}
      title={`Connect ${PROVIDER_NAME[provider]}`}
      subtitle={`We'll check the key works before saving it. It is stored in the iOS Keychain and sent only to ${PROVIDER_NAME[provider]}.`}
      cta={ok ? 'Continue' : busy ? 'Checking…' : 'Verify and save'}
      onCta={ok ? () => router.push(nextRoute('apikey') as never) : verify}
      ctaDisabled={busy || (!ok && !plausible)}
      secondaryLabel={ok ? undefined : 'Skip for now'}
      onSecondary={() => {
        setAnswer('provider', 'none')
        router.push(nextRoute('apikey') as never)
      }}
      scroll
    >
      {/* Anthropic accepts either shape, so the choice is explicit. */}
      {provider === 'anthropic' ? (
        <View style={[styles.tabs, { backgroundColor: theme.bgSunken }]}>
          {(['api_key', 'oauth'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setKind(k)
                setError(null)
              }}
              style={[styles.tab, kind === k && { backgroundColor: theme.bgElevated }]}
            >
              <Text style={[type.label, { color: kind === k ? theme.text : theme.textMuted }]}>
                {k === 'api_key' ? 'API key' : 'Claude CLI token'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* How to get the credential — different per shape. */}
      <View style={[styles.how, { backgroundColor: theme.bgSunken }]}>
        {provider === 'anthropic' && kind === 'oauth' ? (
          <>
            <Text style={[type.bodyStrong, { color: theme.text }]}>Sign in through the Claude CLI</Text>
            <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs, lineHeight: 19 }]}>
              On a computer with Claude Code installed, run this and paste what it prints:
            </Text>
            <Pressable
              onPress={() => void Clipboard.setStringAsync('claude setup-token')}
              style={[styles.code, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            >
              <Text style={[styles.mono, { color: theme.text }]}>claude setup-token</Text>
              <Icon name="bookmark" size={16} color={theme.textFaint} />
            </Pressable>
            <Text style={[type.caption, { color: theme.textFaint, marginTop: space.sm, lineHeight: 18 }]}>
              This uses your existing Claude subscription instead of API credit. Note it may
              authenticate but still lack scope for the messages endpoint — the check below will
              tell you either way rather than failing later mid-scan.
            </Text>
          </>
        ) : (
          <>
            <Text style={[type.bodyStrong, { color: theme.text }]}>
              Get a key from {PROVIDER_NAME[provider]}
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(CONSOLE_URL[provider])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}
            >
              <Text style={[type.label, { color: theme.protein }]}>Open the console</Text>
              <Icon name="chevron" size={14} color={theme.protein} />
            </Pressable>
            <Text style={[type.caption, { color: theme.textFaint, marginTop: space.sm, lineHeight: 18 }]}>
              Billing is between you and {PROVIDER_NAME[provider]}. We never see the key, and there
              is no account here to attach it to.
            </Text>
          </>
        )}
      </View>

      <TextInput
        accessibilityLabel="API credential"
        placeholder={kind === 'oauth' ? 'Paste the token' : 'sk-…'}
        placeholderTextColor={theme.textFaint}
        value={value}
        onChangeText={(t) => {
          setValue(t)
          setError(null)
          setOk(false)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!ok}
        editable={!busy}
        style={[styles.input, { color: theme.text, backgroundColor: theme.bgSunken, borderColor: error ? theme.safety : theme.border }]}
      />

      {busy ? (
        <View style={{ marginTop: space.lg, alignItems: 'center' }}>
          <ActivityIndicator color={theme.textFaint} />
        </View>
      ) : null}

      {error ? (
        <View style={[styles.result, { backgroundColor: theme.safetyBg }]}>
          <Text style={[type.caption, { color: theme.safety, lineHeight: 19 }]}>{error}</Text>
        </View>
      ) : null}

      {ok ? (
        <View style={[styles.result, { backgroundColor: theme.uncertainBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="check" size={18} color={theme.affirm} weight={2.4} />
            <Text style={[type.bodyStrong, { color: theme.text }]}>Key works</Text>
          </View>
          <Text style={[type.caption, { color: theme.textMuted, marginTop: space.xs, lineHeight: 19 }]}>
            Using {model.label} at roughly ${model.approxScanCostUsd.toFixed(4)} per scan. You can
            change the model and set a monthly cap in Profile.
          </Text>
        </View>
      ) : null}

      <Text style={[type.caption, { color: theme.textFaint, marginTop: space.lg, lineHeight: 19 }]}>
        Stored in the Keychain, one entry per provider, written only from what you type here — never
        from a config file or anything baked into the app. Read at exactly one place: the request
        that scans your photo.
      </Text>
    </OnboardingScreen>
  )
}

/** Six named states. "Something went wrong" tells nobody what to do next. */
function explain(kind: string, fallback: string): string {
  switch (kind) {
    case 'key-invalid':
      return 'That credential was rejected. Check you copied the whole thing, and that the tab above matches its type — an API key and a CLI token use different headers.'
    case 'quota-exhausted':
      return 'The credential works, but the account is out of credit. Add billing with your provider and try again.'
    case 'model-unavailable':
      return 'The credential works, but that model is not enabled for this account. Some models need billing history before they unlock.'
    case 'offline':
      return 'No connection to the provider. Nothing was saved — try again when you are back online.'
    case 'timeout-ambiguous':
      return 'The check timed out. Nothing was saved.'
    default:
      return fallback
  }
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, marginBottom: space.lg },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.pill },
  how: { padding: space.lg, borderRadius: radius.lg },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mono: { fontFamily: 'Menlo', fontSize: 15 },
  input: {
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 54,
  },
  result: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg },
})
