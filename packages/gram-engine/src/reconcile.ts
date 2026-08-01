import type { GramCandidate, GramEstimate } from './types.js'

/**
 * Reconciliation — a trust hierarchy, not an average.
 *
 * SPEC-accuracy-engine.md §4.6.2.
 *
 * The rule that matters: DO NOT SILENTLY AVERAGE. A large disagreement between two
 * independent signals is itself information — arguably the most useful information
 * the pipeline produces, because it is the one case where the app knows it does
 * not know. Blending 140 g and 220 g into 180 g destroys that and replaces it with
 * a confident-looking number that is probably wrong in a way nobody can see.
 *
 * When the threshold fires, the user sees: "We're not sure — does this look more
 * like 140 g or 220 g?" with both numbers as taps. That question exists only
 * because we kept two independent estimates instead of collapsing them.
 */

/** Relative disagreement above which two signals become a question, not a blend. */
export const DISAGREEMENT_THRESHOLD = 0.35

/** Food-form-appropriate constant for the bottom of the ladder. */
export const GENERIC_FALLBACK_G = 150

/** Hard physical bounds. Flag, never silently truncate. */
export const GRAM_BOUNDS: readonly [number, number] = [0.1, 3000]

export function reconcile(candidates: readonly GramCandidate[]): GramEstimate {
  if (candidates.length === 0) {
    return {
      grams: GENERIC_FALLBACK_G,
      pathway: 'clamped',
      spread: 0.5,
      forceLowConfidence: true,
    }
  }

  const sorted = [...candidates].sort((a, b) => b.weight - a.weight)
  const best = sorted[0]
  if (!best) {
    return { grams: GENERIC_FALLBACK_G, pathway: 'clamped', spread: 0.5, forceLowConfidence: true }
  }
  const rival = sorted[1]

  if (rival) {
    const disagreement =
      Math.abs(best.grams - rival.grams) / Math.max(best.grams, rival.grams, Number.EPSILON)

    if (disagreement > DISAGREEMENT_THRESHOLD) {
      return {
        grams: best.grams,
        pathway: best.pathway,
        rivalGrams: rival.grams,
        rivalPathway: rival.pathway,
        surfaceDisagreementQuestion: true,
        spread: Math.max(best.spread, disagreement),
      }
    }

    // Close enough that the disagreement is not informative: blend the top TWO
    // only, weighted by trust. Never all candidates — a weak third signal should
    // not drag a strong first one.
    const w = best.weight + rival.weight
    return {
      grams: (best.grams * best.weight + rival.grams * rival.weight) / w,
      pathway: best.pathway,
      spread: Math.min(best.spread, rival.spread),
    }
  }

  return { grams: best.grams, pathway: best.pathway, spread: best.spread }
}

/** Apply the hard bounds. Flags by switching pathway, never by truncating quietly. */
export function clampGrams(estimate: GramEstimate): GramEstimate {
  const [lo, hi] = GRAM_BOUNDS
  const clamped = Math.min(hi, Math.max(lo, estimate.grams))
  if (clamped === estimate.grams) return estimate
  return {
    ...estimate,
    grams: clamped,
    pathway: 'clamped',
    forceLowConfidence: true,
  }
}
