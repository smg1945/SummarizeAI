import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({ completeChat: vi.fn(), streamChat: vi.fn() }))

import { completeChat } from './llm'
import { generateSuggestions, parseQuestionsJson } from './suggest'

const meta = { videoId: 'v1', title: '테스트 영상', durationSec: 600 }
const segs = [{ start: 0, duration: 5, text: '자막 내용' }]

beforeEach(() => vi.clearAllMocks())

describe('parseQuestionsJson', () => {
  it('앞뒤 잡담이 섞여도 문자열 배열을 추출하고 3개로 자른다', () => {
    const text = '추천 질문입니다:\n["질문1", "질문2", "질문3", "질문4"]'
    expect(parseQuestionsJson(text)).toEqual(['질문1', '질문2', '질문3'])
  })

  it('문자열이 아닌 항목은 걸러낸다', () => {
    expect(parseQuestionsJson('[1, "질문", null]')).toEqual(['질문'])
  })

  it('배열이 없거나 유효 항목이 0개면 null', () => {
    expect(parseQuestionsJson('생성 실패')).toBeNull()
    expect(parseQuestionsJson('[]')).toBeNull()
  })
})

describe('generateSuggestions', () => {
  it('첫 응답이 파싱 실패면 1회 재시도한다', async () => {
    vi.mocked(completeChat)
      .mockResolvedValueOnce('망가진 응답')
      .mockResolvedValueOnce('["Q1", "Q2", "Q3"]')
    const questions = await generateSuggestions(DEFAULT_SETTINGS, segs, meta, [])
    expect(questions).toEqual(['Q1', 'Q2', 'Q3'])
    expect(completeChat).toHaveBeenCalledTimes(2)
  })

  it('재시도도 실패하면 null을 반환한다', async () => {
    vi.mocked(completeChat).mockResolvedValue('여전히 실패')
    expect(await generateSuggestions(DEFAULT_SETTINGS, segs, meta, [])).toBeNull()
  })

  it('대화 히스토리가 프롬프트에 포함된다', async () => {
    vi.mocked(completeChat).mockResolvedValue('["Q1"]')
    await generateSuggestions(DEFAULT_SETTINGS, segs, meta, [
      { role: 'user', content: '이전 질문입니다' },
      { role: 'assistant', content: '이전 답변입니다' },
    ])
    const messages = vi.mocked(completeChat).mock.calls[0][1]
    const joined = messages.map((m) => m.content).join('\n')
    expect(joined).toContain('이전 질문입니다')
  })
})
