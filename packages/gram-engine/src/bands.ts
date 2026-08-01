import type { GramPathway } from '@nutai/core-schema'

/**
 * Per-pathway uncertainty half-bands.
 *
 * SPEC-accuracy-engine.md §4.9. Every band below traces to a specific cited
 * figure. That matters for defending the accuracy-honesty positioning against the
 * obvious challenge — "how do you know these ranges are right?"
 *
 * These are the LITERATURE-SEEDED values. They ship first, labeled in-app as
 * seeded rather than measured, and get replaced by values the eval harness
 * regenerates from the golden set (D17). Shipping a fabricated "measured" range
 * would be a worse dishonesty than saying nothing at all.
 */

export interface BandSource {
  halfPct: number
  /** The published finding this number comes from. Shown on the accuracy page. */
  anchor: string
}

export const PATHWAY_BANDS: Record<GramPathway, BandSource> = {
  packaged_exact: {
    halfPct: 0.02,
    anchor: 'Exact printed serving arithmetic; label rounding only.',
  },
  discrete_count: {
    halfPct: 0.125,
    anchor: 'Counting is near-solved (87.5-93% zero-shot); per-unit weight is FNDDS-backed.',
  },
  personal_prior: {
    halfPct: 0.1,
    anchor: 'Derived from this user’s own observed correction variance.',
  },
  geometry_exact_ref: {
    halfPct: 0.175,
    anchor: 'DPF-Nutrition mass PMAE 10.6%; GoCARB reference-card volumetry.',
  },
  geometry_soft_ref: {
    halfPct: 0.275,
    anchor: 'Above, plus the 23-33 cm dinner-plate diameter spread.',
  },
  fndds_standard_portion: {
    halfPct: 0.375,
    anchor: 'ODU 2025 "predicted weight" tier: 39.5% carbohydrate MAPE.',
  },
  container_fill: {
    halfPct: 0.325,
    anchor: 'Fill-fraction judgment is easy; the container volume table is unvalidated.',
  },
  model_guess: {
    halfPct: 0.375,
    anchor: 'Fridolfsson 2025: GPT-4o 36.3% weight MAPE, Claude 3.5 Sonnet 37.3%.',
  },
  clamped: {
    halfPct: 0.5,
    anchor: 'No basis — the value was out of physical bounds. Please check this.',
  },
  user_edited: {
    halfPct: 0,
    anchor: 'The user supplied this number. It is not an estimate.',
  },
}

/** Applied when the dish is mixed/composite rather than a single food. */
export const MIXED_DISH_BAND: BandSource = {
  halfPct: 0.45,
  anchor: 'Lo 2024: MAE more than doubles single food -> mixed meal; Çınar 2026: up to 54% energy error on complex plates.',
}

/** Applied when no pathway produced a candidate at all. */
export const GENERIC_FALLBACK_BAND: BandSource = {
  halfPct: 0.5,
  anchor: 'No usable signal — we are guessing. Please check this.',
}

/** Extra widening for ground meat, whose yield spans 62-77% on invisible factors. */
export const GROUND_MEAT_EXTRA = 0.08

/** Extra widening when ABV or shake recipe is unknown (§4.10). */
export const UNKNOWN_BEVERAGE_EXTRA = 0.15

export interface BandInputs {
  pathway: GramPathway
  /** Additional relative spread contributed by geometry/density this run. */
  measuredSpread?: number | undefined
  isMixedDish?: boolean | undefined
  isGroundMeat?: boolean | undefined
  isUnknownBeverage?: boolean | undefined
  /** Personal prior sample count and consistency, when one applied. */
  priorSampleCount?: number | undefined
  priorVariance?: number | undefined
}

/**
 * Half-width of the displayed band, as a fraction of the estimate.
 *
 * Widenings compose in quadrature rather than by addition — independent error
 * sources do not stack linearly, and adding them produces bands so wide they stop
 * meaning anything, which is its own kind of dishonesty.
 */
export function computeGramBand(inputs: BandInputs): { halfPct: number; anchor: string } {
  const base = PATHWAY_BANDS[inputs.pathway]
  let anchor = base.anchor

  // The pathway band is the literature-anchored FLOOR for this kind of estimate.
  // measuredSpread is what this particular scan actually observed — a poor
  // reference object, a wide density fallback, a wide yield range.
  //
  // Take the larger of the two rather than composing them. They describe the same
  // quantity from two directions, and adding them in quadrature double-counts:
  // it inflated packaged_exact's honest +/-2% to +/-2.8% purely because the tier
  // restated its own band as a spread.
  const terms: number[] = [Math.max(base.halfPct, inputs.measuredSpread ?? 0)]

  if (inputs.isMixedDish) {
    terms.push(MIXED_DISH_BAND.halfPct)
    anchor = MIXED_DISH_BAND.anchor
  }
  if (inputs.isGroundMeat) terms.push(GROUND_MEAT_EXTRA)
  if (inputs.isUnknownBeverage) terms.push(UNKNOWN_BEVERAGE_EXTRA)

  let halfPct = Math.sqrt(terms.reduce((sum, t) => sum + t * t, 0))

  // A trusted personal prior NARROWS the band — but only in proportion to sample
  // count AND consistency. Noisy corrections keep it wide even at a high count,
  // because that user's portions genuinely vary and pretending otherwise would be
  // false precision derived from their own data.
  if (inputs.pathway === 'personal_prior' && inputs.priorSampleCount != null) {
    const countFactor = Math.min(1, 3 / Math.max(1, inputs.priorSampleCount))
    const noise = Math.sqrt(inputs.priorVariance ?? 0)
    halfPct = Math.max(0.06, halfPct * countFactor + noise)
  }

  // Never claim better than ±2%, and never exceed ±80% — past that the number is
  // not an estimate, it is a placeholder, and the UI says so in words instead.
  return { halfPct: Math.min(0.8, Math.max(0.02, halfPct)), anchor }
}
