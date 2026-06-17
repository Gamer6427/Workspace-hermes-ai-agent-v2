/**
 * Claude-GPT Provider
 *
 * Calls the custom claude-gpt API endpoint:
 * GET https://claude-gpt-by-noneusr.onrender.com/api/ai/{MODEL}/message/{MESSAGE}?token={TOKEN}
 *
 * Supported models: claude-opus-4.7, claude-opus-4.8
 */

export const CLAUDE_GPT_BASE_URL =
  'https://claude-gpt-by-noneusr.onrender.com/api/ai'

export const CLAUDE_GPT_MODEL_IDS = ['claude-opus-4.7', 'claude-opus-4.8'] as const

export type ClaudeGptModelId = (typeof CLAUDE_GPT_MODEL_IDS)[number]

export function isClaudeGptModel(model: string): boolean {
  return CLAUDE_GPT_MODEL_IDS.includes(model as ClaudeGptModelId)
}

type ClaudeGptResponse = {
  response?: string
  model?: string
  credits_remaining?: number
  tokens_used?: number
  message?: string
}

function getToken(): string {
  return process.env.MODEL_API_TOKEN ?? ''
}

/**
 * Call the claude-gpt API and return the full response text.
 */
export async function callClaudeGpt(
  model: string,
  message: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokensUsed?: number; creditsRemaining?: number }> {
  const token = getToken()
  if (!token) {
    throw new Error(
      'MODEL_API_TOKEN is not configured. Please add it in your environment secrets.',
    )
  }

  const encodedMessage = encodeURIComponent(message)
  const url = `${CLAUDE_GPT_BASE_URL}/${encodeURIComponent(model)}/message/${encodedMessage}?token=${encodeURIComponent(token)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    let errorText = ''
    try {
      errorText = await response.text()
    } catch {
      errorText = response.statusText
    }
    throw new Error(
      `Claude-GPT API error (${response.status}): ${errorText || response.statusText}`,
    )
  }

  const data = (await response.json()) as ClaudeGptResponse

  const text =
    typeof data.response === 'string'
      ? data.response
      : typeof data.message === 'string'
        ? data.message
        : ''

  if (!text) {
    throw new Error('Claude-GPT API returned an empty response')
  }

  return {
    text,
    tokensUsed: typeof data.tokens_used === 'number' ? data.tokens_used : undefined,
    creditsRemaining:
      typeof data.credits_remaining === 'number' ? data.credits_remaining : undefined,
  }
}

/**
 * Pseudo-stream the claude-gpt response by splitting into word-chunks.
 * Since the API returns a single JSON response (no true streaming),
 * we split the text into small chunks and yield them progressively
 * to match the streaming UX expected by the frontend.
 */
export async function* streamClaudeGpt(
  model: string,
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const { text } = await callClaudeGpt(model, message, signal)

  const CHUNK_SIZE = 8
  const words = text.split(' ')

  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    if (signal?.aborted) break
    const slice = words.slice(i, i + CHUNK_SIZE).join(' ')
    const isLast = i + CHUNK_SIZE >= words.length
    yield isLast ? slice : slice + ' '
    await new Promise<void>((resolve) => setTimeout(resolve, 15))
  }
}
