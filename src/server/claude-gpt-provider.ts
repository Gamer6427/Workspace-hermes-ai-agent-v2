/**
 * Claude-GPT Provider Adapter
 *
 * Calls the custom claude-gpt API endpoint:
 * GET https://claude-gpt-by-noneusr.onrender.com/api/ai/{MODEL}/message/{MESSAGE}?token={TOKEN}
 *
 * Supported models: claude-opus-4.7, claude-opus-4.y, claude-opus-4.8
 *
 * The upstream API returns a single JSON payload instead of a true stream:
 * { response: string, credits_remaining?: number, tokens_used?: number }
 * Workspace consumes `response` as the assistant message and pseudo-streams it
 * to preserve the existing chat UX without changing session/memory/skills/jobs.
 */

export const CLAUDE_GPT_BASE_URL =
  'https://claude-gpt-by-noneusr.onrender.com/api/ai'

export const CLAUDE_GPT_MODEL_IDS = [
  'claude-opus-4.7',
  'claude-opus-4.y',
  'claude-opus-4.8',
] as const

export type ClaudeGptModelId = (typeof CLAUDE_GPT_MODEL_IDS)[number]

export function isClaudeGptModel(model: string): boolean {
  return CLAUDE_GPT_MODEL_IDS.includes(model as ClaudeGptModelId)
}

export function getClaudeGptModelName(model: string): string {
  if (model === 'claude-opus-4.7') return 'Claude Opus 4.7'
  if (model === 'claude-opus-4.y') return 'Claude Opus 4.y'
  if (model === 'claude-opus-4.8') return 'Claude Opus 4.8'
  return model
}

type ClaudeGptResponse = {
  response?: string
  model?: string
  credits_remaining?: number
  tokens_used?: number
  message?: string
  error?: string
}

function getToken(): string {
  return process.env.MODEL_API_TOKEN ?? ''
}

export const CLAUDE_GPT_TIMEOUT_MS =
  Number.parseInt(process.env.CLAUDE_GPT_TIMEOUT_MS ?? '', 10) || 45_000

const MAX_RETRIES =
  Number.parseInt(process.env.CLAUDE_GPT_MAX_RETRIES ?? '', 10) || 2
const RETRY_DELAY_MS =
  Number.parseInt(process.env.CLAUDE_GPT_RETRY_DELAY_MS ?? '', 10) || 1_000

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function buildRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(CLAUDE_GPT_TIMEOUT_MS)
  if (!signal) return timeoutSignal
  return AbortSignal.any([signal, timeoutSignal])
}

function extractErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as ClaudeGptResponse
    if (typeof parsed.error === 'string' && parsed.error.trim())
      return parsed.error.trim()
    if (typeof parsed.message === 'string' && parsed.message.trim())
      return parsed.message.trim()
  } catch {
    // body is not JSON
  }
  if (status === 400) return 'Claude-GPT rejected the request.'
  if (status === 401 || status === 403)
    return 'Invalid or expired API token. Please check your MODEL_API_TOKEN.'
  if (status === 404) return 'Claude-GPT model or endpoint not found.'
  if (status === 408) return 'Claude-GPT request timed out.'
  if (status === 429)
    return 'Claude-GPT rate limit exceeded — please wait a moment and try again.'
  if (status >= 500) return 'Claude-GPT service is temporarily unavailable.'
  return body || `Claude-GPT request failed with HTTP ${status}`
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function normalizeFetchError(error: unknown): Error {
  if (isAbortError(error)) return error as Error
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Error(
      `Claude-GPT request timed out after ${CLAUDE_GPT_TIMEOUT_MS}ms.`,
    )
  }
  if (error instanceof Error) return error
  return new Error(String(error))
}

/**
 * Call the Claude-GPT API and return the full response text.
 * Retries transient network/timeout/429/5xx failures using exponential backoff.
 */
export async function callClaudeGpt(
  model: string,
  message: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokensUsed?: number; creditsRemaining?: number }> {
  if (!isClaudeGptModel(model)) {
    throw new Error(`Unsupported Claude-GPT model: ${model}`)
  }

  const token = getToken()
  if (!token) {
    throw new Error(
      'MODEL_API_TOKEN is not configured. Add it to your workspace environment before using Claude-GPT models.',
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
      await sleep(RETRY_DELAY_MS * 2 ** (attempt - 1), signal)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: buildRequestSignal(signal),
      })
    } catch (err) {
      const normalized = normalizeFetchError(err)
      if (isAbortError(normalized) && signal?.aborted) throw normalized
      lastError = normalized
      if (attempt < MAX_RETRIES) continue
      throw normalized
    }

    if (response.ok) {
      let data: ClaudeGptResponse
      try {
        data = (await response.json()) as ClaudeGptResponse
      } catch {
        throw new Error('Claude-GPT API returned invalid JSON.')
      }
      const text = typeof data.response === 'string' ? data.response : ''
      if (!text) throw new Error('Claude-GPT API returned an empty response.')
      return {
        text,
        tokensUsed:
          typeof data.tokens_used === 'number' ? data.tokens_used : undefined,
        creditsRemaining:
          typeof data.credits_remaining === 'number'
            ? data.credits_remaining
            : undefined,
      }
    }

    const bodyText = await response.text().catch(() => '')
    const errMsg = extractErrorMessage(bodyText, response.status)
    lastError = new Error(errMsg)

    if (shouldRetryStatus(response.status) && attempt < MAX_RETRIES) {
      console.warn(
        `[claude-gpt] HTTP ${response.status} on attempt ${attempt + 1}; retrying…`,
      )
      continue
    }

    throw lastError
  }

  throw lastError ?? new Error('Claude-GPT request failed after retries.')
}

/**
 * Pseudo-stream the Claude-GPT response by splitting into word chunks.
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
    await sleep(15, signal).catch(() => undefined)
  }
}
