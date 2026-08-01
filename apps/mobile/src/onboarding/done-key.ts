/**
 * The one kv-store key in the app. Lives in its own module because THREE
 * different layers need it (root layout gate, onboarding persist, backup
 * restore) — importing it from the root layout created a require cycle
 * (layout → screens → repo/backup → layout) that Metro warns about on iOS
 * and that is not worth trusting on Android release builds.
 */
export const ONBOARDING_DONE_KEY = 'onboarding.completed.v1'
