import type { PersonalPrior } from './types.js'

/**
 * Personal gram priors — the flagship "it learns from you" mechanism.
 *
 * SPEC-accuracy-engine.md §4.8. This is the direct answer to the best-corroborated
 * finding about the app we are replacing: four independent sources using
 * near-identical language — "no way to teach the AI", "does not improve based on
 * your corrections", "corrections do not persist between scans".
 *
 * EXPLICIT NON-GOAL, stated plainly: none of this is model fine-tuning. "The app
 * learns from you" here is entirely a local statistics problem — EWMA ratios,
 * frequency tables, median gram weights. Plain SQLite and arithmetic. Zero
 * dependency on fine-tuning infrastructure, provider personalization APIs, or
 * on-device training. And because it sits strictly BELOW the inference call, it
 * works identically on Path A and Path B by construction.
 */

/** Recency weight. Dishware and portion habits genuinely change over time. */
export const EWMA_ALPHA = 0.3

/** Corrections required before a prior outranks the population estimate. */
export const MIN_SAMPLES_TO_TRUST = 3

/**
 * Fold one user correction into a prior.
 *
 * `correctionRatio = userFinalG / modelEstimateG` — a ratio rather than an
 * absolute, so it transfers across portion sizes: a user who consistently serves
 * 1.2x the population estimate is described by one number regardless of dish.
 */
export function updatePrior(
  existing: PersonalPrior | null,
  foodConceptKey: string,
  modelEstimateG: number,
  userFinalG: number,
  now: number,
): PersonalPrior {
  if (modelEstimateG <= 0) {
    // Nothing to form a ratio against. Record the observation without polluting
    // the ratio, so the sample still counts toward the median.
    return {
      foodConceptKey,
      ewmaRatio: existing?.ewmaRatio ?? 1,
      ratioVariance: existing?.ratioVariance ?? 0,
      sampleCount: (existing?.sampleCount ?? 0) + 1,
      medianGrams: userFinalG,
      lastCorrectedAt: now,
    }
  }

  const ratio = userFinalG / modelEstimateG

  if (!existing) {
    return {
      foodConceptKey,
      ewmaRatio: ratio,
      ratioVariance: 0,
      sampleCount: 1,
      medianGrams: userFinalG,
      lastCorrectedAt: now,
    }
  }

  const ewmaRatio = EWMA_ALPHA * ratio + (1 - EWMA_ALPHA) * existing.ewmaRatio
  // EWMA variance of the same series, so consistency is tracked alongside level.
  const delta = ratio - existing.ewmaRatio
  const ratioVariance =
    (1 - EWMA_ALPHA) * (existing.ratioVariance + EWMA_ALPHA * delta * delta)

  return {
    foodConceptKey,
    ewmaRatio,
    ratioVariance,
    sampleCount: existing.sampleCount + 1,
    // A running approximation, pulled toward each new observation. The exact
    // median would need the full history; this is what powers the disclosure
    // string "you usually log ~165 g", not a number anyone computes against.
    medianGrams:
      existing.medianGrams == null
        ? userFinalG
        : existing.medianGrams + (userFinalG - existing.medianGrams) * EWMA_ALPHA,
    lastCorrectedAt: now,
  }
}

export function isTrusted(prior: PersonalPrior | null): prior is PersonalPrior {
  return prior != null && prior.sampleCount >= MIN_SAMPLES_TO_TRUST
}

/**
 * Apply a trusted prior to a fresh model estimate.
 *
 * UX RULE: this adjusts the estimate AND discloses it ("adjusted to your usual
 * ~165 g"). It never hard-overrides a genuinely different-looking portion — a
 * visibly larger serving must log as larger. The nudge form is "the model said
 * ~170 g, but you usually log ~165 g — use your usual?", dismissible, never a
 * silent replacement.
 */
export function applyPrior(prior: PersonalPrior, modelEstimateG: number): number {
  return modelEstimateG * prior.ewmaRatio
}

/**
 * Normalize a food name to a concept key.
 *
 * Keyed so that "chicken breast", "grilled chicken breast" and "chix breast" all
 * update the same prior. Prefer the matched FDC/FNDDS food id when one exists —
 * this string path is the fallback for unresolved foods.
 */
const NOISE_WORDS = new Set([
  'grilled', 'baked', 'roasted', 'fried', 'boiled', 'steamed', 'raw', 'cooked',
  'fresh', 'homemade', 'organic', 'plain', 'seasoned', 'a', 'an', 'the', 'with',
  'and', 'of', 'style', 'sliced', 'chopped', 'diced', 'whole', 'large', 'small',
  'medium',
])

const SYNONYMS: Record<string, string> = {
  chix: 'chicken',
  chik: 'chicken',
  veggie: 'vegetable',
  veggies: 'vegetable',
  potatoes: 'potato',
  tomatoes: 'tomato',
}

export function canonicalConceptKey(name: string, resolvedFoodId?: string | null): string {
  if (resolvedFoodId) return `fdc:${resolvedFoodId}`
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t)
    .map((t) => (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t))
    .filter((t) => !NOISE_WORDS.has(t))
    .sort()
  return tokens.join(' ') || name.toLowerCase().trim()
}
