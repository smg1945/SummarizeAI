import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({ completeChat: vi.fn(), streamChat: vi.fn() }))

import { completeChat } from './llm'
import { ChapterParseError, generateChapters, parseChaptersJson, segmentForChapters } from './chapters'

const meta = { videoId: 'v1', title: '테스트', durationSec: 1800 }

function segsEvery10s(totalSec: number): TranscriptSegment[] {
  return Array.from({ length: totalSec / 10 }, (_, i) => ({
    start: i * 10,
    duration: 10,
    text: `내용${i}`,
  }))
}

beforeEach(() => vi.clearAllMocks())

describe('segmentForChapters', () => {
  it('30분 영상은 6개 구간 (약 5분 단위)', () => {
    const chunks = segmentForChapters(segsEvery10s(1800), 1800)
    expect(chunks).toHaveLength(6)
    expect(chunks[0].startTime).toBe(0)
    expect(chunks[1].startTime).toBe(300)
  })

  it('짧은 영상도 최소 3개 구간', () => {
    expect(segmentForChapters(segsEvery10s(300), 300)).toHaveLength(3)
  })

  it('아주 긴 영상도 최대 12개 구간', () => {
    expect(segmentForChapters(segsEvery10s(36000), 36000)).toHaveLength(12)
  })

  it('빈 자막이면 빈 배열', () => {
    expect(segmentForChapters([], 600)).toEqual([])
  })
})

describe('parseChaptersJson', () => {
  it('앞뒤 잡담이 섞여도 JSON 배열만 추출해 파싱한다', () => {
    const text = '다음과 같습니다:\n[{"startTime": 0, "title": "도입", "summary": "소개"}]\n이상입니다.'
    expect(parseChaptersJson(text)).toEqual([{ startTime: 0, title: '도입', summary: '소개' }])
  })

  it('필수 필드가 잘못된 항목은 걸러낸다', () => {
    const text = '[{"startTime": "abc", "title": "x", "summary": "y"}, {"startTime": 5, "title": "ok", "summary": "z"}]'
    expect(parseChaptersJson(text)).toEqual([{ startTime: 5, title: 'ok', summary: 'z' }])
  })

  it('배열이 없거나 유효 항목이 0개면 null', () => {
    expect(parseChaptersJson('JSON 못 만들겠어요')).toBeNull()
    expect(parseChaptersJson('[]')).toBeNull()
  })
})

describe('generateChapters', () => {
  it('첫 응답이 파싱 실패면 1회 재시도한다', async () => {
    vi.mocked(completeChat)
      .mockResolvedValueOnce('망가진 응답')
      .mockResolvedValueOnce('[{"startTime": 0, "title": "도입", "summary": "s"}]')
    const chapters = await generateChapters(DEFAULT_SETTINGS, segsEvery10s(600), meta)
    expect(chapters).toHaveLength(1)
    expect(completeChat).toHaveBeenCalledTimes(2)
  })

  it('재시도도 실패하면 ChapterParseError', async () => {
    vi.mocked(completeChat).mockResolvedValue('여전히 망가진 응답')
    await expect(generateChapters(DEFAULT_SETTINGS, segsEvery10s(600), meta)).rejects.toThrow(
      ChapterParseError,
    )
  })
})
