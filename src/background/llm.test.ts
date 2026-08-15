import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmUnreachableError, completeChat, parseSseLine, streamChat } from './llm'
import { DEFAULT_SETTINGS } from '../shared/types'

function sseResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`

afterEach(() => vi.unstubAllGlobals())

describe('parseSseLine', () => {
  it('delta content를 추출한다', () => {
    expect(parseSseLine(delta('안녕').trim())).toBe('안녕')
  })
  it('[DONE], 빈 줄, 비 data 줄은 null', () => {
    expect(parseSseLine('data: [DONE]')).toBeNull()
    expect(parseSseLine('')).toBeNull()
    expect(parseSseLine(': keep-alive')).toBeNull()
  })
  it('content 없는 delta(role만 있는 첫 청크)는 null', () => {
    expect(parseSseLine(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}`)).toBeNull()
  })
})

describe('streamChat', () => {
  it('SSE 스트림을 delta 단위로 yield한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(delta('안') + delta('녕') + 'data: [DONE]\n')))
    const out: string[] = []
    for await (const d of streamChat(DEFAULT_SETTINGS, [{ role: 'user', content: 'hi' }])) {
      out.push(d)
    }
    expect(out).toEqual(['안', '녕'])
  })

  it('서버에 연결할 수 없으면 LlmUnreachableError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    await expect(async () => {
      for await (const _ of streamChat(DEFAULT_SETTINGS, [])) void _
    }).rejects.toThrow(LlmUnreachableError)
  })

  it('model이 빈 문자열이면 요청 body에 model 필드를 넣지 않는다', async () => {
    const fetchMock = vi.fn(async () => sseResponse('data: [DONE]\n'))
    vi.stubGlobal('fetch', fetchMock)
    for await (const _ of streamChat({ ...DEFAULT_SETTINGS, model: '' }, [])) void _
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body)
    expect('model' in body).toBe(false)
  })
})

describe('completeChat', () => {
  it('전체 스트림을 이어붙여 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(delta('가나') + delta('다') + 'data: [DONE]\n')))
    expect(await completeChat(DEFAULT_SETTINGS, [])).toBe('가나다')
  })
})
