import { ANTHROPIC_OAUTH_BETA } from './providers.js'
import type { ProviderId, ProviderRequest } from './providers.js'

/**
 * The shared shape behind every "one image in, one JSON object out" call: the
 * label scanner and the receipt scanner. No tools, no structured-output mode —
 * the instruction demands bare JSON and the caller validates with Zod.
 */
export interface VisionJsonInput {
  model: string
  imageBase64: string
  instruction: string
  maxTokens?: number
}

export function buildVisionJsonRequest(
  provider: ProviderId,
  input: VisionJsonInput,
  credential: { kind: 'api_key' | 'oauth'; value: string },
  promptVersion: string,
): ProviderRequest {
  const maxTokens = input.maxTokens ?? 1024

  if (provider === 'anthropic') {
    const headers: Record<string, string> =
      credential.kind === 'api_key'
        ? { 'x-api-key': credential.value, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
        : {
            authorization: `Bearer ${credential.value}`,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': ANTHROPIC_OAUTH_BETA,
            'content-type': 'application/json',
          }
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers,
      body: {
        model: input.model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.imageBase64 } },
              { type: 'text', text: input.instruction },
            ],
          },
        ],
      },
      promptVersion,
    }
  }

  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { authorization: `Bearer ${credential.value}`, 'content-type': 'application/json' },
      body: {
        model: input.model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${input.imageBase64}` } },
              { type: 'text', text: input.instruction },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      },
      promptVersion,
    }
  }

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    headers: { 'x-goog-api-key': credential.value, 'content-type': 'application/json' },
    body: {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: input.imageBase64 } },
            { text: input.instruction },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
    },
    promptVersion,
  }
}
