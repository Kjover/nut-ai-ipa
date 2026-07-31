import type { Item, Macros, VisionPayload } from '@nutai/core-schema'

/**
 * The deterministic sanity clamp.
 *
 * SPEC-accuracy-engine.md §3.4. **Always on. Every scan. Both inference paths.
 * Non-LLM. Near-zero cost. Never skippable.**
 *
 * This is the direct countermeasure to the most embarrassing documented failure in
 * this product category — an approximately 27-million-calorie output, observed
 * across two independent research passes. It ships BEFORE any LLM-based verifier,
 * not instead of one: a second model call to check the first model's arithmetic
 * costs money, adds latency, and can itself be wrong. Arithmetic cannot.
 *
 * A flag never silently deletes an item. It degrades it honestly — three effects,
 * all downstream of this function:
 *   (a) the flag is recorded on the log entry, for support and for the eval harness
 *   (b) the item's confidence is forced to the lowest band
 *   (c) a visible "please check this one" marker is surfaced in the UI
 *
 * Unlike the spec's reference implementation, this is PURE — it returns a new
 * payload rather than mutating its input. The eval harness replays the same
 * payload through multiple pipeline configurations, and in-place mutation would
 * silently contaminate run N+1 with run N's corrections.
 */

export const CLAMP_BOUNDS = {
  MEAL_KCAL: [0, 5000],
  ITEM_KCAL: [0, 3000],
  ITEM_GRAMS: [0.1, 3000],
  /** Pure fat is ~884 kcal/100 g. Nothing edible exceeds this. */
  MAX_KCAL_PER_100G: 900,
  /** Atwater 4/4/9 may disagree with a stated calorie count by up to this fraction. */
  MACRO_ARITHMETIC_TOLERANCE: 0.15,
} as const

export type ClampFlagKind =
  | 'grams_out_of_bounds'
  | 'macro_arithmetic_mismatch'
  | 'impossible_energy_density'
  | 'item_kcal_out_of_bounds'
  | 'meal_kcal_out_of_bounds'

export interface ClampFlag {
  /** Item name, or null for meal-level flags. */
  item: string | null
  kind: ClampFlagKind
  /** The offending value as the model reported it. */
  original?: number
  /** What deterministic arithmetic produced instead. */
  derived?: number
}

export interface ClampResult {
  payload: VisionPayload
  flags: ClampFlag[]
}

/** Atwater factors. The arithmetic the model does not get to override. */
export function caloriesFromMacros(m: Pick<Macros, 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return 4 * m.protein_g + 4 * m.carbs_g + 9 * m.fat_g
}

function clampItem(item: Item, flags: ClampFlag[]): Item {
  let next: Item = item

  // 1. Grams out of bounds -> demote to null so the reconciliation ladder falls
  //    through to its other tiers. This is a demotion, not a deletion: ranks 0-4
  //    (packaged label, discrete count, personal prior, reference geometry,
  //    standard portion) are all still available and all outrank this value anyway.
  if (next.model_gram_estimate != null) {
    const [lo, hi] = CLAMP_BOUNDS.ITEM_GRAMS
    if (next.model_gram_estimate < lo || next.model_gram_estimate > hi) {
      flags.push({
        item: next.name,
        kind: 'grams_out_of_bounds',
        original: next.model_gram_estimate,
      })
      next = { ...next, model_gram_estimate: null }
    }
  }

  // 2. Macro arithmetic. 4/4/9 wins over whatever the model asserted.
  //
  //    This is the structural fix for the "macros don't add up to the calories"
  //    bug that users of the app we are replacing report constantly. We do not
  //    warn about the mismatch and display the model's number anyway - we replace
  //    the number. The macros are the more trustworthy signal because they are
  //    what the model actually reasoned about; the calorie figure is a summary it
  //    produced separately and often inconsistently.
  const m = next.fallback_macros_at_estimate
  const derived = caloriesFromMacros(m)
  if (
    m.calories_kcal > 0 &&
    Math.abs(derived - m.calories_kcal) / m.calories_kcal > CLAMP_BOUNDS.MACRO_ARITHMETIC_TOLERANCE
  ) {
    flags.push({
      item: next.name,
      kind: 'macro_arithmetic_mismatch',
      original: m.calories_kcal,
      derived,
    })
    next = { ...next, fallback_macros_at_estimate: { ...m, calories_kcal: derived } }
  }

  // 3. Item calorie ceiling. Checked against the post-reconciliation value, since
  //    step 2 may have just replaced it.
  const itemKcal = next.fallback_macros_at_estimate.calories_kcal
  const [kcalLo, kcalHi] = CLAMP_BOUNDS.ITEM_KCAL
  if (itemKcal < kcalLo || itemKcal > kcalHi) {
    flags.push({ item: next.name, kind: 'item_kcal_out_of_bounds', original: itemKcal })
  }

  // 4. Energy density. The single most useful check in the function: it catches
  //    unit confusion (kJ reported as kcal), decimal-place slips, and per-100g
  //    values reported as absolute - the failure classes that produce absurd
  //    numbers. Flag only; we do not invent a replacement density.
  if (next.model_gram_estimate != null && next.model_gram_estimate > 0) {
    const per100 = itemKcal / (next.model_gram_estimate / 100)
    if (per100 > CLAMP_BOUNDS.MAX_KCAL_PER_100G) {
      flags.push({ item: next.name, kind: 'impossible_energy_density', derived: per100 })
    }
  }

  return next
}

/**
 * Validate and correct a payload's arithmetic. Returns a NEW payload; the input is
 * never mutated.
 */
export function clamp(payload: VisionPayload): ClampResult {
  const flags: ClampFlag[] = []
  const items = payload.items.map((item) => clampItem(item, flags))

  // Meal-level ceiling. Note this sums the FALLBACK macros, which are only ever
  // displayed on the database-miss path - the real meal total is computed by
  // @nutai/totals from resolved per-100g rows. This bound exists to arm the
  // optional verifier pass (SPEC §3.8) and to catch a payload that is globally
  // absurd even when no single item breached its own ceiling.
  const mealKcal = items.reduce((sum, i) => sum + i.fallback_macros_at_estimate.calories_kcal, 0)
  const [mealLo, mealHi] = CLAMP_BOUNDS.MEAL_KCAL
  if (mealKcal < mealLo || mealKcal > mealHi) {
    flags.push({ item: null, kind: 'meal_kcal_out_of_bounds', original: mealKcal })
  }

  return { payload: { ...payload, items }, flags }
}

/**
 * Flags that arm the optional LLM verifier pass when the user has enabled it
 * (SPEC-accuracy-engine.md §3.8). Deliberately narrow: these two indicate the
 * model's output is not merely imprecise but internally incoherent.
 */
export function armsVerifierPass(flags: readonly ClampFlag[]): boolean {
  return flags.some(
    (f) => f.kind === 'impossible_energy_density' || f.kind === 'meal_kcal_out_of_bounds',
  )
}
