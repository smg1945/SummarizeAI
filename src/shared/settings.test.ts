import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'
import { DEFAULT_SETTINGS, type Settings } from './types'

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

  it('공급자별 설정을 기본값 위에 병합한다 (누락 필드는 기본값 유지)', async () => {
    store.settings = { provider: 'claude', claude: { apiKey: 'sk-test' } }
    const s = await loadSettings()
    expect(s.provider).toBe('claude')
    expect(s.claude.apiKey).toBe('sk-test')
    expect(s.claude.model).toBe(DEFAULT_SETTINGS.claude.model)
    expect(s.lmstudio).toEqual(DEFAULT_SETTINGS.lmstudio)
  })

  it('구버전 설정(baseUrl/model)을 lmstudio로 이전한다', async () => {
    store.settings = { baseUrl: 'http://127.0.0.1:5555', model: 'old-model', language: 'en' }
    const s = await loadSettings()
    expect(s.provider).toBe('lmstudio')
    expect(s.lmstudio).toEqual({ baseUrl: 'http://127.0.0.1:5555', model: 'old-model' })
    expect(s.language).toBe('en')
  })
})

describe('saveSettings', () => {
  it('저장 후 다시 읽으면 같은 값이 나온다', async () => {
    const next: Settings = {
      provider: 'gemini',
      language: 'en',
      lmstudio: { baseUrl: 'http://127.0.0.1:1234', model: 'm' },
      gemini: { apiKey: 'g-key', model: 'gemini-2.5-flash' },
      claude: { apiKey: '', model: 'claude-haiku-4-5' },
      openai: { apiKey: '', model: 'gpt-4o-mini' },
    }
    await saveSettings(next)
    expect(await loadSettings()).toEqual(next)
  })
})
