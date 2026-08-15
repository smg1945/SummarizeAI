import { useCallback, useEffect, useState } from 'react'
import { fetchTranscript } from './transcript'
import { SummaryTab } from './components/SummaryTab'
import { ChaptersTab } from './components/ChaptersTab'
import { ChatTab } from './components/ChatTab'
import { SettingsView } from './components/SettingsView'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'
import type { TranscriptSegment, VideoMeta } from '../shared/types'

export type TabKey = 'summary' | 'chapters' | 'chat'

export interface TabProps {
  transcript: TranscriptSegment[]
  meta: VideoMeta
}

export function Panel({ videoId }: { videoId: string }) {
  const [tab, setTab] = useState<TabKey>('summary')
  const [connected, setConnected] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [data, setData] = useState<{ segments: TranscriptSegment[]; meta: VideoMeta } | null>(null)
  const [loading, setLoading] = useState(true)

  const checkConnection = useCallback(() => {
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => setConnected(res?.connected ?? false))
  }, [])

  useEffect(() => {
    checkConnection()
  }, [videoId, checkConnection])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    fetchTranscript(videoId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
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
      {showSettings ? (
        <div className="body">
          <SettingsView onSaved={checkConnection} />
        </div>
      ) : (
        <>
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="body">
            {loading ? (
              <span className="muted">자막을 불러오는 중...</span>
            ) : !data ? (
              <span className="muted">이 영상은 자막이 없어 요약할 수 없습니다.</span>
            ) : (
              <>
                <div style={{ display: tab === 'summary' ? undefined : 'none' }}>
                  <SummaryTab transcript={data.segments} meta={data.meta} />
                </div>
                <div style={{ display: tab === 'chapters' ? undefined : 'none' }}>
                  <ChaptersTab transcript={data.segments} meta={data.meta} />
                </div>
                <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
                  <ChatTab transcript={data.segments} meta={data.meta} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
