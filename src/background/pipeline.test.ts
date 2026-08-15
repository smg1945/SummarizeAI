import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({
  streamChat: vi.fn(),
  completeChat: vi.fn(),
}))

import { completeChat, streamChat } from './llm'
import { CHUNK_CHARS, MAX_SINGLE_PASS_CHARS, chunkTranscript, summarize } from './pipeline'

const meta = { videoId: 'v1', title: '테스트 영상', durationSec: 600 }

function seg(start: number, text: string): TranscriptSegment {
  return { start, duration: 5, text }
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const d of gen) out += d
  return out
}

beforeEach(() => vi.clearAllMocks())

describe('chunkTranscript', () => {
  it('maxChars를 넘지 않게 세그먼트를 묶는다', () => {
    const segments = [seg(0, 'a'.repeat(50)), seg(10, 'b'.repeat(50)), seg(20, 'c'.repeat(50))]
    const chunks = chunkTranscript(segments, 110)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].startTime).toBe(0)
    expect(chunks[1].startTime).toBe(20)
  })

  it('단일 세그먼트가 maxChars보다 커도 자체 청크로 포함한다', () => {
    const chunks = chunkTranscript([seg(0, 'x'.repeat(500))], 100)
    expect(chunks).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('짧은 자막은 한 번에 스트리밍 요약한다 (completeChat 미호출)', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield '요약'
    })
    const result = await collect(summarize(DEFAULT_SETTINGS, [seg(0, '짧은 자막')], meta))
    expect(result).toBe('요약')
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('상용 공급자는 로컬 임계값을 넘는 긴 자막도 한 번에 스트리밍한다', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield '아티클'
    })
    const longSegments = Array.from({ length: 30 }, (_, i) =>
      seg(i * 10, 'x'.repeat(Math.ceil(MAX_SINGLE_PASS_CHARS / 20))),
    )
    const gemini = { ...DEFAULT_SETTINGS, provider: 'gemini' as const }
    const result = await collect(summarize(gemini, longSegments, meta))
    expect(result).toBe('아티클')
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('긴 자막은 map(completeChat) 후 reduce(streamChat)한다', async () => {
    vi.mocked(completeChat).mockResolvedValue('부분요약')
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield '최종요약'
    })
    const longSegments = Array.from({ length: 30 }, (_, i) =>
      seg(i * 10, 'x'.repeat(Math.ceil(MAX_SINGLE_PASS_CHARS / 20))),
    )
    const result = await collect(summarize(DEFAULT_SETTINGS, longSegments, meta))
    expect(result).toBe('최종요약')
    expect(vi.mocked(completeChat).mock.calls.length).toBeGreaterThan(1)
    // reduce 프롬프트에 부분 요약이 포함된다
    const reduceMessages = vi.mocked(streamChat).mock.calls[0][1]
    expect(reduceMessages.some((m) => m.content.includes('부분요약'))).toBe(true)
  })
})
