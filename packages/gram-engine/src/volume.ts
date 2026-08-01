import type { Container, FoodForm } from '@nutai/core-schema'

/**
 * Food-form volume heuristics.
 *
 * SPEC-accuracy-engine.md §4.2. A food-form classifier gates which formula fires.
 * No universal formula exists, and pretending otherwise is how a pipeline gets
 * confidently wrong on leafy greens (0.06 g/mL) using a constant tuned for
 * casseroles (1.04 g/mL).
 *
 * TWO TABLES IN THIS FILE HAVE NO AUTHORITATIVE PUBLISHED SOURCE — the flat
 * thickness table and the pile factors. They are the single largest unproven-number
 * risk in the pipeline and they are items 1 and 2 in the §11 device protocol:
 * measure real grocery cuts with calipers and a scale; photograph known-mass piles
 * at varying heights and back-solve the factor per class. Until that happens these
 * are INFERRED and every number derived from them carries a wide band.
 */

/**
 * Assumed thickness in cm for `flat` foods. Thickness is invisible from a
 * top-down photo and is the weakest link in this form.
 *
 * INFERRED — no published source. See the file header.
 */
export const FLAT_THICKNESS_CM: Record<string, { min: number; max: number }> = {
  chicken_breast: { min: 2.0, max: 2.5 },
  steak_or_chop: { min: 1.5, max: 2.5 },
  burger_patty: { min: 1.0, max: 1.5 },
  fish_fillet: { min: 1.0, max: 2.0 },
  pancake_or_flatbread: { min: 0.5, max: 1.0 },
}

export const DEFAULT_FLAT_THICKNESS_CM = { min: 1.0, max: 2.0 }

/**
 * Pile factor: pile height as a fraction of the footprint radius.
 *
 * INFERRED — no published pile-factor table exists. See the file header.
 */
export const PILE_FACTORS: Record<string, { min: number; max: number }> = {
  leafy_salad: { min: 0.15, max: 0.25 },
  scooped_grain: { min: 0.3, max: 0.45 },
  loose_fries: { min: 0.35, max: 0.5 },
}

export const DEFAULT_PILE_FACTOR = { min: 0.25, max: 0.4 }

/**
 * Packing density for `wrapped` foods — accounts for air pockets, crust volume
 * that is not filling, and compressibility. INFERRED.
 */
export const WRAPPED_PACKING_DENSITY = { min: 0.6, max: 0.8 }

/** The metric tablespoon. 15 mL. Used for `spread`. */
export const TABLESPOON_ML = 15
export const TEASPOON_ML = 5

/**
 * Container usable volumes in mL, at a NORMAL serving level, not to the rim.
 *
 * UNVALIDATED. Research confirmed container DIAMETERS but never usable volumes —
 * "a cereal bowl at 19 cm diameter with a typical 5–6 cm depth implies roughly
 * 400–600 mL usable" is reasoning, not measurement. Build this table from direct
 * measurement of common dinnerware, and always prefer the user's own calibrated
 * `user_containers` entry when one exists.
 */
export const CONTAINER_USABLE_ML: Record<string, number> = {
  cereal_bowl: 500,
  soup_plate: 350,
  mug: 300,
  drinking_glass: 350,
  wine_glass: 150,
  pint_glass: 470,
  takeout_container: 700,
  other: 400,
}

export interface VolumeResult {
  /** Midpoint estimate in cm3. */
  ml: number
  /** Relative uncertainty this geometry contributes. */
  relativeSigma: number
}

/** Midpoint and relative half-spread of an inclusive range. */
function midpoint(range: { min: number; max: number }): { mid: number; relSigma: number } {
  const mid = (range.min + range.max) / 2
  const relSigma = mid > 0 ? (range.max - range.min) / 2 / mid : 0.5
  return { mid, relSigma }
}

/**
 * `flat` — steaks, fillets, patties, pancakes, flatbread.
 * volume = visible_area x assumed_thickness
 */
export function flatVolume(areaCm2: number, foodClass?: string): VolumeResult {
  const range = (foodClass ? FLAT_THICKNESS_CM[foodClass] : undefined) ?? DEFAULT_FLAT_THICKNESS_CM
  const { mid, relSigma } = midpoint(range)
  return { ml: areaCm2 * mid, relativeSigma: relSigma }
}

/**
 * `piled` — rice, salad, fries, cut fruit, granola.
 *
 * Modelled as a spherical cap on the segmented footprint:
 *   r = sqrt(area / pi)
 *   h = pile_factor * r
 *   V = (pi * h / 6) * (3r^2 + h^2)
 */
export function piledVolume(areaCm2: number, foodClass?: string): VolumeResult {
  const range = (foodClass ? PILE_FACTORS[foodClass] : undefined) ?? DEFAULT_PILE_FACTOR
  const { mid: pileFactor, relSigma } = midpoint(range)
  const r = Math.sqrt(areaCm2 / Math.PI)
  const h = pileFactor * r
  const ml = ((Math.PI * h) / 6) * (3 * r * r + h * h)
  return { ml, relativeSigma: relSigma }
}

/**
 * `liquid` — soup, smoothies, drinks, sauce in a bowl.
 *
 * NEVER estimate liquid volume from the visible surface. You see a disc, not a
 * depth. Instead: container usable volume x fill fraction.
 *
 * `fill_fraction` is a comparatively EASY judgment for a vision model, because
 * "how full is this bowl" is a well-posed 2D question a photo genuinely answers —
 * unlike "how much rice is piled here."
 */
export function liquidVolume(
  container: Container,
  userContainers?: Map<string, number>,
): VolumeResult | null {
  const usable = userContainers?.get(container.type) ?? CONTAINER_USABLE_ML[container.type]
  if (usable === undefined) return null
  // A user-calibrated container is a measurement; the population table is not.
  const calibrated = userContainers?.has(container.type) ?? false
  return {
    ml: usable * container.fill_fraction,
    relativeSigma: calibrated ? 0.12 : 0.3,
  }
}

/** `wrapped` — sandwiches, burritos, wraps, dumplings. */
export function wrappedVolume(bboxVolumeCm3: number): VolumeResult {
  const { mid, relSigma } = midpoint(WRAPPED_PACKING_DENSITY)
  return { ml: bboxVolumeCm3 * mid, relativeSigma: relSigma }
}

/**
 * `spread` — sauce, dressing, butter, jam over something else.
 *
 * Do NOT compute a volume. Resolve to a household-measure count via the model's
 * qualitative size and the standard 15 mL tablespoon, and prefer a clarifying
 * chip. This is the class where the question is cheaper and better than any
 * geometry.
 */
export function spreadVolume(qualitativeSize: string): VolumeResult {
  const tablespoons = qualitativeSize === 'small' ? 1 : qualitativeSize === 'large' ? 3 : 2
  return { ml: tablespoons * TABLESPOON_ML, relativeSigma: 0.5 }
}

export interface GeometryInput {
  form: FoodForm
  /** Segmented footprint area in cm2, for flat and piled. */
  areaCm2?: number | undefined
  /** Bounding-box volume in cm3, for wrapped. */
  bboxVolumeCm3?: number | undefined
  container?: Container | null | undefined
  qualitativeSize: string
  foodClass?: string | undefined
  userContainers?: Map<string, number> | undefined
}

/** Dispatch to the right heuristic. Returns null when geometry cannot apply. */
export function volumeForForm(input: GeometryInput): VolumeResult | null {
  switch (input.form) {
    case 'discrete':
      // Handled far earlier, by counting. Geometry never runs for discrete foods.
      return null
    case 'flat':
      return input.areaCm2 != null ? flatVolume(input.areaCm2, input.foodClass) : null
    case 'piled':
      return input.areaCm2 != null ? piledVolume(input.areaCm2, input.foodClass) : null
    case 'liquid':
      return input.container ? liquidVolume(input.container, input.userContainers) : null
    case 'wrapped':
      return input.bboxVolumeCm3 != null ? wrappedVolume(input.bboxVolumeCm3) : null
    case 'spread':
      return spreadVolume(input.qualitativeSize)
  }
}
