import { z } from 'zod'

/**
 * A transcribed nutrition-facts label.
 *
 * The label scanner is TRANSCRIPTION, not estimation: the model reads a printed
 * panel and copies its numbers. That makes the resulting row the most trusted
 * kind in the app (gramPathway 'packaged_exact', the top of the ladder) — but
 * only if serving_g was actually printed. A label whose serving size cannot be
 * read produces a failure the user can see, never a guessed weight.
 */

export const LabelPerServingZ = z.object({
  calories_kcal: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  fiber_g: z.number().min(0).nullable(),
  sugar_g: z.number().min(0).nullable(),
  sodium_mg: z.number().min(0).nullable(),
})

export const LabelPayloadZ = z.object({
  /** Product name if printed near the panel; null when only the panel is shown. */
  product_name: z.string().nullable(),
  /** e.g. "3/4 cup (170g)". */
  serving_desc: z.string().nullable(),
  /** Grams per serving. Null when the label truly does not state one. */
  serving_g: z.number().positive().nullable(),
  servings_per_container: z.number().positive().nullable(),
  per_serving: LabelPerServingZ,
})

export type LabelPayload = z.infer<typeof LabelPayloadZ>
