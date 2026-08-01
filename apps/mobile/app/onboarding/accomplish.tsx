import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function AccomplishScreen() {
  return (
    <OptionScreen
      step="accomplish"
      field="accomplish"
      title="What would you like to accomplish?"
      // Consumer: todayEmphasisFor(). Decides what the Today screen leads with.
      subtitle="This decides what your Today screen puts first."
      options={[
        { value: 'healthier', label: 'Eat and live healthier', glyph: 'apple' },
        { value: 'energy', label: 'Boost my energy and mood', glyph: 'sun' },
        { value: 'motivated', label: 'Stay motivated and consistent', glyph: 'muscle' },
        { value: 'body_image', label: 'Feel better about my body', glyph: 'lotus' },
      ]}
      scroll
    />
  )
}
