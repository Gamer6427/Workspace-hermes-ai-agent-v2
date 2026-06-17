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

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

function extractErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // body is not JSON
  }
  if (status === 429) return 'Rate limit exceeded — please wait a moment and try again.'
  if (status === 401) return 'Invalid or expired API token. Please check your MODEL_API_TOKEN.'
  if (status === 404) return 'Model or endpoint not found.'
  return body || `HTTP ${status}`
}

/**
 * Call the claude-gpt API and return the full response text.
 * Retries up to MAX_RETRIES times on 429 rate-limit responses.
 */
export async function callClaudeGpt(
  model: string,
  message: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokensUsed?: number; creditsRemaining?: number }> {
  const token = getToken()
  if (!token) {
    throw new Error(
      'MODEL_API_TOKEN is not configured. Please add it to your Replit secrets.',
    )
  }

  const trimmed = message.trim()
  if (!trimmed) {
    throw new Error('Cannot send an empty message to Claude-GPT.')
  }

  const encodedMessage = encodeURIComponent(trimmed)
  const url = `${CLAUDE_GPT_BASE_URL}/${encodeURIComponent(model)}/message/${encodedMessage}?token=${encodeURIComponent(token)}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    if (attempt > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, RETRY_DELAY_MS * attempt)
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      })
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }

    if (response.ok) {
      const data = (await response.json()) as ClaudeGptResponse
      const text =
        typeof data.response === 'string' && data.response
          ? data.response
          : typeof data.message === 'string' && data.message
            ? data.message
            : ''
      if (!text) throw new Error('Claude-GPT API returned an empty response.')
      return {
        text,
        tokensUsed: typeof data.tokens_used === 'number' ? data.tokens_used : undefined,
        creditsRemaining:
          typeof data.credits_remaining === 'number' ? data.credits_remaining : undefined,
      }
    }

    const bodyText = await response.text().catch(() => '')
    const errMsg = extractErrorMessage(bodyText, response.status)

    if (response.status === 429 && attempt < MAX_RETRIES) {
      console.warn(`[claude-gpt] 429 rate-limit on attempt ${attempt + 1}, retrying in ${RETRY_DELAY_MS * (attempt + 1)}ms…`)
      lastError = new Error(errMsg)
      continue
    }

    throw new Error(errMsg)
  }

  throw lastError ?? new Error('Claude-GPT request failed after retries.')
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
