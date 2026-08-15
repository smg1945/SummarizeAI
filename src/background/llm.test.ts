import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LlmAuthError,
  LlmUnreachableError,
  completeChat,
  parseClaudeSseLine,
  parseSseLine,
  streamChat,
} from './llm'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

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

const claudeDelta = (text: string) =>
  `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n`

const withProvider = (overrides: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
})

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

describe('parseClaudeSseLine', () => {
  it('content_block_delta의 text_delta를 추출한다', () => {
    expect(parseClaudeSseLine(claudeDelta('안녕').trim())).toBe('안녕')
  })
  it('text_delta가 아닌 이벤트는 null', () => {
    expect(parseClaudeSseLine(`data: ${JSON.stringify({ type: 'message_start' })}`)).toBeNull()
    expect(parseClaudeSseLine(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } })}`)).toBeNull()
    expect(parseClaudeSseLine('event: message_stop')).toBeNull()
  })
})

describe('streamChat (LM Studio)', () => {
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
    for await (const _ of streamChat(DEFAULT_SETTINGS, [])) void _
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body)
    expect('model' in body).toBe(false)
  })
})

describe('streamChat (상용 공급자 라우팅)', () => {
  it('gemini는 OpenAI 호환 엔드포인트 + Bearer 키로 요청한다', async () => {
    const fetchMock = vi.fn(async () => sseResponse(delta('요약') + 'data: [DONE]\n'))
    vi.stubGlobal('fetch', fetchMock)
    const settings = withProvider({ provider: 'gemini', gemini: { apiKey: 'g-key', model: 'gemini-2.5-flash' } })
    const out: string[] = []
    for await (const d of streamChat(settings, [{ role: 'user', content: 'hi' }])) out.push(d)
    expect(out).toEqual(['요약'])
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer g-key')
    expect(JSON.parse(init.body).model).toBe('gemini-2.5-flash')
  })

  it('claude는 /v1/messages에 x-api-key로 요청하고 system을 분리한다', async () => {
    const fetchMock = vi.fn(async () => sseResponse(claudeDelta('요') + claudeDelta('약')))
    vi.stubGlobal('fetch', fetchMock)
    const settings = withProvider({ provider: 'claude', claude: { apiKey: 'sk-ant', model: 'claude-haiku-4-5' } })
    const out: string[] = []
    for await (const d of streamChat(settings, [
      { role: 'system', content: '너는 요약 도우미다' },
      { role: 'user', content: 'hi' },
    ])) {
      out.push(d)
    }
    expect(out).toEqual(['요', '약'])
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.system).toBe('너는 요약 도우미다')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('401 응답은 LlmAuthError를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    const settings = withProvider({ provider: 'openai', openai: { apiKey: 'bad', model: 'gpt-4o-mini' } })
    await expect(async () => {
      for await (const _ of streamChat(settings, [])) void _
    }).rejects.toThrow(LlmAuthError)
  })
})

describe('completeChat', () => {
  it('전체 스트림을 이어붙여 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(delta('가나') + delta('다') + 'data: [DONE]\n')))
    expect(await completeChat(DEFAULT_SETTINGS, [])).toBe('가나다')
  })
})
