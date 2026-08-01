import { describe, expect, it } from 'vitest'
import type { Item, VisionPayload } from '@nutai/core-schema'
import { SCHEMA_VERSION } from '@nutai/core-schema'
import { armsVerifierPass, caloriesFromMacros, clamp, CLAMP_BOUNDS } from './index.js'

function item(overrides: Partial<Item> = {}): Item {
  return {
    name: 'Grilled chicken breast',
    brand: null,
    canonical_food_key: 'chicken breast, grilled',
    food_form: 'flat',
    qualitative_size: 'medium',
    weight_basis: 'cooked',
    model_gram_estimate: 170,
    identification_confidence: 0.92,
    portion_confidence: 0.55,
    uncertainty_reason: 'none',
    visible_reference_objects: [],
    container: null,
    cooking_method_cues: ['grill_marks'],
    is_beverage: false,
    beverage_category: null,
    legible_label_text: null,
    stated_assumptions: [],
    clarifying_questions: [],
    // 4*53 + 4*0 + 9*6 = 266
    fallback_macros_at_estimate: {
      calories_kcal: 266,
      protein_g: 53,
      carbs_g: 0,
      fat_g: 6,
      fiber_g: 0,
      sodium_mg: 130,
    },
    ...overrides,
  }
}

function payload(items: Item[]): VisionPayload {
  return {
    schema_version: SCHEMA_VERSION,
    is_food: true,
    refusal_reason: null,
    items,
    meal_overall: {
      identification_confidence: 0.9,
      portion_confidence: 0.55,
      assumptions: [],
      clarifying_questions: [],
    },
  }
}

describe('clamp', () => {
  it('passes a coherent payload through with no flags', () => {
    const { payload: out, flags } = clamp(payload([item()]))
    expect(flags).toEqual([])
    expect(out.items[0]?.model_gram_estimate).toBe(170)
    expect(out.items[0]?.fallback_macros_at_estimate.calories_kcal).toBe(266)
  })

  it('never mutates its input', () => {
    const input = payload([item({ fallback_macros_at_estimate: {
      calories_kcal: 9999, protein_g: 53, carbs_g: 0, fat_g: 6, fiber_g: 0, sodium_mg: 130,
    } })])
    const snapshot = structuredClone(input)
    clamp(input)
    expect(input).toEqual(snapshot)
  })

  describe('the 27-million-calorie case', () => {
    // The documented headline failure of the app we are replacing. It must not be
    // possible for this to reach a user, and it must be caught by arithmetic
    // rather than by a second model call.
    const absurd = item({
      name: 'Caesar salad',
      model_gram_estimate: 300,
      fallback_macros_at_estimate: {
        calories_kcal: 27_000_000,
        protein_g: 10,
        carbs_g: 15,
        fat_g: 28,
        fiber_g: 3,
        sodium_mg: 600,
      },
    })

    it('replaces the absurd calorie figure with Atwater arithmetic', () => {
      const { payload: out, flags } = clamp(payload([absurd]))
      // 4*10 + 4*15 + 9*28 = 352
      expect(out.items[0]?.fallback_macros_at_estimate.calories_kcal).toBe(352)
      expect(flags).toContainEqual(
        expect.objectContaining({ kind: 'macro_arithmetic_mismatch', original: 27_000_000 }),
      )
    })

    it('leaves no absurd value anywhere in the output', () => {
      const { payload: out } = clamp(payload([absurd]))
      expect(JSON.stringify(out)).not.toContain('27000000')
    })
  })

  describe('gram bounds', () => {
    it('demotes an out-of-bounds estimate to null rather than deleting the item', () => {
      const { payload: out, flags } = clamp(payload([item({ model_gram_estimate: 45_000 })]))
      expect(out.items).toHaveLength(1)
      expect(out.items[0]?.model_gram_estimate).toBeNull()
      expect(out.items[0]?.name).toBe('Grilled chicken breast')
      expect(flags).toContainEqual(
        expect.objectContaining({ kind: 'grams_out_of_bounds', original: 45_000 }),
      )
    })

    it('accepts a value exactly at each boundary', () => {
      const [lo, hi] = CLAMP_BOUNDS.ITEM_GRAMS
      for (const g of [lo, hi]) {
        const { flags } = clamp(payload([item({ model_gram_estimate: g })]))
        expect(flags.filter((f) => f.kind === 'grams_out_of_bounds')).toEqual([])
      }
    })
  })

  describe('macro arithmetic', () => {
    it('tolerates disagreement within the documented tolerance', () => {
      // Atwater says 266; 290 is ~9% off, inside the 15% tolerance.
      const { payload: out, flags } = clamp(
        payload([item({ fallback_macros_at_estimate: {
          calories_kcal: 290, protein_g: 53, carbs_g: 0, fat_g: 6, fiber_g: 0, sodium_mg: 130,
        } })]),
      )
      expect(flags.filter((f) => f.kind === 'macro_arithmetic_mismatch')).toEqual([])
      expect(out.items[0]?.fallback_macros_at_estimate.calories_kcal).toBe(290)
    })

    it('corrects disagreement beyond the tolerance', () => {
      // 400 vs 266 is ~50% off.
      const { payload: out, flags } = clamp(
        payload([item({ fallback_macros_at_estimate: {
          calories_kcal: 400, protein_g: 53, carbs_g: 0, fat_g: 6, fiber_g: 0, sodium_mg: 130,
        } })]),
      )
      expect(out.items[0]?.fallback_macros_at_estimate.calories_kcal).toBe(266)
      expect(flags).toContainEqual(
        expect.objectContaining({ kind: 'macro_arithmetic_mismatch', original: 400, derived: 266 }),
      )
    })

    it('leaves a zero-calorie item alone rather than dividing by zero', () => {
      const { flags } = clamp(
        payload([item({ model_gram_estimate: 250, fallback_macros_at_estimate: {
          calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 5,
        } })]),
      )
      expect(flags.filter((f) => f.kind === 'macro_arithmetic_mismatch')).toEqual([])
      expect(flags.every((f) => Number.isFinite(f.derived ?? 0))).toBe(true)
    })
  })

  describe('energy density', () => {
    it('flags a physically impossible density', () => {
      // 800 kcal in 10 g = 8000 kcal/100 g. Pure fat is ~884.
      const { flags } = clamp(
        payload([item({ model_gram_estimate: 10, fallback_macros_at_estimate: {
          calories_kcal: 800, protein_g: 0, carbs_g: 0, fat_g: 88.9, fiber_g: 0, sodium_mg: 0,
        } })]),
      )
      expect(flags).toContainEqual(expect.objectContaining({ kind: 'impossible_energy_density' }))
    })

    it('accepts real pure animal fats at USDA’s actual 902 kcal/100g', () => {
      // Found by the golden-query gate against the real corpus: `Fat, beef
      // tallow`, `Lard` and every fish oil in SR Legacy are listed at exactly
      // 902, because USDA applies a food-specific 9.02 kcal/g factor to fat
      // rather than the rounded 9. A 900 ceiling told users their lard was
      // physically impossible.
      const { flags } = clamp(
        payload([item({ name: 'Lard', model_gram_estimate: 100, fallback_macros_at_estimate: {
          calories_kcal: 902, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0, sodium_mg: 0,
        } })]),
      )
      expect(flags.filter((f) => f.kind === 'impossible_energy_density')).toEqual([])
    })

    it('still catches kJ reported as kcal, which is the failure it exists for', () => {
      // 100 g of chicken at 4.2x its real value — the classic unit confusion.
      const { flags } = clamp(
        payload([item({ model_gram_estimate: 100, fallback_macros_at_estimate: {
          calories_kcal: 4200, protein_g: 250, carbs_g: 0, fat_g: 200, fiber_g: 0, sodium_mg: 0,
        } })]),
      )
      expect(flags.some((f) => f.kind === 'impossible_energy_density')).toBe(true)
    })

    it('does not flag olive oil, which is legitimately near the ceiling', () => {
      // 14 g olive oil, 124 kcal -> ~884 kcal/100 g. Real food, must pass.
      const { flags } = clamp(
        payload([item({ name: 'Olive oil', model_gram_estimate: 14, fallback_macros_at_estimate: {
          calories_kcal: 126, protein_g: 0, carbs_g: 0, fat_g: 14, fiber_g: 0, sodium_mg: 0,
        } })]),
      )
      expect(flags.filter((f) => f.kind === 'impossible_energy_density')).toEqual([])
    })

    it('does not divide by zero when grams were demoted to null', () => {
      const { flags } = clamp(payload([item({ model_gram_estimate: 99_999 })]))
      expect(flags.some((f) => f.kind === 'grams_out_of_bounds')).toBe(true)
      expect(flags.some((f) => f.kind === 'impossible_energy_density')).toBe(false)
    })
  })

  describe('meal ceiling', () => {
    it('flags a globally absurd meal even when every item passes alone', () => {
      // 4 items x 1500 kcal each = 6000, over the 5000 meal ceiling, yet no single
      // item breaches the 3000 item ceiling.
      const heavy = item({ model_gram_estimate: 400, fallback_macros_at_estimate: {
        calories_kcal: 1500, protein_g: 75, carbs_g: 75, fat_g: 100, fiber_g: 0, sodium_mg: 0,
      } })
      const { flags } = clamp(payload([heavy, heavy, heavy, heavy]))
      expect(flags.filter((f) => f.kind === 'item_kcal_out_of_bounds')).toEqual([])
      expect(flags).toContainEqual(
        expect.objectContaining({ kind: 'meal_kcal_out_of_bounds', original: 6000 }),
      )
    })
  })

  describe('armsVerifierPass', () => {
    it('arms on incoherence, not on mere imprecision', () => {
      expect(armsVerifierPass([{ item: 'x', kind: 'impossible_energy_density' }])).toBe(true)
      expect(armsVerifierPass([{ item: null, kind: 'meal_kcal_out_of_bounds' }])).toBe(true)
      expect(armsVerifierPass([{ item: 'x', kind: 'macro_arithmetic_mismatch' }])).toBe(false)
      expect(armsVerifierPass([])).toBe(false)
    })
  })
})

describe('caloriesFromMacros', () => {
  it('applies Atwater 4/4/9', () => {
    expect(caloriesFromMacros({ protein_g: 10, carbs_g: 20, fat_g: 5 })).toBe(165)
  })
})
