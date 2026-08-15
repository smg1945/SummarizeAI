import { describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({ streamChat: vi.fn(), completeChat: vi.fn() }))

import { buildChatMessages } from './chat'
import { MAX_SINGLE_PASS_CHARS } from './pipeline'

const meta = { videoId: 'v1', title: '테스트 영상', durationSec: 600 }
const segs: TranscriptSegment[] = [{ start: 0, duration: 5, text: '자막 내용입니다' }]

describe('buildChatMessages', () => {
  it('시스템 프롬프트에 제목과 자막을 넣고, 히스토리와 질문을 이어붙인다', () => {
    const messages = buildChatMessages(
      DEFAULT_SETTINGS,
      segs,
      meta,
      [
        { role: 'user', content: '이전 질문' },
        { role: 'assistant', content: '이전 답변' },
      ],
      '새 질문',
    )
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('테스트 영상')
    expect(messages[0].content).toContain('자막 내용입니다')
    expect(messages).toHaveLength(4)
    expect(messages[3]).toEqual({ role: 'user', content: '새 질문' })
  })

  it('자막이 길면 컨텍스트를 MAX_SINGLE_PASS_CHARS로 자른다', () => {
    const long: TranscriptSegment[] = [{ start: 0, duration: 5, text: 'x'.repeat(MAX_SINGLE_PASS_CHARS * 2) }]
    const messages = buildChatMessages(DEFAULT_SETTINGS, long, meta, [], '질문')
    expect(messages[0].content.length).toBeLessThan(MAX_SINGLE_PASS_CHARS * 1.5)
  })

  it('상용 공급자는 로컬 임계값보다 긴 자막도 자르지 않는다', () => {
    const long: TranscriptSegment[] = [{ start: 0, duration: 5, text: 'x'.repeat(MAX_SINGLE_PASS_CHARS * 2) }]
    const gemini = { ...DEFAULT_SETTINGS, provider: 'gemini' as const }
    const messages = buildChatMessages(gemini, long, meta, [], '질문')
    expect(messages[0].content.length).toBeGreaterThan(MAX_SINGLE_PASS_CHARS * 1.5)
  })

  it('summary가 주어지면 시스템 프롬프트에 영상 요약 섹션을 포함한다', () => {
    const messages = buildChatMessages(DEFAULT_SETTINGS, segs, meta, [], '질문', '캐시된 요약 내용')
    expect(messages[0].content).toContain('영상 요약:')
    expect(messages[0].content).toContain('캐시된 요약 내용')
  })
})
