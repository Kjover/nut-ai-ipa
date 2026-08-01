import { OptionScreen } from '../../src/components/onboarding/OptionScreen'

export default function DietScreen() {
  return (
    <OptionScreen
      step="diet"
      field="dietStyle"
      title="Do you follow a specific diet?"
      // The most functional answer in the whole flow: it biases food resolution
      // and changes the assumption-filler defaults, so a vegan's scan stops
      // resolving to beef and "what kind of milk?" defaults to oat.
      subtitle="We use this to rank food matches and pick sensible defaults when a scan is unsure."
      options={[
        { value: 'balanced', label: 'Balanced', glyph: 'scaleBalance' },
        { value: 'whole_food', label: 'Whole-food focus', glyph: 'bowl' },
        { value: 'mediterranean', label: 'Mediterranean', glyph: 'leaf' },
        { value: 'flexitarian', label: 'Flexitarian', glyph: 'meat' },
        { value: 'pescatarian', label: 'Pescatarian', glyph: 'fish' },
        { value: 'vegetarian', label: 'Vegetarian', glyph: 'sprout' },
        { value: 'vegan', label: 'Vegan', glyph: 'sprout' },
      ]}
      scroll
    />
  )
}
