import {
  buildAnthropicRequest,
  buildGeminiRequest,
  buildOpenAIRequest,
  computeScanCost,
  type ProviderId,
} from '@nutai/prompt'

/**
 * Path A — the cloud inference client.
 *
 * SPEC-accuracy-engine.md §3, PLAN.md D10. A thin wrapper over React Native's
 * `fetch`, deliberately NOT the vendor Node SDKs: those assume Node runtime
 * features Hermes does not guarantee. Non-streaming, one request in, one JSON
 * object out — which removes the single largest RN fetch/ReadableStream risk from
 * the core feature.
 *
 * This is the ONLY place in the app that reads an API key, and the key travels to
 * exactly one destination: the provider the user named.
 */

/**
 * Six distinct states, never a generic toast.
 *
 * Every one of these gets its own copy and its own retry policy, because "an
 * error occurred" tells a user nothing about whether to wait, pay, re-enter a
 * key, or switch paths.
 */
export type ScanFailureKind =
  | 'key-invalid'
  | 'quota-exhausted'
  | 'model-unavailable'
  | 'error-retryable'
  | 'offline'
  | 'content-refusal'
  | 'schema-violation'
  /**
   * A request that may or may not have been billed. NEVER auto-retried: no
   * provider offers an idempotency key for this endpoint, so a naive retry
   * double-bills the user for one photo.
   */
  | 'timeout-ambiguous'

export interface ScanFailure {
  kind: ScanFailureKind
  message: string
  retryable: boolean
  httpStatus?: number
}

export interface ScanSuccess {
  raw: unknown
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  promptVersion: string
}

export type ScanOutcome = { ok: true; value: ScanSuccess } | { ok: false; error: ScanFailure }

export interface Credential {
  kind: 'api_key' | 'oauth'
  value: string
}

export interface ScanRequest {
  provider: ProviderId
  model: string
  credential: Credential
  imagesBase64: readonly string[]
  localSignalsBlock: string
  jsonSchema: unknown
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 45_000

function classify(status: number, body: string): ScanFailure {
  if (status === 401 || status === 403) {
    return { kind: 'key-invalid', message: 'That key was rejected by the provider.', retryable: false, httpStatus: status }
  }
  if (status === 402) {
    return { kind: 'quota-exhausted', message: 'Your provider account is out of credit.', retryable: false, httpStatus: status }
  }
  if (status === 404) {
    return { kind: 'model-unavailable', message: 'That model is not available on your account.', retryable: false, httpStatus: status }
  }
  if (status === 429) {
    return { kind: 'error-retryable', message: 'The provider is rate-limiting. Try again shortly.', retryable: true, httpStatus: status }
  }
  if (status >= 500) {
    return { kind: 'error-retryable', message: 'The provider had a server error.', retryable: true, httpStatus: status }
  }
  if (/refus|safety|policy/i.test(body)) {
    return { kind: 'content-refusal', message: 'The provider declined to analyze this image.', retryable: false, httpStatus: status }
  }
  return { kind: 'error-retryable', message: `Unexpected response (${status}).`, retryable: true, httpStatus: status }
}

/** Pull the JSON payload out of each provider's differently-shaped envelope. */
function extractPayload(provider: ProviderId, json: unknown): { raw: unknown; inputTokens: number; outputTokens: number } | null {
  const j = json as Record<string, any>
  try {
    if (provider === 'anthropic') {
      const text = j.content?.[0]?.text
      return {
        raw: typeof text === 'string' ? JSON.parse(text) : text,
        inputTokens: j.usage?.input_tokens ?? 0,
        outputTokens: j.usage?.output_tokens ?? 0,
      }
    }
    if (provider === 'openai') {
      const text = j.choices?.[0]?.message?.content
      return {
        raw: typeof text === 'string' ? JSON.parse(text) : text,
        inputTokens: j.usage?.prompt_tokens ?? 0,
        outputTokens: j.usage?.completion_tokens ?? 0,
      }
    }
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text
    return {
      raw: typeof text === 'string' ? JSON.parse(text) : text,
      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
    }
  } catch {
    return null
  }
}

export async function runScan(req: ScanRequest, fetchImpl: typeof fetch = fetch): Promise<ScanOutcome> {
  const input = {
    model: req.model,
    imagesBase64: req.imagesBase64,
    localSignalsBlock: req.localSignalsBlock,
    jsonSchema: req.jsonSchema,
  }

  const built =
    req.provider === 'anthropic'
      ? buildAnthropicRequest(input, req.credential)
      : req.provider === 'openai'
        ? buildOpenAIRequest(input, req.credential.value)
        : buildGeminiRequest(input, req.credential.value)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const started = Date.now()

  try {
    const res = await fetchImpl(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: controller.signal,
    })

    const text = await res.text()
    if (!res.ok) return { ok: false, error: classify(res.status, text) }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, error: { kind: 'schema-violation', message: 'The provider returned malformed JSON.', retryable: false } }
    }

    const extracted = extractPayload(req.provider, json)
    if (!extracted || extracted.raw == null) {
      return { ok: false, error: { kind: 'schema-violation', message: 'The provider returned an unexpected shape.', retryable: false } }
    }

    return {
      ok: true,
      value: {
        raw: extracted.raw,
        inputTokens: extracted.inputTokens,
        outputTokens: extracted.outputTokens,
        // Real token counts, never an estimate, so the ledger shows an actual
        // dollar figure rather than a guess.
        costUsd: computeScanCost(req.provider, req.model, extracted.inputTokens, extracted.outputTokens),
        latencyMs: Date.now() - started,
        promptVersion: built.promptVersion,
      },
    }
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError'
    if (aborted) {
      // The request MAY have been billed. Never auto-retry — no provider offers
      // an idempotency key here, so a retry can double-charge for one photo. The
      // user is told, and chooses.
      return {
        ok: false,
        error: {
          kind: 'timeout-ambiguous',
          message: 'The request timed out. It may still have been charged, so we will not retry automatically.',
          retryable: false,
        },
      }
    }
    return { ok: false, error: { kind: 'offline', message: 'No connection to the provider.', retryable: true } }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Key validation probe.
 *
 * A minimal NON-BILLING request at key-entry time that confirms three things at
 * once: the credential authenticates, the account can reach the endpoint, and the
 * chosen model id exists for that account. Returns one of the six named states
 * rather than a generic failure, so the UI can say what to actually do.
 *
 * Anthropic gets special handling: a `claude setup-token` may authenticate and
 * still lack scope for /v1/messages, so both credential shapes are worth probing
 * and the result reports which one worked.
 */
export async function validateKey(
  provider: ProviderId,
  model: string,
  credential: Credential,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: ScanFailure }> {
  const probe = await runScan(
    {
      provider,
      model,
      credential,
      imagesBase64: [],
      localSignalsBlock: '',
      jsonSchema: { type: 'object' },
      timeoutMs: 15_000,
    },
    fetchImpl,
  )
  if (probe.ok) return { ok: true }
  // A schema violation on a probe still proves the credential and model work,
  // which is the only thing the probe is asking.
  if (probe.error.kind === 'schema-violation') return { ok: true }
  return { ok: false, error: probe.error }
}
