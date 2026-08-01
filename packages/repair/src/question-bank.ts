import type { Item, UncertaintyReason } from '@nutai/core-schema'

/**
 * The ranked question bank.
 *
 * SPEC-accuracy-engine.md §8.4. Ordered by (a) swing magnitude, (b) how invisible
 * the ambiguity is in a photo, and (c) how cheaply and CERTAINLY asking resolves
 * it.
 *
 * Ranks 1-2 top the list because they are multiplicative AND fully resolvable with
 * certainty — they are factual questions, not perceptual ones. Rank 3 is third
 * because hidden oil is the single most over-determined complaint in the entire
 * research corpus: five independent sources converging near-verbatim.
 *
 * THE BANK-WIDE RULE: every silent default is disclosed inline on the result card,
 * never hidden. That satisfies "ask when unsure" and "minimize the cost of poor
 * guesses" simultaneously, by making every guess auditable and one-tap correctable
 * even when we chose not to interrupt for it.
 *
 * Swing magnitudes are standard USDA-consistent nutrition science (fat 9 kcal/g,
 * carb 4, protein 4, alcohol 7). The exact per-100 g values used to APPLY an answer
 * must come from the actual bundled FDC rows at runtime, never from the
 * illustrative figures here.
 */

export interface QuestionOption {
  label: string
  /** Opaque value handed back to the applier. */
  value: string
}

export interface BankQuestion {
  rank: number
  id: string
  text: string
  /** Midpoint expected calorie swing when the assumption is wrong. */
  expectedSwingKcal: number
  /** True for ranks 1-2, whose swing is multiplicative rather than additive. */
  multiplicative: boolean
  options: QuestionOption[]
  /** Applied silently when the question does not clear the threshold. */
  silentDefault: string
  /** Shown inline on the card. ALWAYS rendered, never hidden. */
  defaultDisclosure: string
  /** Uncertainty reasons that make this question applicable. */
  reasons: UncertaintyReason[]
}

export const QUESTION_BANK: readonly BankQuestion[] = [
  {
    rank: 1,
    id: 'portion_eaten',
    text: 'Did you eat all of this, or some of it?',
    expectedSwingKcal: 300,
    multiplicative: true,
    options: [
      { label: 'All of it', value: '1.0' },
      { label: 'About half', value: '0.5' },
      { label: 'A little', value: '0.25' },
    ],
    silentDefault: '1.0',
    defaultDisclosure: 'Assuming you ate all of it',
    reasons: ['none'],
  },
  {
    rank: 2,
    id: 'servings_consumed',
    text: 'This looks like a multi-serving package — how much did you have?',
    expectedSwingKcal: 400,
    multiplicative: true,
    options: [
      { label: 'Whole package', value: 'all' },
      { label: '1 serving', value: '1' },
    ],
    // Never silently default to one serving without saying so — a 20 oz soda is
    // 2.5 servings, and quietly logging one is a 150% undercount.
    silentDefault: '1',
    defaultDisclosure: 'Assuming 1 serving — tap to change',
    reasons: ['serving_count_ambiguous'],
  },
  {
    rank: 3,
    id: 'cooking_oil',
    text: 'Was this cooked with oil or butter?',
    // ~120 kcal per tbsp of any cooking oil; home stir-fries commonly use 1-4.
    expectedSwingKcal: 240,
    multiplicative: false,
    options: [
      { label: 'None visible', value: 'none' },
      { label: 'A little (~1 tsp–1 tbsp)', value: 'little' },
      { label: 'A lot (2+ tbsp)', value: 'lots' },
    ],
    silentDefault: 'little',
    defaultDisclosure: 'Assumed ~1 tbsp oil — typical for this dish',
    reasons: ['oil_or_fat_not_visually_determinable'],
  },
  {
    rank: 4,
    id: 'sauce_type',
    text: 'What kind of dressing or sauce, and how much?',
    expectedSwingKcal: 200,
    multiplicative: false,
    options: [
      { label: 'Light', value: 'light' },
      { label: 'Medium', value: 'medium' },
      { label: 'Heavy', value: 'heavy' },
    ],
    silentDefault: 'medium',
    defaultDisclosure: 'Assumed a medium amount of the most common sauce',
    reasons: ['sauce_type_ambiguous'],
  },
  {
    rank: 5,
    id: 'milk_type',
    text: 'What kind of milk?',
    // whole ~149 / skim ~83 / oat ~120 / unsweetened almond ~30-40 per cup.
    expectedSwingKcal: 110,
    multiplicative: false,
    options: [
      { label: 'Whole', value: 'whole' },
      { label: '2%', value: '2pct' },
      { label: 'Skim', value: 'skim' },
      { label: 'Oat', value: 'oat' },
      { label: 'Almond', value: 'almond' },
      { label: 'Soy', value: 'soy' },
    ],
    silentDefault: 'whole',
    defaultDisclosure: 'Assumed whole milk',
    reasons: ['milk_type_ambiguous'],
  },
  {
    rank: 6,
    id: 'regular_or_diet',
    text: 'Regular or diet?',
    // Regular 12 oz ~140-150 vs diet ~0-5. The visual is identical.
    expectedSwingKcal: 145,
    multiplicative: false,
    options: [
      { label: 'Regular', value: 'regular' },
      { label: 'Diet / zero', value: 'diet' },
    ],
    // Deliberately the HIGHER-risk direction: silently assuming zero-calorie
    // undercounts, and undercounting is the failure users cannot detect.
    silentDefault: 'regular',
    defaultDisclosure: 'Assumed regular, not diet',
    reasons: ['identity_ambiguous'],
  },
  {
    rank: 7,
    id: 'meat_fat_pct',
    text: 'Lean or regular, and what cut?',
    // 85/15 ground beef 4 oz cooked ~287 vs 93/7 ~193.
    expectedSwingKcal: 95,
    multiplicative: false,
    options: [
      { label: '80/20', value: '80_20' },
      { label: '85/15', value: '85_15' },
      { label: '90/10', value: '90_10' },
      { label: '93/7', value: '93_7' },
    ],
    silentDefault: '85_15',
    defaultDisclosure: 'Assumed 85/15, the most commonly sold',
    reasons: ['meat_fat_percent_ambiguous'],
  },
  {
    rank: 8,
    id: 'raw_or_cooked',
    text: 'Is that weight before or after cooking?',
    // Chicken breast ~120 kcal/100g raw vs ~165 cooked. Same chicken, water loss.
    expectedSwingKcal: 80,
    multiplicative: false,
    options: [
      { label: 'Raw weight', value: 'raw' },
      { label: 'Cooked weight', value: 'cooked' },
    ],
    silentDefault: 'cooked',
    defaultDisclosure: 'Assumed cooked weight',
    reasons: ['cooked_vs_raw_ambiguous'],
  },
  {
    rank: 9,
    id: 'gram_disagreement',
    text: 'Does this look more like {low} g or {high} g?',
    expectedSwingKcal: 250,
    multiplicative: false,
    options: [],
    silentDefault: 'higher_weighted',
    defaultDisclosure: 'Used the more reliable of two estimates',
    reasons: ['portion_depth_not_visible', 'container_size_no_reference'],
  },
  {
    rank: 10,
    id: 'alcohol_abv',
    text: 'What is this, and roughly what ABV — or what brand and size?',
    // A 12 oz "beer" spans 4.2%-10% ABV: ~2.4x the alcohol.
    expectedSwingKcal: 200,
    multiplicative: false,
    options: [
      { label: 'Light beer', value: 'light_beer' },
      { label: 'Regular beer', value: 'regular_beer' },
      { label: 'Craft (~7–10%)', value: 'craft_beer' },
      { label: 'Wine', value: 'wine' },
      { label: 'Cocktail', value: 'cocktail' },
      { label: 'Spirit, neat', value: 'spirit' },
    ],
    silentDefault: 'regular_beer',
    defaultDisclosure: 'Assumed 5% ABV at a standard pour — could easily be double',
    reasons: ['abv_unknown'],
  },
  {
    rank: 11,
    id: 'shake_recipe',
    text: 'What’s blended in — milk, water, or an alternative, and any add-ins?',
    expectedSwingKcal: 300,
    multiplicative: false,
    options: [
      { label: 'Water', value: 'water' },
      { label: 'Milk', value: 'milk' },
      { label: 'Milk alternative', value: 'alt_milk' },
    ],
    // The LOWER estimate deliberately: over-assuming add-ins is more annoying to
    // correct than under-assuming, and the exact builder is one tap away.
    silentDefault: 'water',
    defaultDisclosure: 'Assumed a water base with no add-ins',
    reasons: ['shake_recipe_unknown'],
  },
]

export function questionByReason(reason: UncertaintyReason): BankQuestion | null {
  return QUESTION_BANK.find((q) => q.reasons.includes(reason)) ?? null
}

/** Categories whose oil use is high-variance regardless of model confidence. */
export const HIGH_OIL_VARIANCE = /\b(stir.?fry|saute|sautee|fried rice|curry|scrambled|omelet|hash|roast)\b/

/** Categories where sauce type is ambiguous by construction. */
export const SAUCE_AMBIGUOUS = /\b(salad|pasta|noodle|wings|bowl|burrito|sandwich|wrap)\b/

export interface StructuralUncertainty {
  reasons: UncertaintyReason[]
  assumptions: string[]
  questionIds: string[]
}

/**
 * Derive uncertainty from the FOOD CATEGORY alone, with no model self-report.
 *
 * SPEC-accuracy-engine.md §7.3. This module is what makes Path B possible at all —
 * an on-device classifier cannot emit stated_assumptions, clarifying_questions or
 * uncertainty_reason, so on Path B this is the SOLE source of those fields.
 *
 * On Path A it is a FLOOR, applied as a UNION and never a replacement: if the model
 * failed to flag oil on a stir-fry, we flag it anyway. The model not mentioning
 * something is not evidence that it is not there.
 */
export function inferStructuralUncertainty(item: Item): StructuralUncertainty {
  const out: StructuralUncertainty = { reasons: [], assumptions: [], questionIds: [] }
  const key = item.canonical_food_key.toLowerCase()

  if (HIGH_OIL_VARIANCE.test(key) && !item.cooking_method_cues.includes('visible_oil_pooling')) {
    out.reasons.push('oil_or_fat_not_visually_determinable')
    out.assumptions.push('Assumed ~1 tbsp cooking oil — typical for this dish, not visible once cooked.')
    out.questionIds.push('cooking_oil')
  }

  if (SAUCE_AMBIGUOUS.test(key)) {
    out.reasons.push('sauce_type_ambiguous')
    out.assumptions.push('Assumed a medium amount of the most common sauce for this dish.')
    out.questionIds.push('sauce_type')
  }

  if (item.beverage_category === 'alcoholic_poured_or_mixed') {
    out.reasons.push('abv_unknown')
    out.assumptions.push('Assumed 5% ABV at a standard pour — this could easily be double.')
    out.questionIds.push('alcohol_abv')
  }

  if (item.beverage_category === 'blended_shake_or_smoothie') {
    out.reasons.push('shake_recipe_unknown')
    out.assumptions.push('Assumed a water base with no add-ins.')
    out.questionIds.push('shake_recipe')
  }

  if (item.visible_reference_objects.length === 0 && item.food_form !== 'discrete') {
    out.reasons.push('container_size_no_reference')
  }

  return out
}
