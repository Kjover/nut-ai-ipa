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
        { value: 'healthier', label: 'Eat and live healthier', glyph: '🍏' },
        { value: 'energy', label: 'Boost my energy and mood', glyph: '☀️' },
        { value: 'motivated', label: 'Stay motivated and consistent', glyph: '💪' },
        { value: 'body_image', label: 'Feel better about my body', glyph: '🧘' },
      ]}
      scroll
    />
  )
}
