import type { DbAdapter } from '@nutai/db-adapter'
import { makeFoodDb } from '@nutai/pipeline'
import type { FoodDb } from '@nutai/gram-engine'

/**
 * Bridge from the corpus's food_portions rows to the gram ladder's vocabulary.
 *
 * The ladder asks for exactly four keys — 'per_unit', 'small', 'medium',
 * 'large' — but USDA portion rows describe themselves in free text ("piece,
 * cooked", "cup slices", "steak"). The mapping below is deliberately
 * conservative: a portion we cannot classify is simply not offered, and the
 * ladder falls to a lower tier. A wrong per-unit weight would silently scale
 * every count-based estimate; a missing one just costs a little precision.
 */

/** Modifier words that mean "one of the thing itself". */
const UNIT_WORDS =
  /^(piece|slice|unit|each|link|wedge|steak|roast|fillet|patty|bar|cookie|egg|stick|sandwich|burrito|taco|drumstick|thigh|wing|breast|loaf|roll|bun|muffin|bagel|pancake|waffle|tortilla|cracker|chip|nugget|meatball|sausage|frank|hot dog|donut|doughnut)\b/i

const SIZE_WORDS: Array<['small' | 'medium' | 'large', RegExp]> = [
  ['small', /\bsmall\b/i],
  ['medium', /\bmedium\b/i],
  ['large', /\blarge\b/i],
]

interface PortionRow {
  food_id: number
  measure_unit: string | null
  modifier: string | null
  amount: number | null
  gram_weight: number
  is_fndds_default: number
}

let cached: FoodDb | null = null

export async function loadFoodDb(nutritionDb: DbAdapter): Promise<FoodDb> {
  if (cached) return cached

  const rows = await nutritionDb.all<PortionRow>(
    'SELECT food_id, measure_unit, modifier, amount, gram_weight, is_fndds_default FROM food_portions WHERE gram_weight > 0',
  )

  const byFood = new Map<string, Record<string, number>>()
  const put = (foodId: number, key: string, grams: number) => {
    const id = String(foodId)
    const rec = byFood.get(id) ?? {}
    // First writer wins: rows arrive in corpus order, and the earliest portion
    // for a food is the most canonical one in USDA's own layout.
    if (rec[key] === undefined) rec[key] = grams
    byFood.set(id, rec)
  }

  for (const r of rows) {
    if (r.food_id == null) continue
    const desc = `${r.measure_unit ?? ''} ${r.modifier ?? ''}`.trim()

    for (const [size, rx] of SIZE_WORDS) {
      if (rx.test(desc)) put(r.food_id, size, r.gram_weight)
    }

    // "1 piece", "1 slice" — a unit weight, usable for count arithmetic. The
    // amount guard matters: "3 pieces" would make per_unit 3x too heavy.
    const unitish =
      UNIT_WORDS.test(r.modifier ?? '') || UNIT_WORDS.test(r.measure_unit ?? '')
    if (unitish && (r.amount == null || r.amount === 1)) {
      put(r.food_id, 'per_unit', r.gram_weight)
    }
  }

  // The FNDDS default portion is the best available stand-in for 'medium' when
  // nothing was labeled with a size word.
  for (const r of rows) {
    if (r.is_fndds_default === 1) {
      const rec = byFood.get(String(r.food_id))
      if (!rec || rec.medium === undefined) put(r.food_id, 'medium', r.gram_weight)
    }
  }

  cached = makeFoodDb(byFood)
  return cached
}

/** Test hook — the cache would otherwise leak between test files. */
export function _resetPortionCache(): void {
  cached = null
}
