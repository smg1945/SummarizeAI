import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('1시간 미만은 m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(425)).toBe('7:05')
  })
  it('1시간 이상은 h:mm:ss', () => {
    expect(formatTime(3723)).toBe('1:02:03')
  })
  it('소수점은 버린다', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })
})
