export interface TranscriptSegment {
  start: number // 초 단위
  duration: number // 초 단위
  text: string
}

export interface VideoMeta {
  videoId: string
  title: string
  durationSec: number
}

export interface Chapter {
  startTime: number // 초 단위
  title: string
  summary: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type Provider = 'lmstudio' | 'gemini' | 'claude' | 'openai'

export interface Settings {
  provider: Provider
  language: 'ko' | 'en' | 'auto'
  lmstudio: { baseUrl: string; model: string } // model 빈 문자열이면 LM Studio가 로드한 기본 모델 사용
  gemini: { apiKey: string; model: string }
  claude: { apiKey: string; model: string }
  openai: { apiKey: string; model: string }
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'lmstudio',
  language: 'ko',
  lmstudio: { baseUrl: 'http://localhost:1234', model: '' },
  gemini: { apiKey: '', model: 'gemini-2.5-flash' },
  claude: { apiKey: '', model: 'claude-haiku-4-5' },
  openai: { apiKey: '', model: 'gpt-4o-mini' },
}
