import { DEFAULT_SETTINGS, type Settings } from './types'

// 구버전(단일 LM Studio) 설정은 최상위에 baseUrl/model을 가짐
type StoredSettings = Partial<Settings> & { baseUrl?: string; model?: string }

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings')
  const raw = ((stored.settings as StoredSettings) ?? {}) as StoredSettings

  let lmstudio = { ...DEFAULT_SETTINGS.lmstudio, ...raw.lmstudio }
  if (raw.lmstudio === undefined && (raw.baseUrl !== undefined || raw.model !== undefined)) {
    // 구버전 설정을 lmstudio로 이전
    lmstudio = {
      baseUrl: raw.baseUrl ?? DEFAULT_SETTINGS.lmstudio.baseUrl,
      model: raw.model ?? DEFAULT_SETTINGS.lmstudio.model,
    }
  }

  return {
    provider: raw.provider ?? DEFAULT_SETTINGS.provider,
    language: raw.language ?? DEFAULT_SETTINGS.language,
    lmstudio,
    gemini: { ...DEFAULT_SETTINGS.gemini, ...raw.gemini },
    claude: { ...DEFAULT_SETTINGS.claude, ...raw.claude },
    openai: { ...DEFAULT_SETTINGS.openai, ...raw.openai },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}
