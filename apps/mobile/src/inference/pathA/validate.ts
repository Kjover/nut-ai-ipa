import type { ProviderId } from '@nutai/prompt'
import type { Credential, ScanFailure } from './client'

/**
 * Credential validation.
 *
 * THE BUG THIS FILE REPLACES: the first version validated by sending the real
 * scan request with an empty image list and a placeholder `{ type: 'object' }`
 * schema. That fails for structural reasons before authentication is ever
 * considered — OpenAI's strict mode requires `additionalProperties: false` plus
 * an explicit `required` array, Gemini rejects an empty response schema, and
 * Anthropic's structured-output mode wants a real schema too. Every provider
 * returned 400, which got reported as "your key was rejected". Valid keys failed.
 *
 * The fix is to stop validating with the scan request at all. Each provider has a
 * MODEL RETRIEVE endpoint that is free, non-billing, and answers both questions
 * that matter in one call: does this credential authenticate, and does this
 * account actually have this model.
 *
 * Anthropic is the exception, because it accepts two credential shapes:
 *   - a console API key            -> `x-api-key`
 *   - a `claude setup-token` token -> `Authorization: Bearer` + an OAuth beta header
 * A setup-token can authenticate and still lack scope for /v1/models, so both
 * shapes are tried and the result reports which one worked rather than guessing.
 */

export interface ValidationOk {
  ok: true
  /** Which header shape the provider actually accepted. */
  usedShape: 'x-api-key' | 'bearer' | 'query-param'
  modelId: string
}

export interface ValidationErr {
  ok: false
  error: ScanFailure
  /** Raw status and body snippet. Surfaced in the UI so failures are diagnosable. */
  detail: string
}

export type ValidationResult = ValidationOk | ValidationErr

const ANTHROPIC_VERSION = '2023-06-01'
/** Required for `claude setup-token` credentials, ignored for plain API keys. */
const ANTHROPIC_OAUTH_BETA = 'oauth-2025-04-20'

function classify(status: number, body: string): ScanFailure {
  if (status === 401 || status === 403) {
    return { kind: 'key-invalid', message: 'The provider rejected this credential.', retryable: false, httpStatus: status }
  }
  if (status === 402) {
    return { kind: 'quota-exhausted', message: 'The account has no credit.', retryable: false, httpStatus: status }
  }
  if (status === 404) {
    return { kind: 'model-unavailable', message: 'That model is not available on this account.', retryable: false, httpStatus: status }
  }
  if (status === 429) {
    return { kind: 'error-retryable', message: 'Rate limited. Try again shortly.', retryable: true, httpStatus: status }
  }
  if (status >= 500) {
    return { kind: 'error-retryable', message: 'The provider had a server error.', retryable: true, httpStatus: status }
  }
  return {
    kind: 'error-retryable',
    message: `Unexpected ${status} from the provider.`,
    retryable: true,
    httpStatus: status,
  }
}

async function attempt(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ status: number; body: string } | { aborted: true } | { offline: true }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
    const body = await res.text()
    return { status: res.status, body: body.slice(0, 400) }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { aborted: true }
    return { offline: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function validateCredential(
  provider: ProviderId,
  model: string,
  credential: Credential,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<ValidationResult> {
  // ---- Anthropic: try both header shapes ----------------------------------
  if (provider === 'anthropic') {
    const url = `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`

    const shapes: Array<{ shape: ValidationOk['usedShape']; headers: Record<string, string> }> =
      credential.kind === 'oauth'
        ? [
            {
              shape: 'bearer',
              headers: {
                authorization: `Bearer ${credential.value}`,
                'anthropic-version': ANTHROPIC_VERSION,
                'anthropic-beta': ANTHROPIC_OAUTH_BETA,
              },
            },
            // A token pasted into the wrong tab is the single most common
            // mistake here, so try the other shape rather than blaming the user.
            {
              shape: 'x-api-key',
              headers: { 'x-api-key': credential.value, 'anthropic-version': ANTHROPIC_VERSION },
            },
          ]
        : [
            {
              shape: 'x-api-key',
              headers: { 'x-api-key': credential.value, 'anthropic-version': ANTHROPIC_VERSION },
            },
            {
              shape: 'bearer',
              headers: {
                authorization: `Bearer ${credential.value}`,
                'anthropic-version': ANTHROPIC_VERSION,
                'anthropic-beta': ANTHROPIC_OAUTH_BETA,
              },
            },
          ]

    let last = ''
    for (const { shape, headers } of shapes) {
      const r = await attempt(url, headers, fetchImpl, timeoutMs)
      if ('offline' in r) {
        return {
          ok: false,
          error: { kind: 'offline', message: 'No connection to Anthropic.', retryable: true },
          detail: 'Network request failed before reaching the provider.',
        }
      }
      if ('aborted' in r) {
        return {
          ok: false,
          error: { kind: 'timeout-ambiguous', message: 'The check timed out.', retryable: false },
          detail: `No response within ${timeoutMs / 1000}s.`,
        }
      }
      if (r.status >= 200 && r.status < 300) return { ok: true, usedShape: shape, modelId: model }
      last = `${shape}: HTTP ${r.status} — ${r.body}`
      // A 404 means auth worked but the model is wrong; trying the other header
      // shape cannot help, so stop and say so.
      if (r.status === 404) {
        return { ok: false, error: classify(404, r.body), detail: last }
      }
    }
    return { ok: false, error: classify(401, last), detail: last }
  }

  // ---- OpenAI --------------------------------------------------------------
  if (provider === 'openai') {
    const r = await attempt(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      { authorization: `Bearer ${credential.value}` },
      fetchImpl,
      timeoutMs,
    )
    if ('offline' in r) {
      return {
        ok: false,
        error: { kind: 'offline', message: 'No connection to OpenAI.', retryable: true },
        detail: 'Network request failed before reaching the provider.',
      }
    }
    if ('aborted' in r) {
      return {
        ok: false,
        error: { kind: 'timeout-ambiguous', message: 'The check timed out.', retryable: false },
        detail: `No response within ${timeoutMs / 1000}s.`,
      }
    }
    if (r.status >= 200 && r.status < 300) return { ok: true, usedShape: 'bearer', modelId: model }
    return { ok: false, error: classify(r.status, r.body), detail: `HTTP ${r.status} — ${r.body}` }
  }

  // ---- Google --------------------------------------------------------------
  const r = await attempt(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
    { 'x-goog-api-key': credential.value },
    fetchImpl,
    timeoutMs,
  )
  if ('offline' in r) {
    return {
      ok: false,
      error: { kind: 'offline', message: 'No connection to Google.', retryable: true },
      detail: 'Network request failed before reaching the provider.',
    }
  }
  if ('aborted' in r) {
    return {
      ok: false,
      error: { kind: 'timeout-ambiguous', message: 'The check timed out.', retryable: false },
      detail: `No response within ${timeoutMs / 1000}s.`,
    }
  }
  if (r.status >= 200 && r.status < 300) return { ok: true, usedShape: 'query-param', modelId: model }
  return { ok: false, error: classify(r.status, r.body), detail: `HTTP ${r.status} — ${r.body}` }
}
