import { useCallback, useEffect, useState } from 'react'
import { fetchTranscript, transcriptErrorMessage, type TranscriptFailureReason } from './transcript'
import { SummaryTab } from './components/SummaryTab'
import { ChaptersTab } from './components/ChaptersTab'
import { ChatTab } from './components/ChatTab'
import { SettingsView } from './components/SettingsView'
import type { GetCachedResponse, RuntimeRequest, RuntimeResponse } from '../shared/messages'
import type { TranscriptSegment, VideoMeta } from '../shared/types'

export type TabKey = 'summary' | 'chapters' | 'chat'

export interface TabProps {
  transcript: TranscriptSegment[]
  meta: VideoMeta
}

const EMPTY_CACHE: GetCachedResponse = { summary: null, chapters: null, chat: null }

export function Panel({ videoId }: { videoId: string }) {
  const [tab, setTab] = useState<TabKey>('summary')
  const [connected, setConnected] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [data, setData] = useState<{ segments: TranscriptSegment[]; meta: VideoMeta } | null>(null)
  const [error, setError] = useState<TranscriptFailureReason | null>(null)
  const [loading, setLoading] = useState(true)
  const [cached, setCached] = useState<GetCachedResponse | null>(null)

  const checkConnection = useCallback(() => {
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => setConnected(res?.connected ?? false))
  }, [])

  useEffect(() => {
    checkConnection()
  }, [videoId, checkConnection])

  // 이전에 생성한 요약/챕터/채팅 내역을 복원한다
  useEffect(() => {
    let cancelled = false
    setCached(null)
    const req: RuntimeRequest = { kind: 'getCached', videoId }
    chrome.runtime.sendMessage(req, (res: GetCachedResponse) => {
      if (!cancelled) setCached(res ?? EMPTY_CACHE)
    })
    return () => {
      cancelled = true
    }
  }, [videoId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setError(null)
    fetchTranscript(videoId)
      .then((result) => {
        if (cancelled) return
        if (result.ok) setData({ segments: result.segments, meta: result.meta })
        else setError(result.reason)
      })
      .catch(() => {
        if (!cancelled) setError('network')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [videoId])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '요약' },
    { key: 'chapters', label: '챕터' },
    { key: 'chat', label: '채팅' },
  ]

  return (
    <div className="panel">
      <div className="header">
        <span className={`status-dot${connected ? ' connected' : ''}`} title={connected ? 'LLM 연결됨' : 'LLM 연결 안 됨'} />
        <span className="header-title">SummarizeAI</span>
        <button
          className={`icon-btn${showSettings ? ' active' : ''}`}
          title="설정"
          onClick={() => setShowSettings((s) => !s)}
        >
          ⚙
        </button>
      </div>
      {/* 설정 화면은 display 토글로 전환 — 탭을 언마운트하면 진행 중인 내역이 사라진다 */}
      <div className="body" style={{ display: showSettings ? undefined : 'none' }}>
        <SettingsView onSaved={checkConnection} />
      </div>
      <div style={{ display: showSettings ? 'none' : undefined }}>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="body">
          {loading || cached === null ? (
            <span className="muted">자막을 불러오는 중...</span>
          ) : !data ? (
            <span className="muted">{transcriptErrorMessage(error ?? 'no_captions')}</span>
          ) : (
            <>
              <div style={{ display: tab === 'summary' ? undefined : 'none' }}>
                <SummaryTab
                  transcript={data.segments}
                  meta={data.meta}
                  initialText={cached.summary ?? undefined}
                />
              </div>
              <div style={{ display: tab === 'chapters' ? undefined : 'none' }}>
                <ChaptersTab
                  transcript={data.segments}
                  meta={data.meta}
                  initialChapters={cached.chapters ?? undefined}
                />
              </div>
              <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
                <ChatTab
                  transcript={data.segments}
                  meta={data.meta}
                  active={tab === 'chat'}
                  videoId={videoId}
                  initialHistory={cached.chat ?? undefined}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
