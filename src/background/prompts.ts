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

export function buildSummarySystem(language: Settings['language']): string {
  return [
    '당신은 유튜브 영상 요약 도우미입니다.',
    '핵심 주장, 근거, 결론을 빠뜨리지 말고 명확하게 요약하세요.',
    '불릿 목록과 짧은 단락을 섞어 읽기 쉽게 작성하세요.',
    languageInstruction(language),
  ].join('\n')
}

export function buildSummaryUser(meta: VideoMeta, transcriptText: string): string {
  return `영상 제목: ${meta.title}\n\n다음 자막 전체를 요약해 주세요:\n\n${transcriptText}`
}

export function buildMapUser(chunkText: string): string {
  return `다음은 긴 영상 자막의 일부입니다. 이 부분의 핵심 내용을 5문장 이내로 요약하세요:\n\n${chunkText}`
}

export function buildReduceUser(meta: VideoMeta, partials: string[]): string {
  const joined = partials.map((p, i) => `[부분 ${i + 1}]\n${p}`).join('\n\n')
  return `영상 제목: ${meta.title}\n\n다음은 영상을 구간별로 나눠 요약한 부분 요약들입니다. 이를 통합해 전체 영상의 최종 요약을 작성하세요:\n\n${joined}`
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

export function buildChatSystem(
  language: Settings['language'],
  meta: VideoMeta,
  transcriptContext: string,
): string {
  return [
    '당신은 유튜브 영상 내용에 대해 답하는 도우미입니다.',
    '아래 자막에 근거해서만 답하고, 자막에 없는 내용은 모른다고 하세요.',
    `영상 제목: ${meta.title}`,
    '자막:',
    transcriptContext,
    languageInstruction(language),
  ].join('\n')
}
