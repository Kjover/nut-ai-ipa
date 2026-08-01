import type { ReferenceObject, ReferenceObjectType } from '@nutai/core-schema'
import type { RefDim, ScaleEstimate, ScaleTier } from './types.js'

/**
 * Reference-object scale priors.
 *
 * SPEC-accuracy-engine.md §4.1. Ranked by SIZE VARIANCE, not by how often the
 * object appears. That ordering is the whole point: a dinner plate is the most
 * commonly present anchor and one of the worst, because "dinner plate" spans
 * 23–33 cm and that ±18% lands on the scale factor before any food-area error
 * even starts compounding.
 *
 * GoCARB is the clinical precedent for the approach — a standardized reference
 * card beside the meal, two photos from different angles, volumetric assessment
 * against a nutrition database, validated in Diabetes Care (2016), and it beat
 * patients' own manual carb counting.
 */

export const REFERENCE_DIMENSIONS: Record<ReferenceObjectType, RefDim> = {
  /** ISO/IEC 7810 ID-1. 85.60 x 53.98 mm, standardized worldwide. Zero variance. */
  credit_card: { mm: 85.6, sigmaMm: 0.0, tier: 'exact' },
  /** 355 ml can: 12.3 cm tall, 6.60 cm body diameter at its widest. */
  drink_can_12oz: { mm: 66.0, sigmaMm: 1.0, tier: 'high' },
  /**
   * Resolvable exactly from Device.modelName when it is the USER'S OWN phone in a
   * mirror or second-device shot. Rare, but exact when it happens — so it is
   * listed as high rather than qualitative. Callers that cannot identify the model
   * must not use it.
   */
  smartphone: { mm: 147.0, sigmaMm: 8.0, tier: 'high' },
  cereal_bowl: { mm: 190, sigmaMm: 20, tier: 'medium' },
  dinner_plate: { mm: 280, sigmaMm: 30, tier: 'medium' },
  salad_plate: { mm: 200, sigmaMm: 20, tier: 'medium' },
  soup_plate: { mm: 230, sigmaMm: 20, tier: 'medium' },
  dessert_plate: { mm: 200, sigmaMm: 15, tier: 'medium' },
  bread_plate: { mm: 165, sigmaMm: 15, tier: 'medium' },

  // ---------------------------------------------------------------------------
  // Qualitative only. NEVER used to derive cm_per_px. These exist so the model can
  // report them (corroboration, and the vocabulary for the clarifying-question
  // fallback in §4.7 step 5) without any of them silently becoming a measurement.
  // ---------------------------------------------------------------------------

  /** Adult hand length: M 19.30 cm / F 17.27 cm fingertip to palm crease. */
  hand: { mm: 183, sigmaMm: 15, tier: 'qualitative' },
  fork: { mm: 190, sigmaMm: 25, tier: 'qualitative' },
  spoon: { mm: 175, sigmaMm: 25, tier: 'qualitative' },
  /**
   * 15 mL by the metric convention (UK historically ~14.2, US historically ~14.8,
   * Australia 20). The VOLUME is fixed; no standardized physical dimensions exist
   * at all, so this can anchor a household measure but never a pixel span.
   */
  tablespoon: { mm: 0, sigmaMm: 0, tier: 'qualitative' },
  chopsticks: { mm: 240, sigmaMm: 20, tier: 'qualitative' },
  coin: { mm: 24, sigmaMm: 4, tier: 'qualitative' },
  drinking_glass: { mm: 75, sigmaMm: 15, tier: 'qualitative' },
  mug: { mm: 95, sigmaMm: 15, tier: 'qualitative' },
  none: { mm: 0, sigmaMm: 0, tier: 'qualitative' },
}

const TIER_RANK: Record<ScaleTier, number> = {
  exact: 0,
  high: 1,
  medium: 2,
  qualitative: 3,
}

/** Minimum detection confidence before a reference object is usable at all. */
export const MIN_REFERENCE_CONFIDENCE = 0.5

/** Longest side of a normalized [x, y, w, h] bbox, in pixels. */
export function longestBboxSpanPx(bbox: readonly number[], imageWidthPx: number, imageHeightPx: number): number {
  const w = (bbox[2] ?? 0) * imageWidthPx
  const h = (bbox[3] ?? 0) * imageHeightPx
  return Math.max(w, h)
}

/**
 * Derive a scale factor from the best usable reference object in frame.
 *
 * Returns null when nothing usable is present — which is the common case, and is
 * why §4.7's ladder has four more tiers below geometry. A null here is not a
 * failure; it is a routing decision.
 */
export function scaleFromReferences(
  refs: readonly ReferenceObject[],
  imageWidthPx: number,
  imageHeightPx: number,
): ScaleEstimate | null {
  const usable = refs
    .filter((r) => REFERENCE_DIMENSIONS[r.type].tier !== 'qualitative')
    .filter((r) => r.confidence >= MIN_REFERENCE_CONFIDENCE)
    .sort((a, b) => TIER_RANK[REFERENCE_DIMENSIONS[a.type].tier] - TIER_RANK[REFERENCE_DIMENSIONS[b.type].tier])

  const best = usable[0]
  if (!best) return null

  const dim = REFERENCE_DIMENSIONS[best.type]
  const pxSpan = longestBboxSpanPx(best.bbox, imageWidthPx, imageHeightPx)
  if (pxSpan <= 0) return null

  return {
    cmPerPx: dim.mm / 10 / pxSpan,
    relativeSigma: dim.sigmaMm / dim.mm,
    sourceType: best.type,
    tier: dim.tier,
  }
}
