import { describe, expect, it, vi, afterEach } from 'vitest'
import { parseJson3, pickCaptionTrack, fetchTranscript, toJson3Url } from './transcript'

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

  it('자막 응답이 JSON이 아니면 null로 반환한다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(true)) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.reject(new Error('Invalid JSON')) })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toBeNull()
  })

  it('playerResponse에 captionTracks가 없으면 null로 반환한다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtubei/v1/player')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playerJson(false)) })
      }
      throw new Error('Should not fetch caption URL')
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTranscript('test-video-id')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
