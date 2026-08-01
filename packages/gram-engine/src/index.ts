import type { Item } from '@nutai/core-schema'
import { computeGramBand } from './bands.js'
import { lookupDensity } from './density.js'
import { applyPrior, canonicalConceptKey, isTrusted } from './priors.js'
import { clampGrams, reconcile } from './reconcile.js'
import { scaleFromReferences } from './reference-objects.js'
import type { FoodDb, GramCandidate, GramEstimate, PersonalPriors, ResolvedRow, ScaleEstimate } from './types.js'
import { volumeForForm } from './volume.js'
import { isWideYieldClass, lookupYield, methodFromCues, oilAbsorptionFor } from './yields.js'

export * from './bands.js'
export * from './density.js'
export * from './priors.js'
export * from './reconcile.js'
export * from './reference-objects.js'
export * from './types.js'
export * from './volume.js'
export * from './yields.js'

/**
 * The gram engine.
 *
 * SPEC-accuracy-engine.md §4. Pure TypeScript over bundled tables. Same code, both
 * inference paths. Under 10 ms.
 *
 * This is where the accuracy actually lives. The model told us WHAT is on the
 * plate and roughly what shape it is; this decides HOW MUCH, using deterministic
 * tables, and the difference between those two jobs is the entire product thesis.
 */

export interface EstimateGramsInput {
  item: Item
  /** Segmented footprint area in cm2, when segmentation ran. */
  areaCm2?: number
  bboxVolumeCm3?: number
  imageWidthPx?: number
  imageHeightPx?: number
  priors: PersonalPriors
  db: FoodDb
  resolved: ResolvedRow | null
  /** Set when a barcode was decoded on-frame, short-circuiting to tier 0. */
  barcodeMatch?: boolean
  /** Servings the user confirmed, for the packaged path. */
  servingsConsumed?: number
  isMixedDish?: boolean
}

export interface GramResult extends GramEstimate {
  halfPct: number
  bandAnchor: string
}

/** Parse `count:N` out of a qualitative_size string. */
export function parseCount(qualitativeSize: string): number | null {
  const m = /^count:(\d+(?:\.\d+)?)$/.exec(qualitativeSize)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Tier 0 — packaged / label short-circuit. Exact arithmetic, no estimation.
 *
 *   grams_per_serving = label.serving_size_g     printed, exact
 *   servings_consumed = user_input               the ONLY estimate left
 *   total_grams       = grams_per_serving x servings_consumed
 */
function exactServingArithmetic(resolved: ResolvedRow, servings: number): GramEstimate | null {
  const perServing = resolved.servingSizeG
  if (perServing == null || perServing <= 0) return null
  return { grams: perServing * servings, pathway: 'packaged_exact', spread: 0.02 }
}

export function estimateGrams(input: EstimateGramsInput): GramResult {
  const { item, priors, db, resolved } = input

  // ---- Tier 0: packaged / label. No estimation at all. -----------------------
  if ((input.barcodeMatch === true || item.legible_label_text != null) && resolved) {
    const exact = exactServingArithmetic(resolved, input.servingsConsumed ?? 1)
    if (exact) return finish(exact, input)
  }

  // ---- Tier 1: discrete count. The cheapest accuracy win in the pipeline. ----
  //
  // It converts a hard continuous-volume problem into an easy discrete-counting
  // problem the model is already good at: identification and counting are close
  // to solved (87.5-93% zero-shot); portion size never was. Checked BEFORE any
  // other branch, always.
  const count = parseCount(item.qualitative_size)
  if (item.food_form === 'discrete' && count != null && resolved) {
    const perUnit = db.fnddsPortionGrams(resolved.foodId, 'per_unit')
    if (perUnit != null && perUnit > 0) {
      return finish({ grams: perUnit * count, pathway: 'discrete_count', spread: 0.125 }, input)
    }
  }

  const candidates: GramCandidate[] = []
  const conceptKey = canonicalConceptKey(item.canonical_food_key, resolved?.foodId)
  const prior = priors.get(conceptKey)

  // ---- Tier 2: personal prior for this food class (>= 3 corrections). -------
  if (isTrusted(prior) && item.model_gram_estimate != null) {
    candidates.push({
      grams: applyPrior(prior, item.model_gram_estimate),
      pathway: 'personal_prior',
      weight: 0.9,
      spread: Math.sqrt(prior.ratioVariance),
    })
  }

  // ---- Tier 3: reference-object-calibrated geometry. ------------------------
  const scale: ScaleEstimate | null =
    input.imageWidthPx != null && input.imageHeightPx != null
      ? scaleFromReferences(item.visible_reference_objects, input.imageWidthPx, input.imageHeightPx)
      : null

  if (scale && scale.tier !== 'qualitative') {
    const vol = volumeForForm({
      form: item.food_form,
      areaCm2: input.areaCm2,
      bboxVolumeCm3: input.bboxVolumeCm3,
      container: item.container,
      qualitativeSize: item.qualitative_size,
      userContainers: priors.containers,
    })
    if (vol) {
      const density = lookupDensity(item.canonical_food_key)
      candidates.push({
        grams: vol.ml * density.gPerMl,
        pathway: scale.tier === 'exact' ? 'geometry_exact_ref' : 'geometry_soft_ref',
        weight: scale.tier === 'exact' ? 0.85 : 0.6,
        spread: Math.sqrt(
          scale.relativeSigma ** 2 + density.relativeSigma ** 2 + vol.relativeSigma ** 2,
        ),
      })
    }
  }

  // ---- Tier 4: FNDDS standard portion keyed to qualitative size. ------------
  //
  // "The model says medium banana; FNDDS says a commonly-reported medium banana is
  // 118 g" is a dataset-backed weight requiring zero volume or density math. Per
  // ODU 2025, ANY real weight signal beats no weight signal by a large margin
  // (56.6% -> 39.5% MAPE).
  if (resolved && (item.qualitative_size === 'small' || item.qualitative_size === 'medium' || item.qualitative_size === 'large')) {
    const g = db.fnddsPortionGrams(resolved.foodId, item.qualitative_size)
    if (g != null && g > 0) {
      candidates.push({ grams: g, pathway: 'fndds_standard_portion', weight: 0.55, spread: 0.25 })
    }
  }

  // ---- Tier 4b: container fill, for liquids. --------------------------------
  if (item.food_form === 'liquid' && item.container) {
    const vol = volumeForForm({
      form: 'liquid',
      container: item.container,
      qualitativeSize: item.qualitative_size,
      userContainers: priors.containers,
    })
    if (vol) {
      const density = lookupDensity(item.canonical_food_key)
      candidates.push({
        grams: vol.ml * density.gPerMl,
        pathway: 'container_fill',
        weight: 0.5,
        spread: Math.sqrt(vol.relativeSigma ** 2 + density.relativeSigma ** 2),
      })
    }
  }

  // ---- Tier 5: the model's own guess. Lowest trust, always widest band. -----
  //
  // SPEC DEVIATION, deliberate. §4.6 pushes this candidate unconditionally, but a
  // trusted personal prior is computed AS model_gram_estimate x ewmaRatio — the
  // two are not independent signals, they are the same signal before and after the
  // user's own correction. Blending them (which reconcile() would do, since they
  // usually agree within the disagreement threshold) drags the estimate back
  // toward the number the user has repeatedly told us is wrong, and does it more
  // strongly the more consistent their correction has been.
  //
  // A user who has corrected "150 g" to "200 g" five times should see 200, not
  // 189. So when the prior is driving, the raw guess does not also get a vote.
  const priorIsDriving = isTrusted(prior) && item.model_gram_estimate != null
  if (item.model_gram_estimate != null && !priorIsDriving) {
    candidates.push({
      grams: item.model_gram_estimate,
      pathway: 'model_guess',
      weight: 0.25,
      spread: 0.4,
    })
  }

  let out = reconcile(candidates)

  if (isTrusted(prior) && out.pathway === 'personal_prior') {
    out = {
      ...out,
      personalPriorApplied: { medianGrams: prior.medianGrams, sampleCount: prior.sampleCount },
    }
  }

  out = applyYieldFactor(out, item, resolved)
  out = applyOilCorrection(out, item)
  out = clampGrams(out)

  return finish(out, input)
}

/**
 * Convert between cooked and raw basis when the matched database row's basis
 * differs from what the model reported seeing.
 *
 * In practice this is rarely needed, because FNDDS/FDC already carry cooked-state
 * rows for most common preparations — "chicken breast, roasted" is its own row
 * with its own per-100g values. It matters when a recipe or user log is
 * raw-denominated, or when the only matched row is raw-basis.
 */
export function applyYieldFactor(
  estimate: GramEstimate,
  item: Item,
  _resolved: ResolvedRow | null,
): GramEstimate {
  if (item.weight_basis !== 'raw') return estimate
  const method = methodFromCues(item.cooking_method_cues)
  const entry = lookupYield(item.canonical_food_key, method)
  if (!entry) return estimate

  // The photo shows cooked food; the row wants raw-equivalent mass.
  const grams = estimate.grams / entry.yield
  const rangeSpread = entry.range
    ? (entry.range[1] - entry.range[0]) / 2 / entry.yield
    : 0.05
  return {
    ...estimate,
    grams,
    spread: Math.sqrt(estimate.spread ** 2 + rangeSpread ** 2),
  }
}

/**
 * Add absorbed frying oil to the mass, and signal the synthetic oil row.
 *
 * We cannot see fully-absorbed oil any more than any other app can. But we CAN see
 * that something is visibly fried, battered or glossy, and applying a systematic
 * correction for that visual class is strictly better than applying none.
 *
 * PAIRED with the clarifying chip, never a substitute for it.
 */
export function applyOilCorrection(estimate: GramEstimate, item: Item): GramEstimate {
  const oil = oilAbsorptionFor(item.canonical_food_key, item.cooking_method_cues, estimate.grams)
  if (!oil) return estimate
  return {
    ...estimate,
    grams: estimate.grams + oil.addedOilGrams,
    addedOilGrams: oil.addedOilGrams,
  }
}

function finish(estimate: GramEstimate, input: EstimateGramsInput): GramResult {
  const { item } = input
  const isUnknownBeverage =
    item.is_beverage &&
    (item.beverage_category === 'alcoholic_poured_or_mixed' ||
      item.beverage_category === 'blended_shake_or_smoothie')

  const band = computeGramBand({
    pathway: estimate.pathway,
    measuredSpread: estimate.spread,
    isMixedDish: input.isMixedDish ?? false,
    isGroundMeat: isWideYieldClass(item.canonical_food_key),
    isUnknownBeverage,
    priorSampleCount: estimate.personalPriorApplied?.sampleCount,
    priorVariance: undefined,
  })

  return { ...estimate, halfPct: band.halfPct, bandAnchor: band.anchor }
}
