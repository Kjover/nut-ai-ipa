import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function SexScreen() {
  return (
    <OptionScreen
      step="sex"
      field="sex"
      title="Choose your sex"
      subtitle="This is used only for the BMR equation that sets your calorie target."
      options={[
        { value: 'male', label: 'Male', glyph: '♂' },
        { value: 'female', label: 'Female', glyph: '♀' },
        { value: 'unspecified', label: 'Other', glyph: '◇' },
      ]}
    />
  )
}
