import type { GramPathway } from '@nutai/core-schema'

/**
 * Shared types for the gram engine.
 *
 * SPEC-accuracy-engine.md §4. The whole justification in one number: Gemini 2.5
 * Flash's carbohydrate MAPE moved 56.6% (no weight info) -> 39.5% (predicted
 * weight) -> 20.2% (ground-truth weight). Knowing the mass collapses error by
 * roughly two thirds — a larger lever than any model upgrade, and it is realized
 * by deterministic tables plus a portion-confirmation UI, not a smarter model.
 *
 * And the reason we buy no hardware for it: DPF-Nutrition measured RGB-only at
 * 20.9% mean PMAE, software-predicted depth at 17.8%, and a real depth sensor at
 * 17.2%. LiDAR buys 0.6 percentage points. Not worth Pro-device fragmentation
 * plus custom native code on two platforms.
 */

/** How trustworthy a scale reference is. Drives whether it may be used at all. */
export type ScaleTier = 'exact' | 'high' | 'medium' | 'qualitative'

export interface RefDim {
  /** The reference dimension in millimetres. */
  mm: number
  /** Standard deviation of that dimension across real-world instances. */
  sigmaMm: number
  tier: ScaleTier
}

export interface ScaleEstimate {
  cmPerPx: number
  /** Propagates into the uncertainty band (§7.2) rather than being averaged away. */
  relativeSigma: number
  sourceType: string
  tier: ScaleTier
}

export interface GramCandidate {
  grams: number
  pathway: GramPathway
  /** Trust weight. Higher wins. Never averaged across more than the top two. */
  weight: number
  /** Relative uncertainty this pathway contributes. */
  spread: number
}

export interface GramEstimate {
  grams: number
  pathway: GramPathway
  spread: number
  /** Set when two independent signals disagreed enough to become a question. */
  rivalGrams?: number
  rivalPathway?: GramPathway
  /**
   * True when the disagreement should be surfaced to the user as a question
   * rather than hidden inside a blend (§8.4 rank 9).
   */
  surfaceDisagreementQuestion?: boolean
  forceLowConfidence?: boolean
  /** Set when a personal prior adjusted the number, so the UI can disclose it. */
  personalPriorApplied?: { medianGrams: number | null; sampleCount: number }
  /** Oil mass added by the frying correction, as a synthetic ingredient row. */
  addedOilGrams?: number
}

/** What the engine needs from the bundled nutrition database. */
export interface FoodDb {
  /**
   * FNDDS Portions and Weights lookup. `measure` is either a qualitative size
   * word or the literal 'per_unit' for countable foods.
   *
   * NOTE: the real column structure of the FNDDS portions file was NEVER
   * confirmed during research — two live PDF fetches returned unparseable binary.
   * The data pipeline must inspect the actual CSV header and fail loudly on an
   * unexpected shape rather than build against assumed column names.
   */
  fnddsPortionGrams(foodId: string, measure: 'per_unit' | 'small' | 'medium' | 'large'): number | null
}

export interface PersonalPrior {
  foodConceptKey: string
  /** EWMA of user_final_g / model_estimate_g. */
  ewmaRatio: number
  ratioVariance: number
  sampleCount: number
  /** Powers "you usually log ~165 g". */
  medianGrams: number | null
  lastCorrectedAt: number
}

export interface PersonalPriors {
  get(foodConceptKey: string): PersonalPrior | null
  /** User-calibrated container volumes, preferred over the population table. */
  containers: Map<string, number>
}

export interface ResolvedRow {
  foodId: string
  description: string
  /** Grams per printed serving, when this row came from a label or barcode. */
  servingSizeG?: number | null
}
