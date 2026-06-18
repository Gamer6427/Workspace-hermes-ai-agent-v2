import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLAUDE_GPT_MODEL_IDS,
  callClaudeGpt,
  getClaudeGptModelName,
  isClaudeGptModel,
} from './claude-gpt-provider'

const originalToken = process.env.MODEL_API_TOKEN

describe('claude-gpt provider adapter', () => {
  beforeEach(() => {
    process.env.MODEL_API_TOKEN = 'test-token'
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.MODEL_API_TOKEN
    else process.env.MODEL_API_TOKEN = originalToken
    vi.restoreAllMocks()
  })

  it('registers the requested Claude-GPT model ids', () => {
    expect(CLAUDE_GPT_MODEL_IDS).toContain('claude-opus-4.7')
    expect(CLAUDE_GPT_MODEL_IDS).toContain('claude-opus-4.y')
    expect(isClaudeGptModel('claude-opus-4.7')).toBe(true)
    expect(isClaudeGptModel('claude-opus-4.y')).toBe(true)
    expect(getClaudeGptModelName('claude-opus-4.y')).toBe('Claude Opus 4.y')
  })

  it('uses data.response as assistant text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              credits_remaining: 999992,
              message: 'yo',
              model: 'claude-opus-4.8',
              response: "Hey! What's up?",
              tokens_used: 2,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    )

    await expect(callClaudeGpt('claude-opus-4.7', 'yo')).resolves.toEqual({
      text: "Hey! What's up?",
      tokensUsed: 2,
      creditsRemaining: 999992,
    })
  })

  it('retries transient HTTP failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: 'Recovered' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callClaudeGpt('claude-opus-4.y', 'hello'),
    ).resolves.toMatchObject({
      text: 'Recovered',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('requires MODEL_API_TOKEN', async () => {
    delete process.env.MODEL_API_TOKEN
    await expect(callClaudeGpt('claude-opus-4.7', 'yo')).rejects.toThrow(
      /MODEL_API_TOKEN/,
    )
  })
})
