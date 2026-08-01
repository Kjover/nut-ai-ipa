/**
 * Density lookup.
 *
 * SPEC-accuracy-engine.md §4.3.
 *
 * LICENSING, stated plainly. The FAO/INFOODS Density Database v2.0 (2012) — 638
 * entries, the obvious source — is NOT CC0 like USDA FDC and NOT ODbL like Open
 * Food Facts. Its copyright page reads, verbatim: "All rights reserved...
 * Non-commercial uses will be authorized free of charge, upon request.
 * Reproduction for resale or other commercial purposes, including educational
 * purposes, may incur fees."
 *
 * DECISION: we do not bundle the FAO table. The values below are a small,
 * hand-authored table written for this project and licensed under this project's
 * own terms, using the FAO figures as a VALIDATION REFERENCE rather than as
 * bundled content. Rows whose FAO source code is USDA or FNDDS are re-derivable
 * from the CC0 USDA source independently, which is where they should come from at
 * pipeline-build time.
 *
 * The single most important thing this table encodes: there is no universal
 * density. Raw green salad leaves are 0.06 g/mL and a casserole is 1.04 g/mL —
 * a 17x spread. A pipeline using one constant is confidently wrong on one end or
 * the other.
 */

export interface DensityResult {
  gPerMl: number
  /** Which lookup tier resolved, so §7.2 can widen the band accordingly. */
  tier: 'exact' | 'food_group' | 'default'
  relativeSigma: number
}

/**
 * Sourced from the FAO/INFOODS v2.0 mixed-dishes distribution: across ~94
 * mixed-dish entries the overwhelming majority cluster 0.65–1.10 g/mL with a
 * center of mass around 0.85–1.05. A defensible literature-grounded fallback,
 * NOT an arbitrary guess.
 */
export const DEFAULT_MIXED_DISH_DENSITY = 0.9

/** Exact food-class densities, g/mL. Keys are normalized canonical food keys. */
export const DENSITY_TABLE: Record<string, number> = {
  // Liquids
  water: 1.0,
  'fruit juice': 1.06,
  'orange juice': 1.04,
  cola: 1.04,
  soda: 1.04,
  'whole milk': 1.03,
  milk: 1.03,
  'chicken noodle soup': 1.0,
  'tomato soup': 1.017,
  'vegetable soup': 0.99,
  'thick soup': 1.09,
  'heavy cream': 0.994,

  // Oils and fats — consistently below 1.0, a near-universal useful constant.
  'corn oil': 0.922,
  'olive oil': 0.918,
  'vegetable oil': 0.92,
  'soybean oil': 0.927,
  'peanut oil': 0.914,
  lard: 0.919,
  mayonnaise: 0.91,
  butter: 0.911,

  // Grains
  'rice, cooked': 0.725,
  'white rice, cooked': 0.725,
  'rice, raw': 0.85,
  'pasta, cooked': 0.55,
  'pasta, raw': 0.39,
  'noodles, cooked': 0.59,
  'white bread': 0.35,
  'sliced bread': 0.29,
  'corn flakes': 0.11,

  // Tubers and vegetables
  'potato, boiled': 0.59,
  'sweet potato, boiled': 0.65,
  'carrot, raw, chopped': 0.54,
  'carrot, grated': 0.71,
  'cauliflower, boiled': 0.45,
  // The two values that make a universal constant impossible.
  'spinach, raw': 0.08,
  'salad greens, raw': 0.06,
  'lettuce, raw': 0.06,

  // Legumes
  'kidney beans, boiled': 0.79,
  'green beans, boiled': 0.7,
  'lentils, boiled': 0.85,
  'cowpeas, boiled': 0.75,
  'soybeans, boiled': 0.79,

  // Meat — sparse and skewed in the source; a real gap.
  'beef, lean, raw': 0.96,
  'pork, fatty, raw': 0.97,
  'pork, fatty, boiled': 0.63,
  'egg, boiled': 0.6,

  // Snacks
  'potato chips': 0.105,
  'puffed snack': 0.11,

  // Mixed dishes — the most useful section, because this is the hardest form.
  lasagna: 1.04,
  'macaroni and cheese': 1.0,
  'chicken and dumplings': 1.04,
  'beef stew': 1.05,
  'broccoli casserole': 0.95,
  'green bean casserole': 0.95,
  'cheese tortellini': 1.03,
  'tuna noodle casserole': 0.93,
  'eggplant parmesan': 0.83,
  moussaka: 0.85,
  'beef and noodles, no sauce': 0.65,
  'beef and noodles, in gravy': 1.04,
}

/** Food-group defaults, tried when no exact class matches. */
export const FOOD_GROUP_DENSITY: Record<string, number> = {
  leafy_green: 0.08,
  cooked_grain: 0.65,
  raw_grain: 0.6,
  oil: 0.92,
  liquid: 1.0,
  soup: 1.02,
  legume: 0.78,
  root_vegetable: 0.6,
  meat: 1.0,
  snack: 0.11,
  mixed_dish: DEFAULT_MIXED_DISH_DENSITY,
}

/** Keyword routing from a canonical food key to a food group. */
const GROUP_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(lettuce|spinach|arugula|kale|salad greens|mixed greens)\b/, 'leafy_green'],
  [/\b(oil|ghee|shortening)\b/, 'oil'],
  [/\b(soup|broth|bisque|chowder)\b/, 'soup'],
  [/\b(juice|water|soda|cola|milk|tea|coffee|smoothie)\b/, 'liquid'],
  [/\b(rice|pasta|noodle|quinoa|couscous|barley|oats)\b.*\b(cooked|boiled|steamed)\b/, 'cooked_grain'],
  [/\b(rice|pasta|noodle|quinoa|couscous|barley|oats)\b/, 'cooked_grain'],
  [/\b(bean|lentil|chickpea|pea|legume)\b/, 'legume'],
  [/\b(potato|carrot|beet|turnip|parsnip|yam)\b/, 'root_vegetable'],
  [/\b(chicken|beef|pork|lamb|turkey|fish|salmon|steak|meat)\b/, 'meat'],
  [/\b(chips|crisps|popcorn|puffs|cereal)\b/, 'snack'],
]

export function normalizeFoodKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Resolve a density. NEVER returns "no density" — always resolves to something,
 * and records which tier resolved so the band can widen accordingly.
 */
export function lookupDensity(canonicalFoodKey: string): DensityResult {
  const key = normalizeFoodKey(canonicalFoodKey)

  const exact = DENSITY_TABLE[key]
  if (exact !== undefined) {
    return { gPerMl: exact, tier: 'exact', relativeSigma: 0.08 }
  }

  // Try the leading food class before the first comma: "rice, cooked, white" ->
  // "rice, cooked" -> "rice".
  const parts = key.split(',').map((p) => p.trim())
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join(', ')
    const hit = DENSITY_TABLE[candidate]
    if (hit !== undefined) {
      return { gPerMl: hit, tier: 'exact', relativeSigma: 0.1 }
    }
  }

  for (const [pattern, group] of GROUP_KEYWORDS) {
    if (pattern.test(key)) {
      const g = FOOD_GROUP_DENSITY[group]
      if (g !== undefined) {
        return { gPerMl: g, tier: 'food_group', relativeSigma: 0.2 }
      }
    }
  }

  return { gPerMl: DEFAULT_MIXED_DISH_DENSITY, tier: 'default', relativeSigma: 0.3 }
}
