import * as ImageManipulator from 'expo-image-manipulator'
import { SEEDED_BASELINES } from '@nutai/confidence'
import { VISION_WIRE_SCHEMA, WebLookupResultZ } from '@nutai/core-schema'
import type { PersonalPriors } from '@nutai/gram-engine'
import {
  anthropicWireSchema,
  cheapestModel,
  geminiWireSchema,
  openAiWireSchema,
  type ProviderId,
} from '@nutai/prompt'
import { runPipeline, validatePayload, type ScanResult } from '@nutai/pipeline'
import { openNutritionDb } from '../db/expo-adapter'
import { loadFoodDb } from '../db/portions'
import { setting } from '../data/repo'
import { loadCredential, type StoredCredential } from '../inference/credentials'
import { runScanWithFallback, runWebLookup } from '../inference/pathA/client'
import { applyWebOption, setPhase, setWebLookup } from './store'

/**
 * The scan orchestrator — capture in, ready-to-review meal out.
 *
 * This file is the reason the shutter can navigate IMMEDIATELY: everything
 * here runs behind the result screen's progress states, and every exit is a
 * named phase — never a silent dead end. The sequence:
 *
 *   preparing    resize + EXIF-bake + base64 (local, fast)
 *   identifying  the one model call — the only stage that owns wall-clock time
 *   matching     the deterministic pipeline against the bundled USDA corpus
 *   ready        review screen, editable rows
 *   (background) web-search refinement for items the corpus missed
 *
 * D16 note: the refinement stage transcribes published nutrition facts with a
 * source URL. It replaces AI-estimate rows — the weakest rows on the screen —
 * with cited label data, and never touches a row the database already matched.
 */

const EMPTY_PRIORS: PersonalPriors = { get: () => null, containers: new Map() }

/** Kept for retry, so a network blip does not re-run image preprocessing. */
let lastCapture: { photoUri: string; base64: string } | null = null

function wireSchemaFor(provider: ProviderId): Record<string, unknown> {
  if (provider === 'anthropic') return anthropicWireSchema(VISION_WIRE_SCHEMA)
  if (provider === 'openai') return openAiWireSchema(VISION_WIRE_SCHEMA)
  return geminiWireSchema(VISION_WIRE_SCHEMA)
}

async function preprocess(photoUri: string): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(photoUri)
  // Resize BEFORE encoding — the order is what bounds memory, not the format.
  ctx.resize({ width: 1024 })
  const image = await ctx.renderAsync()
  const saved = await image.saveAsync({
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!saved.base64) throw new Error('preprocess produced no base64')
  return saved.base64
}

export async function startScan(photoUri: string): Promise<void> {
  setPhase({ kind: 'analyzing', photoUri, stage: 'preparing' })

  let base64: string
  try {
    base64 = await preprocess(photoUri)
  } catch {
    setPhase({
      kind: 'failed',
      photoUri,
      message: 'Could not read the photo. Try taking it again.',
      canRetry: false,
    })
    return
  }

  lastCapture = { photoUri, base64 }
  await analyze(photoUri, base64)
}

export async function retryScan(): Promise<void> {
  if (!lastCapture) return
  const { photoUri, base64 } = lastCapture
  setPhase({ kind: 'analyzing', photoUri, stage: 'identifying' })
  await analyze(photoUri, base64)
}

async function analyze(photoUri: string, base64: string): Promise<void> {
  const provider = (await setting('provider')) as ProviderId | 'none' | ''
  if (!provider || provider === 'none') {
    setPhase({
      kind: 'failed',
      photoUri,
      message:
        'Photo scans need an API key. Add one in Profile — barcode, search and manual logging work without one.',
      canRetry: false,
      failureKind: 'no-key',
    })
    return
  }

  const credential = await loadCredential(provider)
  if (!credential) {
    setPhase({
      kind: 'failed',
      photoUri,
      message: 'Your saved key is missing. Re-enter it in Profile.',
      canRetry: false,
      failureKind: 'key-invalid',
    })
    return
  }

  const model = (await setting('provider_model')) || cheapestModel(provider).id

  setPhase({ kind: 'analyzing', photoUri, stage: 'identifying' })
  const outcome = await runScanWithFallback({
    provider,
    model,
    credential,
    imagesBase64: [base64],
    localSignalsBlock: '',
    jsonSchema: wireSchemaFor(provider),
  })

  if (!outcome.ok) {
    setPhase({
      kind: 'failed',
      photoUri,
      message: outcome.error.message,
      canRetry: outcome.error.retryable,
      failureKind: outcome.error.kind,
    })
    return
  }

  setPhase({ kind: 'analyzing', photoUri, stage: 'matching' })

  let result: ScanResult | null = null
  try {
    const nutritionDb = await openNutritionDb()
    const foodDb = await loadFoodDb(nutritionDb)
    result = await runPipeline(
      outcome.value.raw,
      {
        db: nutritionDb,
        priors: EMPTY_PRIORS,
        baselines: SEEDED_BASELINES,
        path: 'cloud',
        now: Date.now(),
      },
      foodDb,
    )
  } catch {
    result = null
  }

  if (!result) {
    setPhase({
      kind: 'failed',
      photoUri,
      message: 'The model answered in a shape we could not use. This one is on us — try once more.',
      canRetry: true,
      failureKind: 'schema-violation',
    })
    return
  }

  if (!result.isFood) {
    setPhase({
      kind: 'failed',
      photoUri,
      message: result.refusalReason || 'That photo does not look like food.',
      canRetry: false,
    })
    return
  }

  setPhase({
    kind: 'ready',
    photoUri,
    result,
    bands: result.items.map((i) => i.band),
    meta: {
      provider,
      model,
      inputTokens: outcome.value.inputTokens,
      outputTokens: outcome.value.outputTokens,
      costUsd: outcome.value.costUsd,
      promptVersion: outcome.value.promptVersion,
    },
    webLookups: {},
  })

  // Fire-and-forget: refinement upgrades rows underneath the review screen.
  void refineMisses(result, outcome.value.raw, provider, model, credential)
}

/** How many corpus misses we will pay to look up per scan. */
const MAX_LOOKUPS_PER_SCAN = 2

/**
 * Background refinement: every item the corpus missed gets one shot at being
 * upgraded from "AI estimate" to "transcribed from the brand's published
 * nutrition facts". One option auto-applies; several become a question card.
 */
async function refineMisses(
  result: ScanResult,
  rawPayload: unknown,
  provider: ProviderId,
  model: string,
  credential: StoredCredential,
): Promise<void> {
  const payload = validatePayload(rawPayload)
  const misses = result.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.resolution === 'miss')
    .slice(0, MAX_LOOKUPS_PER_SCAN)

  await Promise.all(
    misses.map(async ({ item, index }) => {
      const rowId = item.row.id
      setWebLookup(rowId, { status: 'running' })

      const source = payload?.items[index]
      const lookup = await runWebLookup(
        provider,
        {
          model,
          itemName: source?.name ?? item.row.displayName,
          brand: source?.brand ?? null,
          visualContext: source?.legible_label_text ?? null,
        },
        credential,
      )

      if (!lookup.ok) {
        setWebLookup(rowId, { status: 'failed' })
        return
      }
      const parsed = WebLookupResultZ.safeParse(lookup.raw)
      if (!parsed.success || !parsed.data.found || parsed.data.options.length === 0) {
        setWebLookup(rowId, { status: 'failed' })
        return
      }

      setWebLookup(rowId, { status: 'done', result: parsed.data })
      // Unambiguous single match: apply it. The row visibly upgrades from
      // amber AI-estimate to a cited source — that is the payoff moment.
      if (parsed.data.options.length === 1 && !parsed.data.question) {
        applyWebOption(rowId, parsed.data.options[0]!, parsed.data.source_url)
      }
    }),
  )
}

/**
 * Free-text "Other" answer on a question card: one more search, seeded with
 * what the user typed.
 */
export async function lookupOther(rowId: string, typed: string): Promise<void> {
  const provider = (await setting('provider')) as ProviderId | 'none' | ''
  if (!provider || provider === 'none') return
  const credential = await loadCredential(provider)
  if (!credential) return
  const model = (await setting('provider_model')) || cheapestModel(provider).id

  setWebLookup(rowId, { status: 'running' })
  const lookup = await runWebLookup(provider, { model, itemName: typed, brand: null }, credential)
  if (!lookup.ok) {
    setWebLookup(rowId, { status: 'failed' })
    return
  }
  const parsed = WebLookupResultZ.safeParse(lookup.raw)
  if (!parsed.success || !parsed.data.found || parsed.data.options.length === 0) {
    setWebLookup(rowId, { status: 'failed' })
    return
  }
  setWebLookup(rowId, { status: 'done', result: parsed.data })
  if (parsed.data.options.length === 1) {
    applyWebOption(rowId, parsed.data.options[0]!, parsed.data.source_url)
  }
}
