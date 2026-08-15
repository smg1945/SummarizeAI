import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'
import { DEFAULT_SETTINGS } from './types'

const store: Record<string, unknown> = {}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj)
        }),
      },
    },
  })
})

describe('loadSettings', () => {
  it('저장된 값이 없으면 기본값을 돌려준다', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('저장된 값을 기본값 위에 병합한다 (누락 필드는 기본값 유지)', async () => {
    store.settings = { model: 'qwen2.5-7b' }
    const s = await loadSettings()
    expect(s.model).toBe('qwen2.5-7b')
    expect(s.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
  })
})

describe('saveSettings', () => {
  it('저장 후 다시 읽으면 같은 값이 나온다', async () => {
    const next = { baseUrl: 'http://127.0.0.1:1234', model: 'm', language: 'en' as const }
    await saveSettings(next)
    expect(await loadSettings()).toEqual(next)
  })
})
