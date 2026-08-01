import { z } from 'zod'

/**
 * A free-text workout, estimated.
 *
 * This is the ONE exercise path where a model owns the calorie figure, and it
 * is labeled as an estimate in the UI. The bounds are deliberately tight: a
 * describe-your-workout box should never be able to log a 20,000 kcal entry
 * because the model misread "10k run" as something heroic.
 */
export const ExerciseEstimateZ = z.object({
  /** Short display label, e.g. "Leg strength training". */
  label: z.string().min(1).max(80),
  duration_min: z.number().positive().max(600).nullable(),
  calories_kcal: z.number().min(1).max(3000),
})

export type ExerciseEstimate = z.infer<typeof ExerciseEstimateZ>
