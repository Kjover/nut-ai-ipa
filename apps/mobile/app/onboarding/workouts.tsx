import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function WorkoutsScreen() {
  return (
    <OptionScreen
      step="workouts"
      field="workoutsPerWeek"
      title="How many workouts do you do per week?"
      subtitle="This sets the activity multiplier on your calorie target."
      options={[
        { value: '0-2', label: '0-2', sublabel: 'Workouts now and then', glyph: 'dot1' },
        { value: '3-5', label: '3-5', sublabel: 'A few workouts per week', glyph: 'dot3' },
        { value: '6+', label: '6+', sublabel: 'Dedicated athlete', glyph: 'dot6' },
      ]}
    />
  )
}
