import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortResponse, PortRequest } from '../shared/messages'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./pipeline', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  summarize: vi.fn(),
}))
vi.mock('./chapters', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateChapters: vi.fn(),
}))
vi.mock('./chat', () => ({ answerQuestion: vi.fn() }))
vi.mock('./cache', () => ({ getCache: vi.fn(), setCache: vi.fn() }))

import { LlmUnreachableError } from './llm'
import { summarize } from './pipeline'
import { generateChapters } from './chapters'
import { getCache, setCache } from './cache'
import { handleRequest } from './router'

const meta = { videoId: 'v1', title: 't', durationSec: 60 }
const transcript = [{ start: 0, duration: 5, text: '자막' }]
const summarizeReq: PortRequest = { kind: 'summarize', transcript, meta }

function makePost() {
  const messages: PortResponse[] = []
  return { messages, post: (m: PortResponse) => messages.push(m) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCache).mockResolvedValue(undefined)
})

describe('handleRequest: summarize', () => {
  it('delta를 스트리밍하고 done + 캐시 저장', async () => {
    vi.mocked(summarize).mockImplementation(async function* () {
      yield '요'
      yield '약'
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([
      { kind: 'delta', text: '요' },
      { kind: 'delta', text: '약' },
      { kind: 'done', text: '요약' },
    ])
    expect(setCache).toHaveBeenCalledWith('summary:v1:ko', '요약')
  })

  it('캐시가 있으면 LLM을 부르지 않고 done만 보낸다', async () => {
    vi.mocked(getCache).mockResolvedValue('캐시된 요약')
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([{ kind: 'done', text: '캐시된 요약' }])
    expect(summarize).not.toHaveBeenCalled()
  })

  it('LlmUnreachableError는 LLM_UNREACHABLE 에러 응답', async () => {
    vi.mocked(summarize).mockImplementation(async function* () {
      throw new LlmUnreachableError()
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([
      expect.objectContaining({ kind: 'error', code: 'LLM_UNREACHABLE' }),
    ])
  })

  it('abort된 뒤에는 에러 응답을 보내지 않는다', async () => {
    const controller = new AbortController()
    vi.mocked(summarize).mockImplementation(async function* () {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, controller.signal)
    expect(messages).toEqual([])
  })
})

describe('handleRequest: chapters', () => {
  it('챕터를 생성해 응답하고 JSON으로 캐시한다', async () => {
    const chapters = [{ startTime: 0, title: '도입', summary: 's' }]
    vi.mocked(generateChapters).mockResolvedValue(chapters)
    const { messages, post } = makePost()
    await handleRequest({ kind: 'chapters', transcript, meta }, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([{ kind: 'chapters', chapters }])
    expect(setCache).toHaveBeenCalledWith('chapters:v1:ko', JSON.stringify(chapters))
  })
})
