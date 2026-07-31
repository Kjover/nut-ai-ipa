import { z } from 'zod'

/**
 * VisionPayload — the ONLY thing an inference model is allowed to return.
 *
 * SPEC-accuracy-engine.md §3.1–3.2. One canonical schema, three emitted provider
 * shapes, one client-side validator that runs for all of them.
 *
 * The governing rule (PLAN.md D16) is visible in the shape of this type:
 *
 *   The model is a perception device. It never owns a number the user sees.
 *
 * It reports what it can actually see — identity, form, relative size, reference
 * objects, cooking cues, legible text, and what it could NOT determine. Grams are
 * computed downstream by @nutai/gram-engine. Nutrition comes from a database row
 * via @nutai/resolver. Totals are arithmetic in @nutai/totals. Confidence comes
 * from measured per-category error in @nutai/confidence.
 *
 * Two deliberate omissions carry most of the weight:
 *
 * 1. There is NO `meal_totals` field. Not "present but ignored" — absent. A field
 *    we always discard is paid output tokens plus a standing temptation to render
 *    it. Its absence is what makes a macro-reconciliation mismatch unreachable
 *    rather than merely guarded against.
 *
 * 2. The mass field is `model_gram_estimate`, not `estimated_grams`. It sits at
 *    rank 5 of 6 in the reconciliation ladder. A field named `estimated_grams`
 *    invites a developer to display it; this one does not.
 */

export const SCHEMA_VERSION = '1.0.0' as const

/** Physical form. Selects which volume heuristic the gram engine applies. */
export const FoodFormZ = z.enum(['discrete', 'flat', 'piled', 'liquid', 'wrapped', 'spread'])
export type FoodForm = z.infer<typeof FoodFormZ>

/** Which state the gram estimate refers to. Drives yield-factor correction. */
export const WeightBasisZ = z.enum(['cooked', 'raw', 'as_served'])
export type WeightBasis = z.infer<typeof WeightBasisZ>

/**
 * The dominant reason an item is uncertain. This is the join key between the
 * model's uncertainty and the app's clarifying-question bank — which is why it is
 * a closed enum and not free text. A new reason requires a new question.
 */
export const UncertaintyReasonZ = z.enum([
  'oil_or_fat_not_visually_determinable',
  'sauce_type_ambiguous',
  'milk_type_ambiguous',
  'meat_fat_percent_ambiguous',
  'cooked_vs_raw_ambiguous',
  'container_size_no_reference',
  'serving_count_ambiguous',
  'portion_depth_not_visible',
  'identity_ambiguous',
  'partially_occluded',
  'abv_unknown',
  'shake_recipe_unknown',
  'none',
])
export type UncertaintyReason = z.infer<typeof UncertaintyReasonZ>

/** Scale anchors. Downstream code weights each type by its known size variance. */
export const ReferenceObjectTypeZ = z.enum([
  'credit_card',
  'drink_can_12oz',
  'dinner_plate',
  'salad_plate',
  'soup_plate',
  'bread_plate',
  'dessert_plate',
  'cereal_bowl',
  'mug',
  'drinking_glass',
  'fork',
  'spoon',
  'tablespoon',
  'chopsticks',
  'hand',
  'smartphone',
  'coin',
  'none',
])
export type ReferenceObjectType = z.infer<typeof ReferenceObjectTypeZ>

export const ContainerTypeZ = z.enum([
  'cereal_bowl',
  'soup_plate',
  'mug',
  'drinking_glass',
  'wine_glass',
  'pint_glass',
  'takeout_container',
  'other',
])
export type ContainerType = z.infer<typeof ContainerTypeZ>

/** Visual EVIDENCE only, never inference. Selects yields, triggers oil correction. */
export const CookingCueZ = z.enum([
  'grill_marks',
  'char',
  'visible_oil_sheen',
  'visible_oil_pooling',
  'batter_or_breading',
  'deep_fried_color',
  'steamed_no_browning',
  'boiled',
  'raw',
  'melted_cheese',
  'sauce_coating',
  'dry_surface',
  'none_visible',
])
export type CookingCue = z.infer<typeof CookingCueZ>

export const BeverageCategoryZ = z.enum([
  'alcoholic_packaged',
  'alcoholic_poured_or_mixed',
  'blended_shake_or_smoothie',
  'coffee_tea',
  'soda_juice_other',
  'milk_or_dairy_drink',
])
export type BeverageCategory = z.infer<typeof BeverageCategoryZ>

/**
 * `small` | `medium` | `large` | `count:N`.
 *
 * Size words are relative to a normal single serving OF THIS SPECIFIC FOOD — a
 * "large" egg and a "large" pizza share no scale. `count:N` short-circuits volume
 * estimation entirely and is strongly preferred whenever the food is countable,
 * because counting is the one thing vision models do reliably.
 */
export const QualitativeSizeZ = z
  .string()
  .regex(
    /^(small|medium|large|count:\d+(\.\d+)?)$/,
    "qualitative_size must be 'small', 'medium', 'large', or 'count:N'",
  )

export const MacrosZ = z.object({
  calories_kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
})
export type Macros = z.infer<typeof MacrosZ>

export const ReferenceObjectZ = z.object({
  type: ReferenceObjectTypeZ,
  /** [x, y, w, h], normalized 0–1 against the FIRST image. */
  bbox: z.array(z.number()).length(4),
  confidence: z.number().min(0).max(1),
})
export type ReferenceObject = z.infer<typeof ReferenceObjectZ>

export const ContainerZ = z.object({
  type: ContainerTypeZ,
  /**
   * 0–1, empty to rim. "How full is this" is answerable from a photo; absolute
   * container volume is not. The gram engine supplies the volume from priors.
   */
  fill_fraction: z.number().min(0).max(1),
})
export type Container = z.infer<typeof ContainerZ>

export const ItemZ = z.object({
  /** Human-readable, shown to the user directly. */
  name: z.string().min(1),
  /** Exact brand string only if legible in the photo. Never guessed. */
  brand: z.string().nullable(),
  /**
   * Generic lowercase comma-separated USDA-style search string, e.g.
   * 'chicken breast, grilled'. This is a query for @nutai/resolver, never a
   * database row and never decorative language.
   */
  canonical_food_key: z.string().min(1),
  food_form: FoodFormZ,
  qualitative_size: QualitativeSizeZ,
  weight_basis: WeightBasisZ,
  /**
   * The model's own best-guess mass. LOWEST-TRUST signal in the pipeline —
   * rank 5 of 6 in the reconciliation ladder. Used only when no deterministic
   * gram path exists. The clamp nulls this when it is out of bounds, which is a
   * demotion to the remaining tiers, not a failure.
   */
  model_gram_estimate: z.number().min(0).max(5000).nullable(),
  identification_confidence: z.number().min(0).max(1),
  /**
   * Probability the mass estimate is within ~20% of truth. Reported SEPARATELY
   * from identification_confidence because they are different quantities and
   * conflating them is why "I know it's a burrito" gets read as "I know it's
   * 340 g". Both are modifiers only — see @nutai/confidence.
   */
  portion_confidence: z.number().min(0).max(1),
  uncertainty_reason: UncertaintyReasonZ,
  visible_reference_objects: z.array(ReferenceObjectZ),
  /** Set for anything in a bowl, cup, glass or mug. Null for plated food. */
  container: ContainerZ.nullable(),
  cooking_method_cues: z.array(CookingCueZ),
  is_beverage: z.boolean(),
  beverage_category: BeverageCategoryZ.nullable(),
  /** Verbatim transcription of any legible nutrition panel. Never interpreted here. */
  legible_label_text: z.string().nullable(),
  /**
   * Specific, single-variable, correctable assumptions. Every entry becomes a
   * one-tap correction chip, so a vague entry is worthless — "assumed olive oil"
   * is useful, "assumed standard preparation" is not.
   */
  stated_assumptions: z.array(z.string()),
  /** At most 2. Empty when nothing is genuinely ambiguous. */
  clarifying_questions: z.array(z.string()).max(2),
  /**
   * Macros AT model_gram_estimate — not per 100 g. The miss path only: used when
   * database resolution finds no acceptable match, in which case the item is
   * shown to the user explicitly tagged as an AI estimate.
   */
  fallback_macros_at_estimate: MacrosZ,
})
export type Item = z.infer<typeof ItemZ>

export const MealOverallZ = z.object({
  identification_confidence: z.number().min(0).max(1),
  /**
   * Generally no higher than the lowest per-item portion_confidence in a
   * multi-item meal, since errors compound rather than average.
   */
  portion_confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()),
  /** Deduplicated from item-level questions, most-estimate-changing first. */
  clarifying_questions: z.array(z.string()),
})
export type MealOverall = z.infer<typeof MealOverallZ>

export const VisionPayloadZ = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  is_food: z.boolean(),
  /** Short, polite, specific. Null when is_food is true. */
  refusal_reason: z.string().nullable(),
  /**
   * One entry per distinct food or drink component across ALL photos. The same
   * physical item seen from two angles is one entry, not two.
   */
  items: z.array(ItemZ),
  meal_overall: MealOverallZ,
})
export type VisionPayload = z.infer<typeof VisionPayloadZ>
