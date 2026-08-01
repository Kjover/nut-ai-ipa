import { router } from 'expo-router'
import { TrendComparisonChart } from '../../src/components/onboarding/Charts'
import { OnboardingScreen } from '../../src/components/onboarding/Chrome'
import { nextRoute, stepIndex, TOTAL_STEPS } from '../../src/onboarding/flow'

export default function TrendScreen() {
  return (
    <OnboardingScreen
      step={stepIndex('trend')}
      total={TOTAL_STEPS}
      title="Designed to help you stay on track"
      onCta={() => router.push(nextRoute('trend') as never)}
      scroll
    >
      <TrendComparisonChart />
    </OnboardingScreen>
  )
}
