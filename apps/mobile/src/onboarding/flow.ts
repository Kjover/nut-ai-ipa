/**
 * The onboarding flow, as data.
 *
 * Keeping the order in one place is what makes the progress bar honest: every
 * screen derives its own position from this array rather than hardcoding a
 * number, so inserting or removing a screen can never leave the bar lying.
 */
export const FLOW = [
  'sex',
  'workouts',
  'birth',
  'height',
  'weight',
  'trend',
  'professional',
  'goal',
  'desired-weight',
  'potential',
  'blocker',
  'diet',
  'accomplish',
  'rollover',
  'health',
  'thanks',
  'notifications',
  'generate',
] as const

export type Step = (typeof FLOW)[number]

export const TOTAL_STEPS = FLOW.length

export function stepIndex(step: Step): number {
  return FLOW.indexOf(step) + 1
}

export function nextRoute(step: Step): string {
  const i = FLOW.indexOf(step)
  const next = FLOW[i + 1]
  return next ? `/onboarding/${next}` : '/onboarding/plan'
}
