import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('parseInline', () => {
  it('**볼드**를 분리한다', () => {
    expect(parseInline('이것은 **중요한** 내용')).toEqual([
      { type: 'text', text: '이것은 ' },
      { type: 'bold', text: '중요한' },
      { type: 'text', text: ' 내용' },
    ])
  })
  it('볼드가 없으면 텍스트 하나', () => {
    expect(parseInline('그냥 텍스트')).toEqual([{ type: 'text', text: '그냥 텍스트' }])
  })
})

describe('parseMarkdown', () => {
  it('헤딩, 문단, 불릿을 블록으로 나눈다', () => {
    const blocks = parseMarkdown('## 소제목\n첫 문단입니다.\n이어지는 줄.\n\n- 항목 하나\n- 항목 둘')
    expect(blocks).toEqual([
      { type: 'heading', level: 2, inline: [{ type: 'text', text: '소제목' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: '첫 문단입니다. 이어지는 줄.' }] },
      {
        type: 'bullet',
        items: [[{ type: 'text', text: '항목 하나' }], [{ type: 'text', text: '항목 둘' }]],
      },
    ])
  })

  it('한 줄 전체가 볼드면 소제목으로 취급한다', () => {
    const blocks = parseMarkdown('**핵심 주제**\n내용입니다.')
    expect(blocks).toEqual([
      { type: 'heading', level: 3, inline: [{ type: 'bold', text: '핵심 주제' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: '내용입니다.' }] },
    ])
  })

  it('번호 목록도 불릿으로 취급한다', () => {
    const blocks = parseMarkdown('1. 첫째\n2. 둘째')
    expect(blocks).toEqual([
      {
        type: 'bullet',
        items: [[{ type: 'text', text: '첫째' }], [{ type: 'text', text: '둘째' }]],
      },
    ])
  })

  it('빈 줄로 문단을 구분한다', () => {
    const blocks = parseMarkdown('문단 하나.\n\n문단 둘.')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('paragraph')
  })
})
