import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function BlockerScreen() {
  return (
    <OptionScreen
      step="blocker"
      field="blocker"
      title="What's stopping you from reaching your goals?"
      // Consumer: featureDefaultsFor(). This answer decides which retention
      // surfaces are ON by default, so it changes the app you get rather than
      // just being collected.
      subtitle="We'll turn on the parts of the app that help with this, and leave the rest off."
      options={[
        { value: 'consistency', label: 'Lack of consistency', glyph: 'bars' },
        { value: 'eating_habits', label: 'Unhealthy eating habits', glyph: 'burger' },
        { value: 'support', label: 'Lack of support', glyph: 'handshake' },
        { value: 'busy', label: 'Busy schedule', glyph: 'calendar' },
        { value: 'meal_inspiration', label: 'Lack of meal inspiration', glyph: 'apple' },
      ]}
      scroll
    />
  )
}
