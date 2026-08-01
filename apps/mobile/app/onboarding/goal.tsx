import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function GoalScreen() {
  return (
    <OptionScreen
      step="goal"
      field="goal"
      title="What is your goal?"
      subtitle="This helps us generate a plan for your calorie intake."
      options={[
        { value: 'lose', label: 'Lose weight', glyph: '↓' },
        { value: 'maintain', label: 'Maintain', glyph: '–' },
        { value: 'gain', label: 'Gain weight', glyph: '↑' },
      ]}
    />
  )
}
