import { formatTime } from '../shared/format'
import type { TranscriptChunk } from './pipeline'
import type { Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export function languageInstruction(language: Settings['language']): string {
  switch (language) {
    case 'ko':
      return '반드시 한국어로 답하세요.'
    case 'en':
      return 'You must answer in English.'
    case 'auto':
      return '자막과 같은 언어로 답하세요.'
  }
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(' ')
}

const ARTICLE_RULES = [
  '당신은 유튜브 영상 내용을 읽기 좋은 아티클로 재구성하는 전문 에디터입니다.',
  '다음 구조로 상세한 아티클을 작성하세요:',
  '- 첫 문단: 영상 전체의 핵심 주제와 결론을 2~3문장으로 소개',
  '- 이어서 내용 흐름에 따라 3~6개의 섹션으로 나누고, 각 섹션은 "## 소제목"으로 시작',
  '- 각 섹션에서 해당 주제의 논지, 근거, 구체적인 예시를 2~5문장으로 충분히 설명',
  '- 나열이 자연스러운 곳에는 불릿 목록 사용, 핵심 용어나 문장은 **볼드**로 강조',
  '금지: "다음은 요약입니다", "제공된 내용을 바탕으로", "이상입니다" 같은 메타 서두·맺음 문구를 절대 쓰지 마세요. 바로 본문으로 시작하고 본문으로 끝내세요.',
]

export function buildSummarySystem(language: Settings['language']): string {
  return [...ARTICLE_RULES, languageInstruction(language)].join('\n')
}

export function buildSummaryUser(meta: VideoMeta, transcriptText: string): string {
  return `영상 제목: ${meta.title}\n\n다음 자막 전체를 바탕으로 아티클을 작성해 주세요:\n\n${transcriptText}`
}

export function buildMapUser(chunkText: string): string {
  return `다음은 긴 영상 자막의 일부입니다. 이 부분의 핵심 내용(주장, 근거, 예시)을 빠뜨리지 말고 상세히 정리하세요. 메타 문구 없이 내용만 쓰세요:\n\n${chunkText}`
}

export function buildReduceUser(meta: VideoMeta, partials: string[]): string {
  const joined = partials.map((p, i) => `[부분 ${i + 1}]\n${p}`).join('\n\n')
  return `영상 제목: ${meta.title}\n\n다음은 영상을 구간별로 나눠 정리한 내용입니다. 이를 통합해 하나의 완결된 아티클로 작성하세요:\n\n${joined}`
}

const CHAPTER_GROUP_MAX_CHARS = 3000

export function buildChaptersSystem(language: Settings['language']): string {
  return [
    '당신은 유튜브 영상의 챕터(구간별 목차)를 만드는 도우미입니다.',
    '반드시 JSON 배열만 출력하세요. 다른 텍스트를 덧붙이지 마세요.',
    '형식: [{"startTime": 초단위숫자, "title": "구간 제목", "summary": "한 줄 요약"}]',
    'startTime은 각 구간에 표기된 "시작" 초 값을 그대로 사용하세요.',
    languageInstruction(language),
  ].join('\n')
}

export function buildChaptersUser(meta: VideoMeta, groups: TranscriptChunk[]): string {
  const body = groups
    .map(
      (g, i) =>
        `구간 ${i + 1} (시작: ${Math.round(g.startTime)}초, ${formatTime(g.startTime)}):\n${g.text.slice(0, CHAPTER_GROUP_MAX_CHARS)}`,
    )
    .join('\n\n')
  return `영상 제목: ${meta.title}\n\n다음 구간별 자막을 보고 각 구간의 챕터를 만들어 주세요:\n\n${body}`
}

// 추천 질문 생성에는 전체 자막이 필요 없다 — 주제 파악에 충분한 만큼만 사용
const SUGGEST_CONTEXT_CHARS = 16000
const SUGGEST_HISTORY_CHARS = 300

export function buildSuggestSystem(language: Settings['language']): string {
  return [
    '당신은 유튜브 영상 시청자가 다음에 궁금해할 만한 질문을 제안하는 도우미입니다.',
    '반드시 JSON 문자열 배열만 출력하세요. 다른 텍스트를 덧붙이지 마세요.',
    '형식: ["질문1", "질문2", "질문3"]',
    '각 질문은 영상 내용에 근거한 짧고 구체적인 한 문장으로 쓰세요.',
    '이미 대화에서 다룬 질문과 겹치지 않는 새로운 질문을 제안하세요.',
    languageInstruction(language),
  ].join('\n')
}

export function buildSuggestUser(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  history: { role: string; content: string }[],
): string {
  const context = transcriptToText(segments).slice(0, SUGGEST_CONTEXT_CHARS)
  const parts = [`영상 제목: ${meta.title}`, `자막:\n${context}`]
  if (history.length) {
    const recent = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? '질문' : '답변'}: ${m.content.slice(0, SUGGEST_HISTORY_CHARS)}`)
      .join('\n')
    parts.push(`지금까지의 대화:\n${recent}`)
  }
  parts.push('이 영상에 대해 시청자가 물어볼 만한 질문 3개를 제안해 주세요.')
  return parts.join('\n\n')
}

export function buildChatSystem(
  language: Settings['language'],
  meta: VideoMeta,
  transcriptContext: string,
  summary?: string,
): string {
  return [
    '당신은 유튜브 영상 내용에 대해 답하는 도우미입니다.',
    '아래 자막에 근거해서만 답하고, 자막에 없는 내용은 모른다고 하세요.',
    `영상 제목: ${meta.title}`,
    ...(summary ? [`영상 요약:\n${summary}`] : []),
    '자막:',
    transcriptContext,
    languageInstruction(language),
  ].join('\n')
}
