import { z } from 'zod'

/**
 * A transcribed food receipt.
 *
 * Receipt mode is for the meal you did not photograph: the model transcribes
 * the LINE ITEMS (transcription, same discipline as the label scanner), and the
 * web-lookup machinery then fetches each item's published nutrition using the
 * merchant as the brand. The receipt itself contributes no numbers — only names,
 * quantities, and the merchant.
 */

export const ReceiptItemZ = z.object({
  /** The line item as printed, cleaned of PLU codes: "MCCHICKEN", "LG FRY". */
  name: z.string().min(1),
  quantity: z.number().positive().max(20),
})

export const ReceiptPayloadZ = z.object({
  /** The restaurant or store, from the receipt header. */
  merchant: z.string().nullable(),
  /** Food and drink lines ONLY — no tax, no totals, no napkins or toys. */
  items: z.array(ReceiptItemZ).max(12),
})

export type ReceiptPayload = z.infer<typeof ReceiptPayloadZ>
