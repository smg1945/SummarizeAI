import { describe, expect, it, vi, afterEach } from 'vitest'
import { extractPlayerResponse, parseJson3, pickCaptionTrack, fetchTranscript } from './transcript'

describe('extractPlayerResponse', () => {
  it('스크립트 안의 JSON을 중괄호 균형으로 추출한다', () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"안녕 {테스트} \\"인용\\"","lengthSeconds":"120"}};var other = 1;</script>`
    const pr = extractPlayerResponse(html) as any
    expect(pr.videoDetails.title).toBe('안녕 {테스트} "인용"')
    expect(pr.videoDetails.lengthSeconds).toBe('120')
  })

  it('마커가 없으면 null', () => {
    expect(extractPlayerResponse('<html></html>')).toBeNull()
  })
})

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

describe('fetchTranscript', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('자막 응답이 JSON이 아니면 null로 반환한다', async () => {
    const watchHtml = `<html><script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Test","lengthSeconds":"60"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://example.com/api/timedtext","languageCode":"ko"}]}}};var other=1;</script></html>`

    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtube.com/watch')) {
        return Promise.resolve({
          text: () => Promise.resolve(watchHtml),
        })
      } else {
        return Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        })
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchTranscript('test-video-id')
    expect(result).toBeNull()
  })

  it('playerResponse에 captionTracks가 없으면 null로 반환한다', async () => {
    const watchHtml = `<html><script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Test","lengthSeconds":"60"}};var other=1;</script></html>`

    const fetchMock = vi.fn((url: string) => {
      if (url.includes('youtube.com/watch')) {
        return Promise.resolve({
          text: () => Promise.resolve(watchHtml),
        })
      } else {
        throw new Error('Should not fetch caption URL')
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchTranscript('test-video-id')
    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
