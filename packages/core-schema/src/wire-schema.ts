import { zodToJsonSchema } from 'zod-to-json-schema'
import { VisionPayloadZ } from './vision-payload.js'

/**
 * The wire schema — the JSON Schema each provider is asked to constrain its
 * output to.
 *
 * Derived from the SAME Zod schema that validates the response client-side, so
 * the two can never drift apart: a field added to VisionPayloadZ appears here on
 * the next build, not when someone remembers to copy it.
 *
 * This is the draft-07 base. Providers each accept a different dialect, and
 * those adaptations live in @nutai/prompt (wire-transforms.ts) next to the
 * request builders that use them — this package stays provider-ignorant.
 */
export const VISION_WIRE_SCHEMA: Record<string, unknown> = zodToJsonSchema(VisionPayloadZ, {
  // Inline everything. $refs survive in draft-07 but die in every provider's
  // structured-output dialect.
  $refStrategy: 'none',
  target: 'jsonSchema7',
}) as Record<string, unknown>
