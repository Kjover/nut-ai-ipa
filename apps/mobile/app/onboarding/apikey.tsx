import { router } from 'expo-router'
import { useState } from 'react'
import { type ProviderId } from '@nutai/prompt'
import { OnboardingScreen } from '../../src/components/onboarding/Chrome'
import { CredentialForm, PROVIDER_NAME } from '../../src/components/CredentialForm'
import { putSetting } from '../../src/data/repo'
import { nextRoute, stepIndex, TOTAL_STEPS } from '../../src/onboarding/flow'
import { setAnswer, useAnswers } from '../../src/onboarding/store'

/**
 * Key entry during onboarding — a thin shell around the shared CredentialForm,
 * which owns the two Anthropic credential shapes, the six named failure
 * states, and the persistence of provider/provider_model. The SAME component
 * runs in Settings, so "works in onboarding, broken in settings" cannot
 * happen by drift.
 */
export default function ApiKeyScreen() {
  const a = useAnswers()
  const provider = (a.provider && a.provider !== 'none' ? a.provider : 'anthropic') as ProviderId
  const [saved, setSaved] = useState(false)

  return (
    <OnboardingScreen
      step={stepIndex('apikey')}
      total={TOTAL_STEPS}
      title={`Connect ${PROVIDER_NAME[provider]}`}
      subtitle={`We'll check the key works before saving it. It is stored in the iOS Keychain and sent only to ${PROVIDER_NAME[provider]}.`}
      cta="Continue"
      onCta={() => router.push(nextRoute('apikey') as never)}
      ctaDisabled={!saved}
      secondaryLabel={saved ? undefined : 'Skip for now'}
      onSecondary={() => {
        setAnswer('provider', 'none')
        void putSetting('provider', 'none')
        router.push(nextRoute('apikey') as never)
      }}
      scroll
    >
      <CredentialForm
        provider={provider}
        onSaved={(modelId) => {
          setAnswer('providerModel', modelId)
          setSaved(true)
        }}
      />
    </OnboardingScreen>
  )
}
