import type { CookingCue } from '@nutai/core-schema'

/**
 * Cooking yields and oil absorption.
 *
 * SPEC-accuracy-engine.md §4.5.
 *
 * The yield figures are CONFIRMED from the USDA Table of Cooking Yields for Meat
 * and Poultry (Showell et al., USDA ARS Nutrient Data Laboratory, December 2012),
 * public domain as a US government work. Real wet-lab measurements — moisture via
 * AOAC 950.46, fat via acid hydrolysis — not estimates. Core equation, verbatim:
 *
 *   Yield (%) = 100 x (Wch / Wcr)      cooked-hot weight over raw weight
 *
 * THE LOAD-BEARING RULE: yields are food-class-specific lookups. There is no
 * generic meat constant anywhere in this file, and there must not be one anywhere
 * in the codebase. Bacon yields 29–32% — roughly 70% of raw weight lost to
 * rendered fat and moisture — while cured ham-and-water product yields 96%. A
 * pipeline applying a generic "meat ~= 75%" to bacon is not slightly off; it is
 * structurally, wildly wrong.
 */

export interface YieldEntry {
  yield: number
  /** Observed range in the USDA table, where published. Widens the band. */
  range?: readonly [number, number]
}

/** Cooked weight as a fraction of raw weight, keyed by food class + method. */
export const COOKING_YIELDS: Record<string, YieldEntry> = {
  // Chicken (USDA food group 05). 1975-vintage rows carried from AH-102, so no
  // SD or n is available for these.
  'chicken breast|baked': { yield: 0.72, range: [0.61, 0.82] },
  'chicken breast|roasted': { yield: 0.72, range: [0.61, 0.82] },
  'chicken breast|poached': { yield: 0.77, range: [0.7, 0.88] },
  'chicken breast|stewed': { yield: 0.77, range: [0.7, 0.88] },
  'chicken thigh|baked': { yield: 0.69, range: [0.58, 0.79] },
  'chicken thigh|poached': { yield: 0.74, range: [0.67, 0.82] },
  'chicken drumstick|baked': { yield: 0.76, range: [0.63, 0.87] },
  'chicken whole|baked': { yield: 0.78, range: [0.68, 0.84] },
  'chicken wing|baked': { yield: 0.74, range: [0.64, 0.83] },
  'chicken wing|deep_fried': { yield: 0.66, range: [0.53, 0.78] },
  'chicken back|baked': { yield: 0.61, range: [0.49, 0.71] },

  // Ground beef — a genuinely wide 62–77% span on fat content and method alone.
  // The same visual portion of "a cooked burger" maps to materially different
  // raw-equivalent mass depending on information a photo cannot supply, which is
  // why ground meat gets an extra band widening rather than a precise number.
  'ground beef high fat|fried': { yield: 0.62 },
  'ground beef high fat|baked': { yield: 0.63 },
  'ground beef high fat|grilled': { yield: 0.63 },
  'ground beef high fat|pan_broiled': { yield: 0.69 },
  'ground beef medium fat|grilled': { yield: 0.69 },
  'ground beef medium fat|pan_broiled': { yield: 0.73 },
  'ground beef low fat|fried': { yield: 0.69 },
  'ground beef low fat|baked': { yield: 0.72 },
  'ground beef low fat|grilled': { yield: 0.73 },
  'ground beef low fat|pan_broiled': { yield: 0.77 },

  // Pork — 29% to 96%, the widest span in the table.
  'pork backribs|baked': { yield: 0.82 },
  'bacon|baked': { yield: 0.32 },
  'bacon|pan_fried': { yield: 0.31 },
  'bacon|microwaved': { yield: 0.29 },
  'ham cured|baked': { yield: 0.96 },
  'pork loin chop|braised': { yield: 0.74 },
  'pork shoulder steak|braised': { yield: 0.65 },
}

/**
 * Grain dry-to-cooked MASS ratios.
 *
 * REPORTED from converged secondary cooking references — no single authoritative
 * USDA table was found. Worth re-deriving from USDA's own paired "as purchased"
 * vs "cooked" FNDDS entries, which likely encode these implicitly per food code.
 *
 * These are mass ratios and are simultaneously true with the density DROP in
 * §4.3.2 (rice boiled 0.72 vs raw 0.85) — not a contradiction: rice roughly
 * triples in volume while absorbing about double its own weight in water.
 */
export const GRAIN_YIELDS: Record<string, number> = {
  pasta: 2.25,
  'white rice': 3.0,
  rice: 3.0,
  'brown rice': 2.5,
}

/**
 * Oil absorbed during frying, as a fraction of the food's own mass.
 *
 * The fries figure is REPORTED (23% at 160 C rising to 28% at 180 C); the rest
 * are INFERRED general food-science figures.
 *
 * We cannot see fully-absorbed oil. But we CAN see that something is visibly
 * fried, battered or glossy, and applying a systematic correction for that visual
 * class is strictly better than applying none — which is the documented behavior
 * behind the single most over-determined complaint in the whole research corpus
 * (hidden oil/butter/dressing, five independent sources converging near-verbatim).
 *
 * PAIR the mechanical correction with the clarifying chip. Never substitute one
 * for the other.
 */
export const OIL_ABSORPTION: Record<string, number> = {
  deep_fried_potato: 0.25,
  doughnut: 0.22,
  battered_fried_meat: 0.12,
  tempura_vegetable: 0.15,
  pan_fried_generic: 0.06,
}

/** Cues that mean oil was absorbed and the fat macro must move. */
const OIL_TRIGGER_CUES: ReadonlySet<CookingCue> = new Set<CookingCue>([
  'deep_fried_color',
  'batter_or_breading',
  'visible_oil_pooling',
])

const PAN_FRY_CUES: ReadonlySet<CookingCue> = new Set<CookingCue>(['visible_oil_sheen'])

export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Map visual cooking cues onto a yield-table method token. */
export function methodFromCues(cues: readonly CookingCue[]): string | null {
  if (cues.includes('deep_fried_color')) return 'deep_fried'
  if (cues.includes('grill_marks') || cues.includes('char')) return 'grilled'
  if (cues.includes('boiled')) return 'poached'
  if (cues.includes('steamed_no_browning')) return 'poached'
  if (cues.includes('dry_surface')) return 'baked'
  return null
}

/**
 * Look up a cooking yield. Returns null when no food-class-specific entry exists —
 * deliberately, because the alternative is a generic constant, and a generic
 * constant applied to bacon is the failure this whole table exists to prevent.
 */
export function lookupYield(foodClass: string, method: string | null): YieldEntry | null {
  if (!method) return null
  const key = `${normalizeKey(foodClass)}|${method}`
  return COOKING_YIELDS[key] ?? null
}

export interface OilCorrection {
  /** Grams of oil to add, both to total mass and as a synthetic ingredient row. */
  addedOilGrams: number
  absorptionClass: string
}

/**
 * Compute the oil mass absorbed by a fried food.
 *
 * Adds oil MASS on top of the food's own estimated mass AND signals that a
 * synthetic oil ingredient row must be pushed, so the fat macro moves too.
 * Returning grams without adding the row would understate fat while overstating
 * nothing — the worst of both.
 */
export function oilAbsorptionFor(
  foodClass: string,
  cues: readonly CookingCue[],
  massG: number,
): OilCorrection | null {
  const key = normalizeKey(foodClass)
  const triggered = cues.some((c) => OIL_TRIGGER_CUES.has(c))
  const panOnly = !triggered && cues.some((c) => PAN_FRY_CUES.has(c))

  if (!triggered && !panOnly) return null

  let absorptionClass = 'pan_fried_generic'
  if (triggered) {
    if (/\b(fries|french fries|potato|chips|hash brown|tots)\b/.test(key)) {
      absorptionClass = 'deep_fried_potato'
    } else if (/\b(doughnut|donut|beignet|churro)\b/.test(key)) {
      absorptionClass = 'doughnut'
    } else if (/\b(tempura)\b/.test(key)) {
      absorptionClass = 'tempura_vegetable'
    } else if (cues.includes('batter_or_breading') || /\b(fried chicken|katsu|schnitzel|nugget)\b/.test(key)) {
      absorptionClass = 'battered_fried_meat'
    } else {
      absorptionClass = 'battered_fried_meat'
    }
  }

  const rate = OIL_ABSORPTION[absorptionClass]
  if (rate === undefined) return null

  return { addedOilGrams: massG * rate, absorptionClass }
}

/** True for food classes whose yield spread warrants extra band widening. */
export function isWideYieldClass(foodClass: string): boolean {
  return /\b(ground beef|ground meat|mince|burger|meatball|meatloaf)\b/.test(normalizeKey(foodClass))
}
