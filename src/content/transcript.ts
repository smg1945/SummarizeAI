import type { TranscriptSegment, VideoMeta } from '../shared/types'

export interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string // 'asr'이면 자동생성
}

const MARKER = 'ytInitialPlayerResponse = '

export function extractPlayerResponse(html: string): unknown | null {
  const idx = html.indexOf(MARKER)
  if (idx === -1) return null
  const start = idx + MARKER.length
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const manual = (lang: string) =>
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== 'asr')
  const asr = (lang: string) =>
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind === 'asr')
  return (
    manual('ko') ??
    manual('en') ??
    tracks.find((t) => t.kind !== 'asr') ??
    asr('ko') ??
    asr('en') ??
    tracks[0] ??
    null
  )
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: { utf8?: string }[]
}

export function parseJson3(data: unknown): TranscriptSegment[] {
  const events = ((data as { events?: Json3Event[] })?.events ?? []) as Json3Event[]
  const segments: TranscriptSegment[] = []
  for (const ev of events) {
    if (!ev.segs) continue
    const text = ev.segs
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim()
    if (!text) continue
    segments.push({
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 0) / 1000,
      text,
    })
  }
  return segments
}

export async function fetchTranscript(
  videoId: string,
): Promise<{ segments: TranscriptSegment[]; meta: VideoMeta } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: 'include',
    })
    const html = await res.text()
    const pr = extractPlayerResponse(html) as {
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
      videoDetails?: { title?: string; lengthSeconds?: string }
    } | null
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) return null
    const track = pickCaptionTrack(tracks)
    if (!track) return null
    const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`
    const capRes = await fetch(url, { credentials: 'include' })
    if (!capRes.ok) return null
    let capJson: unknown
    try {
      capJson = await capRes.json()
    } catch {
      return null
    }
    const segments = parseJson3(capJson)
    if (!segments.length) return null
    const meta: VideoMeta = {
      videoId,
      title: pr?.videoDetails?.title ?? '',
      durationSec: Number(pr?.videoDetails?.lengthSeconds ?? 0),
    }
    return { segments, meta }
  } catch {
    return null
  }
}
