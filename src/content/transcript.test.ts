import { describe, expect, it, vi, afterEach } from 'vitest'
import { parseJson3, pickCaptionTrack, fetchTranscript, toJson3Url, transcriptErrorMessage } from './transcript'

describe('pickCaptionTrack', () => {
  const ko = { baseUrl: 'u1', languageCode: 'ko' }
  const en = { baseUrl: 'u2', languageCode: 'en' }
  const koAsr = { baseUrl: 'u3', languageCode: 'ko', kind: 'asr' }
  const ja = { baseUrl: 'u4', languageCode: 'ja' }

  it('한국어 수동 자막을 최우선으로 고른다', () => {
    expect(pickCaptionTrack([en, koAsr, ko])).toBe(ko)
  })
  it('한국어가 없으면 영어 수동', () => {
    expect(pickCaptionTrack([ja, en])).toBe(en)
  })
  it('수동이 없으면 자동생성(asr)이라도 고른다', () => {
    expect(pickCaptionTrack([koAsr])).toBe(koAsr)
  })
  it('빈 배열이면 null', () => {
    expect(pickCaptionTrack([])).toBeNull()
  })
})

describe('parseJson3', () => {
  it('events를 초 단위 세그먼트로 정규화한다', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '안녕' }, { utf8: '하세요' }] },
        { tStartMs: 2500, dDurationMs: 1500, segs: [{ utf8: '반가워요\n' }] },
        { tStartMs: 4000, dDurationMs: 100 }, // segs 없는 이벤트는 무시
        { tStartMs: 5000, dDurationMs: 100, segs: [{ utf8: '\n' }] }, // 공백뿐이면 무시
      ],
    }
    expect(parseJson3(data)).toEqual([
      { start: 0, duration: 2, text: '안녕하세요' },
      { start: 2.5, duration: 1.5, text: '반가워요' },
    ])
  })
})

describe('toJson3Url', () => {
  it('기존 fmt 파라미터를 json3로 교체한다', () => {
    const url = toJson3Url('https://www.youtube.com/api/timedtext?v=abc&fmt=srv3&lang=ko')
    expect(url).toContain('fmt=json3')
    expect(url).not.toContain('fmt=srv3')
  })
  it('fmt가 없으면 json3를 추가한다', () => {
    expect(toJson3Url('https://www.youtube.com/api/timedtext?v=abc')).toContain('fmt=json3')
  })
})

describe('fetchTranscript', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const playerJson = (captions: boolean) => ({
    videoDetails: { title: 'Test', lengthSeconds: '60' },
    ...(captions
      ? {
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&fmt=srv3',
                  languageCode: 'ko',
                  kind: 'asr',
                },
              ],
            },
          },
        }
      : {}),
  })

  it('InnerTube player 응답의 자막을 json3로 받아 세그먼트와 메타를 돌려준다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(true)) })
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '안녕' }] }] }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchTranscript('test-video-id')
    expect(result).toEqual({
      ok: true,
      segments: [{ start: 0, duration: 1, text: '안녕' }],
      meta: { videoId: 'test-video-id', title: 'Test', durationSec: 60 },
    })
    // player 요청은 ANDROID 클라이언트 POST, 자막 요청은 fmt=json3로 교체된 URL
    const playerCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(playerCall[1].method).toBe('POST')
    expect(String(playerCall[1].body)).toContain('"clientName":"ANDROID"')
    const captionUrl = fetchMock.mock.calls[1][0] as unknown as string
    expect(captionUrl).toContain('fmt=json3')
    expect(captionUrl).not.toContain('fmt=srv3')
  })

  it('자막 응답이 JSON이 아니면 caption_fetch_failed', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(true)) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.reject(new Error('Invalid JSON')) })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'caption_fetch_failed' })
  })

  it('자막 본문이 비어 있으면 caption_fetch_failed', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(true)) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'caption_fetch_failed' })
  })

  it('네트워크 오류면 network', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'network' })
  })

  it('playabilityStatus가 OK가 아니면(ERROR/UNPLAYABLE) unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ playabilityStatus: { status: 'UNPLAYABLE' } }),
      }),
    ))
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('playerResponse에 captionTracks가 없으면 no_captions', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(false)) })
      }
      throw new Error('Should not fetch caption URL')
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'no_captions' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('연령 제한(LOGIN_REQUIRED)이면 로그인 쿠키로 WEB 클라이언트에 재시도한다', async () => {
    vi.stubGlobal('document', { cookie: 'SAPISID=abc123; OTHER=x' })
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('youtubei/v1/player')) {
        const body = String(init?.body)
        if (body.includes('"clientName":"ANDROID"')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(true)) })
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'こんにちは' }] }] }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchTranscript('test-video-id')
    expect(result.ok && result.segments).toEqual([{ start: 0, duration: 1, text: 'こんにちは' }])

    const webCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(String(webCall[1].body)).toContain('"clientName":"WEB"')
    expect(webCall[1].credentials).toBe('include')
    expect((webCall[1].headers as Record<string, string>).Authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/)
    // 자막 URL도 로그인 쿠키를 포함해 요청
    const capCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(capCall[1].credentials).toBe('include')
  })

  it('LOGIN_REQUIRED인데 로그인 쿠키가 없으면 WEB 재시도 없이 login_required', async () => {
    vi.stubGlobal('document', { cookie: '' })
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'login_required' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('로그인 재시도 후에도 트랙이 없으면 no_captions', async () => {
    vi.stubGlobal('document', { cookie: 'SAPISID=abc123' })
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const android = String(init?.body).includes('"clientName":"ANDROID"')
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            android ? { playabilityStatus: { status: 'LOGIN_REQUIRED' } } : playerJson(false),
          ),
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toEqual({ ok: false, reason: 'no_captions' })
  })
})

describe('transcriptErrorMessage', () => {
  it('사유별로 다른 안내 문구를 돌려준다', () => {
    const reasons = ['no_captions', 'login_required', 'unavailable', 'caption_fetch_failed', 'network'] as const
    const msgs = reasons.map(transcriptErrorMessage)
    expect(new Set(msgs).size).toBe(reasons.length)
    expect(transcriptErrorMessage('login_required')).toContain('로그인')
    expect(transcriptErrorMessage('no_captions')).toContain('자막이 없');
  })
})
