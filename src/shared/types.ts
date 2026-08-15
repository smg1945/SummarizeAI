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

export interface Settings {
  baseUrl: string
  model: string // 빈 문자열이면 LM Studio가 로드한 기본 모델 사용
  language: 'ko' | 'en' | 'auto'
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://localhost:1234',
  model: '',
  language: 'ko',
}
