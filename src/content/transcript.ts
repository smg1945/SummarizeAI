import type { TranscriptSegment, VideoMeta } from '../shared/types'

export interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string // 'asr'이면 자동생성
}

interface PlayerResponse {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
  videoDetails?: { title?: string; lengthSeconds?: string }
}

// watch HTML의 자막 URL은 pot(proof-of-origin) 토큰 없이는 빈 응답을 주므로,
// InnerTube player API(ANDROID 클라이언트)로 pot 불필요한 자막 URL을 얻는다
async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'ko' },
      },
      videoId,
    }),
  })
  if (!res.ok) return null
  return (await res.json()) as PlayerResponse
}

export function toJson3Url(baseUrl: string): string {
  const url = new URL(baseUrl, 'https://www.youtube.com')
  url.searchParams.set('fmt', 'json3')
  return url.toString()
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
    const pr = await fetchPlayerResponse(videoId)
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) return null
    const track = pickCaptionTrack(tracks)
    if (!track) return null
    const capRes = await fetch(toJson3Url(track.baseUrl))
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
