import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_MAX_ENTRIES, getCache, setCache } from './cache'

const store: Record<string, unknown> = {}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string | null) => {
          if (key === null) return { ...store }
          return { [key]: store[key] }
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj)
        }),
        remove: vi.fn(async (keys: string[]) => {
          for (const k of keys) delete store[k]
        }),
      },
    },
  })
})

describe('cache', () => {
  it('저장 후 다시 읽으면 같은 값이 나온다', async () => {
    await setCache('summary:v1:ko', '요약 내용')
    expect(await getCache('summary:v1:ko')).toBe('요약 내용')
  })

  it('없는 키는 undefined', async () => {
    expect(await getCache('summary:none:ko')).toBeUndefined()
  })

  it('항목 수가 한도를 넘으면 오래된 캐시부터 삭제한다', async () => {
    for (let i = 0; i < CACHE_MAX_ENTRIES + 5; i++) {
      // 저장 시각이 구분되도록 타임스탬프를 직접 조작
      store[`summary:v${i}:ko`] = { t: i, v: `요약${i}` }
    }
    await setCache('summary:new:ko', '새 요약') // 저장이 정리를 트리거
    const cacheKeys = Object.keys(store).filter((k) => k.startsWith('summary:'))
    expect(cacheKeys.length).toBeLessThanOrEqual(CACHE_MAX_ENTRIES)
    expect(await getCache('summary:v0:ko')).toBeUndefined() // 가장 오래된 것 삭제됨
    expect(await getCache('summary:new:ko')).toBe('새 요약') // 최신은 유지
  })

  it('캐시가 아닌 키(settings 등)는 정리 대상이 아니다', async () => {
    store.settings = { provider: 'gemini' }
    for (let i = 0; i < CACHE_MAX_ENTRIES + 5; i++) {
      store[`chat:v${i}`] = { t: i, v: '[]' }
    }
    await setCache('chat:new', '[]')
    expect(store.settings).toEqual({ provider: 'gemini' })
  })
})
