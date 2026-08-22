import type { TranscriptSegment, VideoMeta } from '../shared/types'

export interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string // 'asr'이면 자동생성
}

interface PlayerResponse {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
  videoDetails?: { title?: string; lengthSeconds?: string }
  playabilityStatus?: { status?: string }
}

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'

async function postPlayer(
  context: unknown,
  videoId: string,
  init: RequestInit = {},
): Promise<PlayerResponse | null> {
  const res = await fetch(PLAYER_URL, {
    method: 'POST',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify({ context, videoId }),
  })
  if (!res.ok) return null
  return (await res.json()) as PlayerResponse
}

// watch HTML의 자막 URL은 비로그인 상태에서 pot(proof-of-origin) 토큰 없이는 빈 응답을 주므로,
// InnerTube player API(ANDROID 클라이언트)로 pot 불필요한 자막 URL을 얻는다
function fetchAnonymousPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  return postPlayer(
    { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'ko' } },
    videoId,
  )
}

function getCookie(name: string): string | null {
  const m = new RegExp(`(?:^|; )${name}=([^;]+)`).exec(document.cookie)
  return m ? m[1] : null
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// 연령 제한 등으로 비로그인 클라이언트가 거부되면, 현재 로그인 세션(쿠키 + SAPISIDHASH)으로
// WEB 클라이언트에 재요청한다. 로그인 세션에서는 자막 URL도 pot 없이 동작한다.
async function fetchAuthenticatedPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  const sapisid = getCookie('SAPISID') ?? getCookie('__Secure-3PAPISID')
  if (!sapisid) return null
  const origin = 'https://www.youtube.com'
  const ts = Math.floor(Date.now() / 1000)
  const hash = await sha1Hex(`${ts} ${sapisid} ${origin}`)
  return postPlayer(
    { client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'ko' } },
    videoId,
    {
      credentials: 'include',
      headers: { Authorization: `SAPISIDHASH ${ts}_${hash}`, 'X-Origin': origin },
    },
  )
}

function getTracks(pr: PlayerResponse | null): CaptionTrack[] | undefined {
  return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
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

export type TranscriptFailureReason =
  | 'no_captions' // 영상에 자막 트랙이 없음
  | 'login_required' // 연령 제한 등으로 로그인이 필요한데 로그인 세션이 없음
  | 'unavailable' // 비공개/삭제/재생 불가 영상
  | 'caption_fetch_failed' // 자막 트랙은 있으나 본문을 받지 못함
  | 'network' // 요청 자체가 실패

export type TranscriptResult =
  | { ok: true; segments: TranscriptSegment[]; meta: VideoMeta }
  | { ok: false; reason: TranscriptFailureReason }

export function transcriptErrorMessage(reason: TranscriptFailureReason): string {
  switch (reason) {
    case 'no_captions':
      return '이 영상은 자막이 없어 요약할 수 없습니다.'
    case 'login_required':
      return '연령 제한 영상입니다. 유튜브에 로그인하면 요약할 수 있습니다.'
    case 'unavailable':
      return '재생할 수 없는 영상이라 자막을 가져올 수 없습니다.'
    case 'caption_fetch_failed':
      return '자막을 받아오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
    case 'network':
      return '네트워크 오류로 자막을 불러오지 못했습니다.'
  }
}

const fail = (reason: TranscriptFailureReason): TranscriptResult => ({ ok: false, reason })

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    let pr = await fetchAnonymousPlayerResponse(videoId)
    let authenticated = false
    const status = pr?.playabilityStatus?.status
    if (!getTracks(pr)?.length && status === 'LOGIN_REQUIRED') {
      pr = await fetchAuthenticatedPlayerResponse(videoId)
      if (!pr) return fail('login_required')
      authenticated = true
    }
    const tracks = getTracks(pr)
    if (!tracks?.length) {
      const finalStatus = pr?.playabilityStatus?.status
      if (finalStatus === 'LOGIN_REQUIRED') return fail('login_required')
      if (finalStatus && finalStatus !== 'OK') return fail('unavailable')
      return fail('no_captions')
    }
    const track = pickCaptionTrack(tracks)
    if (!track) return fail('no_captions')
    const capRes = await fetch(
      toJson3Url(track.baseUrl),
      authenticated ? { credentials: 'include' } : undefined,
    )
    if (!capRes.ok) return fail('caption_fetch_failed')
    let capJson: unknown
    try {
      capJson = await capRes.json()
    } catch {
      return fail('caption_fetch_failed')
    }
    const segments = parseJson3(capJson)
    if (!segments.length) return fail('caption_fetch_failed')
    const meta: VideoMeta = {
      videoId,
      title: pr?.videoDetails?.title ?? '',
      durationSec: Number(pr?.videoDetails?.lengthSeconds ?? 0),
    }
    return { ok: true, segments, meta }
  } catch {
    return fail('network')
  }
}
